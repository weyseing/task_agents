#!/bin/bash
set -e

show_help() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Show database and table sizes.

Options:
  -h, --help   Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) show_help; exit 0 ;;
    *) echo "Unknown option: $1"; show_help; exit 1 ;;
  esac
done

docker exec task_agents_db psql -U taskagents -d taskagents -c \
  "SELECT pg_size_pretty(pg_database_size('taskagents')) AS db_size;

   SELECT s.relname AS table_name,
          pg_size_pretty(pg_total_relation_size(s.relid)) AS total_size,
          s.n_live_tup AS row_count
   FROM pg_stat_user_tables s
   ORDER BY pg_total_relation_size(s.relid) DESC;"
