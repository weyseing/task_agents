#!/bin/bash
set -e

show_help() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Show message count per conversation.

Options:
  --limit N    Max number of conversations to show (default: all)
  -h, --help   Show this help message
EOF
}

LIMIT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) show_help; exit 0 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; show_help; exit 1 ;;
  esac
done

QUERY="SELECT c.title, COUNT(m.id) AS messages
FROM conversations c
LEFT JOIN messages m ON m.conversation_id = c.id
GROUP BY c.id, c.title
ORDER BY c.updated_at DESC"

if [ -n "$LIMIT" ]; then
  QUERY="$QUERY LIMIT $LIMIT"
fi

docker exec task_agents_db psql -U taskagents -d taskagents -c "$QUERY;"
