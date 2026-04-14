#!/bin/bash
set -e

show_help() {
  cat <<EOF
Usage: $(basename "$0") --id <conversation_id> [OPTIONS]

View messages for a conversation.

Options:
  --id    ID     Conversation UUID (required)
  --full         Show full message content (default: first 100 chars)
  --limit N      Max number of messages to show (default: all)
  --role  ROLE   Filter by role: user, assistant, system
  -h, --help     Show this help message

Example:
  $(basename "$0") --id 33f4d770-2b25-47ab-b36d-5844797c7257
  $(basename "$0") --id 33f4d770-... --role user --limit 5
EOF
}

ID=""
FULL=false
LIMIT=""
ROLE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) show_help; exit 0 ;;
    --id) ID="$2"; shift 2 ;;
    --full) FULL=true; shift ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --role) ROLE="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; show_help; exit 1 ;;
  esac
done

if [ -z "$ID" ]; then
  echo "Error: --id is required"
  echo ""
  show_help
  exit 1
fi

if [ "$FULL" = true ]; then
  CONTENT_COL="content"
else
  CONTENT_COL="LEFT(content, 100) AS content_preview"
fi

QUERY="SELECT role, $CONTENT_COL, created_at FROM messages WHERE conversation_id = '$ID'"

if [ -n "$ROLE" ]; then
  QUERY="$QUERY AND role = '$ROLE'"
fi

QUERY="$QUERY ORDER BY created_at"

if [ -n "$LIMIT" ]; then
  QUERY="$QUERY LIMIT $LIMIT"
fi

docker exec task_agents_db psql -U taskagents -d taskagents -c "$QUERY;"
