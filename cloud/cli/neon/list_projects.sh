#!/usr/bin/env bash
# List Neon projects on this account.
set -euo pipefail

usage() {
  cat <<EOF
List all Neon projects on the account associated with NEON_API_KEY.

Usage:
  $(basename "$0") [--json]

Options:
  --json       Emit raw JSON instead of the table view
  -h, --help   Show this help and exit
EOF
}

FORMAT="table"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)    FORMAT="json"; shift ;;
    -h|--help) usage; exit 0 ;;
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

neonctl projects list --org-id "$ORG_ID" --output "$FORMAT"
