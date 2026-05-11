#!/usr/bin/env bash
# Open an interactive psql shell against the task_agents database.
set -euo pipefail

ENV="local"

usage() {
  cat <<EOF
Open an interactive psql shell to the task_agents database.

Usage:
  $(basename "$0") [options]

Options:
  -e, --env ENV    Target environment: local | prod  (default: $ENV)
  -h, --help       Show this help and exit

Run inside the cloud container:
  docker compose exec task_agents_cloud bash database/connect.sh
  docker compose exec task_agents_cloud bash database/connect.sh --env prod
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--env) ENV="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown arg '$1'" >&2; usage; exit 1 ;;
  esac
done

# shellcheck disable=SC1090
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
resolve_psql "$ENV"

if [[ "$ENV" == "prod" ]]; then
  echo "[db] connecting to PROD Neon — be careful." >&2
fi

exec "${PSQL[@]}"
