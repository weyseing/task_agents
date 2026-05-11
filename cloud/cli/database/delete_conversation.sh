#!/usr/bin/env bash
# Delete a conversation and its messages.
set -euo pipefail

ENV="local"
ID=""
FORCE=0

usage() {
  cat <<EOF
Delete a conversation and all its messages.

Usage:
  $(basename "$0") --id <conversation_id> [options]

Options:
  -e, --env ENV   Target environment: local | prod  (default: $ENV)
  -i, --id ID     Conversation UUID (required)
  -f, --force     Skip confirmation prompt
  -h, --help      Show this help and exit
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--env)   ENV="$2"; shift 2 ;;
    -i|--id)    ID="$2"; shift 2 ;;
    -f|--force) FORCE=1; shift ;;
    -h|--help)  usage; exit 0 ;;
    *) echo "error: unknown arg '$1'" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$ID" ]]; then
  echo "error: --id is required" >&2
  usage
  exit 1
fi

# shellcheck disable=SC1090
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
resolve_psql "$ENV"

if [[ "$FORCE" != "1" ]]; then
  if [[ "$ENV" == "prod" ]]; then
    echo "[PROD] About to delete conversation $ID from production." >&2
  fi
  read -r -p "Delete conversation $ID and its messages? (y/N) " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi
fi

SAFE_ID=${ID//\'/\'\'}
"${PSQL[@]}" -c "DELETE FROM conversations WHERE id = '$SAFE_ID';"
echo "Deleted conversation $ID (messages cascade-deleted)"
