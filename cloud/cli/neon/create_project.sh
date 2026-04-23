#!/usr/bin/env bash
# Create a Neon project (free tier) and print its connection string.
set -euo pipefail

NAME="task-agents"
REGION="aws-ap-southeast-1"
DATABASE="neondb"

usage() {
  cat <<EOF
Create a new Neon project and print the connection string to paste into .env.

Usage:
  $(basename "$0") [options]

Options:
  -n, --name NAME      Neon project name        (default: $NAME)
  -r, --region REGION  Region id                (default: $REGION)
                       e.g. aws-us-east-1, aws-eu-central-1, aws-ap-southeast-1
  -d, --database DB    Initial database name    (default: $DATABASE)
  -h, --help           Show this help and exit

Requires NEON_API_KEY env var (set in .env).

Run inside the cloud container:
  docker compose exec task_agents_cloud bash neon/create_project.sh --name my-proj
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--name)     NAME="$2";     shift 2 ;;
    -r|--region)   REGION="$2";   shift 2 ;;
    -d|--database) DATABASE="$2"; shift 2 ;;
    -h|--help)     usage; exit 0 ;;
    *) echo "error: unknown arg '$1'" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "${NEON_API_KEY:-}" ]]; then
  echo "error: NEON_API_KEY env var required" >&2
  exit 1
fi

ORG_ID="${NEON_ORG_ID:-$(neonctl orgs list --output json | jq -r '.[0].id')}"
if [[ -z "$ORG_ID" || "$ORG_ID" == "null" ]]; then
  echo "error: could not resolve a Neon org — set NEON_ORG_ID" >&2
  exit 1
fi

echo "[neon] creating project '$NAME' in $REGION (org=$ORG_ID) ..."
PROJECT_JSON=$(neonctl projects create \
  --name "$NAME" \
  --region-id "$REGION" \
  --org-id "$ORG_ID" \
  --output json)

PROJECT_ID=$(echo "$PROJECT_JSON" | jq -r '.project.id')
echo "[neon] project id = $PROJECT_ID"

CONN=$(neonctl connection-string \
  --project-id "$PROJECT_ID" \
  --database-name "$DATABASE")

echo
echo "[neon] ✓ done"
echo "[neon] DATABASE_URL=$CONN"
echo
echo "Paste the line above into your .env (and Cloud Run env)."
