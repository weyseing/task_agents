#!/usr/bin/env bash
# List conversations, most recent first.
set -euo pipefail

ENV="local"
LIMIT=""
SEARCH=""

usage() {
  cat <<EOF
List conversations ordered by most recent.

Usage:
  $(basename "$0") [options]

Options:
  -e, --env ENV       Target environment: local | prod  (default: $ENV)
  -l, --limit N       Max rows to show
  -s, --search TEXT   Filter titles (case-insensitive ILIKE)
  -h, --help          Show this help and exit
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--env)    ENV="$2"; shift 2 ;;
    -l|--limit)  LIMIT="$2"; shift 2 ;;
    -s|--search) SEARCH="$2"; shift 2 ;;
    -h|--help)   usage; exit 0 ;;
    *) echo "error: unknown arg '$1'" >&2; usage; exit 1 ;;
  esac
done

# shellcheck disable=SC1090
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
resolve_psql "$ENV"

QUERY="SELECT id, title, updated_at FROM conversations"
if [[ -n "$SEARCH" ]]; then
  # Escape single quotes in user-supplied SEARCH.
  SAFE=${SEARCH//\'/\'\'}
  QUERY="$QUERY WHERE title ILIKE '%${SAFE}%'"
fi
QUERY="$QUERY ORDER BY updated_at DESC"
if [[ -n "$LIMIT" ]]; then
  QUERY="$QUERY LIMIT $LIMIT"
fi

"${PSQL[@]}" -c "$QUERY;"
