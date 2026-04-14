#!/bin/bash
set -e

show_help() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Open an interactive psql shell to the task_agents database.

Options:
  --host HOST    Database host (default: via docker exec)
  --port PORT    Database port (default: 5491)
  --user USER    Database user (default: taskagents)
  --db   DB      Database name (default: taskagents)
  -h, --help     Show this help message
EOF
}

HOST=""
PORT="5491"
USER="taskagents"
DB="taskagents"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) show_help; exit 0 ;;
    --host) HOST="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --user) USER="$2"; shift 2 ;;
    --db)   DB="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; show_help; exit 1 ;;
  esac
done

if [ -n "$HOST" ]; then
  psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB"
else
  docker exec -it task_agents_db psql -U "$USER" -d "$DB"
fi
