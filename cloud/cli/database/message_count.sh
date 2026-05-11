#!/usr/bin/env bash
# Show message count per conversation.
set -euo pipefail

ENV="local"
LIMIT=""

usage() {
  cat <<EOF
Show message count per conversation (most recent first).

Usage:
  $(basename "$0") [options]

Options:
  -e, --env ENV    Target environment: local | prod  (default: $ENV)
  -l, --limit N    Max rows to show
  -h, --help       Show this help and exit
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--env)   ENV="$2"; shift 2 ;;
    -l|--limit) LIMIT="$2"; shift 2 ;;
    -h|--help)  usage; exit 0 ;;
    *) echo "error: unknown arg '$1'" >&2; usage; exit 1 ;;
  esac
done

# shellcheck disable=SC1090
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
resolve_psql "$ENV"

QUERY="SELECT c.title, COUNT(m.id) AS messages
FROM conversations c
LEFT JOIN messages m ON m.conversation_id = c.id
GROUP BY c.id, c.title
ORDER BY c.updated_at DESC"
if [[ -n "$LIMIT" ]]; then
  QUERY="$QUERY LIMIT $LIMIT"
fi

"${PSQL[@]}" -c "$QUERY;"
