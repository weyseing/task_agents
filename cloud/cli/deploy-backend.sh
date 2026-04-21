#!/usr/bin/env bash
# Deploy backend to Cloud Run with free-tier-safe settings.
set -euo pipefail

SERVICE="task-agents-backend"
PROJECT="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-us-central1}"
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
  docker compose exec task_agents_cloud bash cloud/cli/deploy-backend.sh --name my-svc
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

echo "[deploy] service  = $SERVICE"
echo "[deploy] project  = $PROJECT"
echo "[deploy] region   = $REGION"
echo "[deploy] source   = $SOURCE_DIR"
echo "[deploy] scaling  = min=$MIN_INSTANCES max=$MAX_INSTANCES conc=$CONCURRENCY"
echo "[deploy] resource = cpu=$CPU mem=$MEMORY"
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
  --quiet

URL=$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT" --region "$REGION" \
  --format='value(status.url)')

echo
echo "[deploy] ✓ done"
echo "[deploy] url = $URL"
