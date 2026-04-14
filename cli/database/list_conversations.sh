#!/bin/bash
set -e

show_help() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

List all conversations ordered by most recent.

Options:
  --limit N      Max number of conversations to show (default: all)
  --search TEXT  Filter conversations by title (case-insensitive)
  -h, --help     Show this help message
EOF
}

LIMIT=""
SEARCH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) show_help; exit 0 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --search) SEARCH="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; show_help; exit 1 ;;
  esac
done

QUERY="SELECT id, title, updated_at FROM conversations"

if [ -n "$SEARCH" ]; then
  QUERY="$QUERY WHERE title ILIKE '%${SEARCH}%'"
fi

QUERY="$QUERY ORDER BY updated_at DESC"

if [ -n "$LIMIT" ]; then
  QUERY="$QUERY LIMIT $LIMIT"
fi

docker exec task_agents_db psql -U taskagents -d taskagents -c "$QUERY;"
