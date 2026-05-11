#!/usr/bin/env bash
# Show database and table sizes.
set -euo pipefail

ENV="local"

usage() {
  cat <<EOF
Show database and per-table sizes.

Usage:
  $(basename "$0") [options]

Options:
  -e, --env ENV    Target environment: local | prod  (default: $ENV)
  -h, --help       Show this help and exit
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--env)  ENV="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown arg '$1'" >&2; usage; exit 1 ;;
  esac
done

# shellcheck disable=SC1090
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
resolve_psql "$ENV"

"${PSQL[@]}" -c "
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;

SELECT s.relname AS table_name,
       pg_size_pretty(pg_total_relation_size(s.relid)) AS total_size,
       s.n_live_tup AS row_count
FROM pg_stat_user_tables s
ORDER BY pg_total_relation_size(s.relid) DESC;
"
