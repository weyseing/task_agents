#!/usr/bin/env bash
# Open an interactive psql shell against a Neon project.
set -euo pipefail

NAME="task-agents"
DATABASE="neondb"

usage() {
  cat <<EOF
Open an interactive psql shell to a Neon project.

Usage:
  $(basename "$0") [options]

Options:
  -n, --name NAME      Neon project name      (default: $NAME)
  -d, --database DB    Database name          (default: $DATABASE)
  -h, --help           Show this help and exit

Requires NEON_API_KEY env var.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--name)     NAME="$2";     shift 2 ;;
    -d|--database) DATABASE="$2"; shift 2 ;;
    -h|--help)     usage; exit 0 ;;
    *) echo "error: unknown arg '$1'" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "${NEON_API_KEY:-}" ]]; then
  echo "error: NEON_API_KEY env var required" >&2
  exit 1
fi

ORG_ID="${NEON_ORG_ID:-$(neonctl orgs list --output json | jq -r '.[0].id')}"
if [[ -z "$ORG_ID" || "$ORG_ID" == "null" ]]; then
  echo "error: could not resolve a Neon org — set NEON_ORG_ID" >&2
  exit 1
fi

PROJECT_ID=$(neonctl projects list --org-id "$ORG_ID" --output json \
  | jq -r --arg n "$NAME" '.[] | select(.name == $n) | .id' \
  | head -n 1)

if [[ -z "$PROJECT_ID" ]]; then
  echo "error: no Neon project named '$NAME'" >&2
  exit 1
fi

CONN=$(neonctl connection-string \
  --project-id "$PROJECT_ID" \
  --database-name "$DATABASE")

exec psql "$CONN"
