#!/bin/bash
set -e

show_help() {
  cat <<EOF
Usage: $(basename "$0") --id <conversation_id> [OPTIONS]

Delete a conversation and all its messages.

Options:
  --id    ID     Conversation UUID (required)
  --force        Skip confirmation prompt
  -h, --help     Show this help message

Example:
  $(basename "$0") --id 33f4d770-2b25-47ab-b36d-5844797c7257
  $(basename "$0") --id 33f4d770-... --force
EOF
}

ID=""
FORCE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) show_help; exit 0 ;;
    --id) ID="$2"; shift 2 ;;
    --force) FORCE=true; shift ;;
    *) echo "Unknown option: $1"; show_help; exit 1 ;;
  esac
done

if [ -z "$ID" ]; then
  echo "Error: --id is required"
  echo ""
  show_help
  exit 1
fi

if [ "$FORCE" != true ]; then
  read -p "Delete conversation $ID and all its messages? (y/N) " confirm
  if [ "$confirm" != "y" ]; then
    echo "Aborted."
    exit 0
  fi
fi

docker exec task_agents_db psql -U taskagents -d taskagents -c \
  "DELETE FROM conversations WHERE id = '$ID';"

echo "Deleted conversation $ID (messages cascade-deleted)"
