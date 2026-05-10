#!/usr/bin/env bash
# Deploy backend to Cloud Run with free-tier-safe settings.
set -euo pipefail

SERVICE="task-agents-backend"
PROJECT="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-asia-southeast1}"
SOURCE_DIR="/workspace/backend"

# Free-tier monthly allowance (Cloud Run):
#   2M requests · 180k vCPU-sec · 360k GB-sec · 1 GB egress
# These settings keep us inside that envelope and cap any overage:
CPU=1
MEMORY=1Gi
CONCURRENCY=20        # req/instance — fewer instances = less GB-sec burn
MIN_INSTANCES=0       # scale-to-zero: no idle charge
MAX_INSTANCES=3       # hard cap on runaway scaling
TIMEOUT=3600          # 60-min (SSE streaming)

usage() {
  cat <<EOF
Deploy the backend to Cloud Run with free-tier-safe settings.

Usage:
  $(basename "$0") [options]

Options:
  -n, --name NAME        Cloud Run service name      (default: $SERVICE)
  -p, --project ID       GCP project id              (default: \$GCP_PROJECT_ID)
  -r, --region REGION    GCP region                  (default: $REGION)
  -s, --source DIR       Source directory to build   (default: $SOURCE_DIR)
  -h, --help             Show this help and exit

Run inside the cloud container:
  docker compose exec task_agents_cloud bash cloudrun/deploy_backend.sh --name my-svc
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--name)    SERVICE="$2";     shift 2 ;;
    -p|--project) PROJECT="$2";     shift 2 ;;
    -r|--region)  REGION="$2";      shift 2 ;;
    -s|--source)  SOURCE_DIR="$2";  shift 2 ;;
    -h|--help)    usage; exit 0 ;;
    *) echo "error: unknown arg '$1'" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$PROJECT" ]]; then
  echo "error: --project or GCP_PROJECT_ID env var required" >&2
  exit 1
fi

# Build the env-var payload for Cloud Run.
# Keys come from .env.example (schema/allowlist). Values come from .env.prod.
# Deploy-only keys in DENYLIST are skipped even if set in .env.prod.
ENV_EXAMPLE="/workspace/.env.example"
ENV_PROD="/workspace/.env.prod"
DENYLIST=(
  GCP_PROJECT_ID
  GCP_REGION
  GOOGLE_CREDENTIALS_JSON
  NEON_API_KEY
  NEON_ORG_ID
)

if [[ ! -f "$ENV_EXAMPLE" ]]; then
  echo "error: $ENV_EXAMPLE not found (is it mounted in docker-compose?)" >&2
  exit 1
fi
if [[ ! -f "$ENV_PROD" ]]; then
  echo "error: $ENV_PROD not found (is it mounted in docker-compose?)" >&2
  exit 1
fi

is_denied() {
  local k="$1"
  for d in "${DENYLIST[@]}"; do
    [[ "$k" == "$d" ]] && return 0
  done
  return 1
}

# Parse .env.prod into an associative array (split on first '=' only).
declare -A PROD_VALS
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" != *=* ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  PROD_VALS["$key"]="$val"
done < "$ENV_PROD"

if [[ -z "${PROD_VALS[DATABASE_URL]:-}" ]]; then
  echo "error: DATABASE_URL not set in .env.prod (Neon connection string)" >&2
  echo "       run neon/create_project.sh and paste the output into .env.prod" >&2
  exit 1
fi

ENV_PAIRS=()
INJECTED=()
while IFS= read -r key; do
  is_denied "$key" && continue
  val="${PROD_VALS[$key]:-}"
  [[ -z "$val" ]] && continue
  ENV_PAIRS+=("$key=$val")
  INJECTED+=("$key")
done < <(grep -oE '^[A-Z][A-Z0-9_]*=' "$ENV_EXAMPLE" | tr -d '=')

# Join with '##' so commas inside values (e.g. URLs) don't break gcloud parsing.
ENV_JOINED=$(printf '##%s' "${ENV_PAIRS[@]}")
ENV_JOINED="^##^${ENV_JOINED:2}"

echo "[deploy] service  = $SERVICE"
echo "[deploy] project  = $PROJECT"
echo "[deploy] region   = $REGION"
echo "[deploy] source   = $SOURCE_DIR"
echo "[deploy] scaling  = min=$MIN_INSTANCES max=$MAX_INSTANCES conc=$CONCURRENCY"
echo "[deploy] resource = cpu=$CPU mem=$MEMORY"
echo "[deploy] env      = ${INJECTED[*]}"
echo

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project="$PROJECT" \
  --quiet

gcloud run deploy "$SERVICE" \
  --source "$SOURCE_DIR" \
  --project "$PROJECT" \
  --region "$REGION" \
  --cpu "$CPU" \
  --memory "$MEMORY" \
  --concurrency "$CONCURRENCY" \
  --timeout "$TIMEOUT" \
  --min-instances "$MIN_INSTANCES" \
  --max-instances "$MAX_INSTANCES" \
  --cpu-throttling \
  --execution-environment=gen2 \
  --allow-unauthenticated \
  --set-env-vars="$ENV_JOINED" \
  --quiet

URL=$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT" --region "$REGION" \
  --format='value(status.url)')

echo
echo "[deploy] ✓ done"
echo "[deploy] url = $URL"
