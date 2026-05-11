#!/usr/bin/env bash
# View messages for a conversation.
set -euo pipefail

ENV="local"
ID=""
FULL=0
LIMIT=""
ROLE=""

usage() {
  cat <<EOF
View messages for a conversation.

Usage:
  $(basename "$0") --id <conversation_id> [options]

Options:
  -e, --env ENV    Target environment: local | prod  (default: $ENV)
  -i, --id ID      Conversation UUID (required)
  -f, --full       Show full content (default: first 100 chars)
  -l, --limit N    Max rows to show
  -r, --role ROLE  Filter by role: user | assistant | system | tool
  -h, --help       Show this help and exit
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--env)   ENV="$2"; shift 2 ;;
    -i|--id)    ID="$2"; shift 2 ;;
    -f|--full)  FULL=1; shift ;;
    -l|--limit) LIMIT="$2"; shift 2 ;;
    -r|--role)  ROLE="$2"; shift 2 ;;
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

if [[ "$FULL" == "1" ]]; then
  CONTENT_COL="content"
else
  CONTENT_COL="LEFT(content, 100) AS content_preview"
fi

# Single-quote-escape user inputs.
SAFE_ID=${ID//\'/\'\'}
QUERY="SELECT role, $CONTENT_COL, created_at FROM messages WHERE conversation_id = '$SAFE_ID'"
if [[ -n "$ROLE" ]]; then
  SAFE_ROLE=${ROLE//\'/\'\'}
  QUERY="$QUERY AND role = '$SAFE_ROLE'"
fi
QUERY="$QUERY ORDER BY created_at"
if [[ -n "$LIMIT" ]]; then
  QUERY="$QUERY LIMIT $LIMIT"
fi

"${PSQL[@]}" -c "$QUERY;"
