#!/usr/bin/env bash
# Smoke-test a deployed Cloud Run backend.
#
# Checks:
#   1. GET  /health              — app is alive
#   2. GET  /api/conversations   — DB is reachable (returns JSON array)
#   3. POST /api/chat            — LLM + SSE streaming + tool loop works
#
# Auto-resolves the service URL via gcloud if --url is omitted.
# Service name is hardcoded; region/project come from env (.env).
set -euo pipefail

SERVICE="task-agents-backend"
URL=""
PROMPT="say hi in exactly three words"

# Colors — disabled if stdout is not a terminal (CI-friendly).
if [[ -t 1 ]]; then
  GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; YEL=$'\033[0;33m'
  DIM=$'\033[2m';      BOLD=$'\033[1m';   RESET=$'\033[0m'
else
  GREEN=; RED=; YEL=; DIM=; BOLD=; RESET=
fi

usage() {
  cat <<EOF
Smoke-test a deployed Cloud Run backend.

Usage:
  $(basename "$0") [options]

Options:
  -u, --url URL          Service base URL (auto-resolved via gcloud if omitted)
  -m, --message TEXT     Chat prompt to send       (default: "$PROMPT")
  -h, --help             Show this help and exit

Examples:
  $(basename "$0")
  $(basename "$0") --url https://task-agents-backend-xxx-as.a.run.app
  $(basename "$0") --message "what day is it?"
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -u|--url)     URL="$2";    shift 2 ;;
    -m|--message) PROMPT="$2"; shift 2 ;;
    -h|--help)    usage; exit 0 ;;
    *) echo "error: unknown arg '$1'" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$URL" ]]; then
  REGION="${GCP_REGION:-asia-southeast1}"
  PROJECT="${GCP_PROJECT_ID:-}"
  [[ -z "$PROJECT" ]] && { echo "${RED}error:${RESET} --url or GCP_PROJECT_ID required" >&2; exit 1; }
  URL=$(gcloud run services describe "$SERVICE" \
    --project="$PROJECT" --region="$REGION" \
    --format="value(status.url)" 2>/dev/null)
  [[ -z "$URL" ]] && { echo "${RED}error:${RESET} could not resolve URL for '$SERVICE' in $REGION" >&2; exit 1; }
fi

echo "${BOLD}[check]${RESET} url     = $URL"
echo "${BOLD}[check]${RESET} prompt  = $PROMPT"
echo

PASS=0
FAIL=0
ok()   { echo "      ${GREEN}✓${RESET} $*"; PASS=$((PASS+1)); }
fail() { echo "      ${RED}✗${RESET} $*"; FAIL=$((FAIL+1)); }

# 1. /health ------------------------------------------------------------------
echo "${YEL}[1/3]${RESET} GET  /health"
BODY=$(curl -sS -m 15 -o - -w "\n%{http_code}" "$URL/health" || echo $'\n000')
CODE="${BODY##*$'\n'}"
BODY="${BODY%$'\n'*}"
if [[ "$CODE" == "200" && "$BODY" == *'"status"'*'"ok"'* ]]; then
  ok "$CODE $BODY"
else
  fail "$CODE $BODY"
fi

# 2. /api/conversations -------------------------------------------------------
echo "${YEL}[2/3]${RESET} GET  /api/conversations ${DIM}(tests DB connectivity)${RESET}"
BODY=$(curl -sS -m 15 -o - -w "\n%{http_code}" "$URL/api/conversations" || echo $'\n000')
CODE="${BODY##*$'\n'}"
BODY="${BODY%$'\n'*}"
if [[ "$CODE" == "200" && "$BODY" == \[* ]]; then
  COUNT=$(echo "$BODY" | grep -o '"id"' | wc -l | tr -d ' ')
  ok "$CODE — $COUNT conversation(s)"
else
  fail "$CODE $BODY"
fi

# 3. /api/chat (SSE) ----------------------------------------------------------
echo "${YEL}[3/3]${RESET} POST /api/chat ${DIM}(streams Haiku 4.5)${RESET}"
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
curl -sS -N -m 60 -X POST "$URL/api/chat" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":$(printf '%s' "$PROMPT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}" \
  >"$TMP" 2>&1 || true

if grep -q '"done": true' "$TMP" || grep -q '"done":true' "$TMP"; then
  CONV_ID=$(grep -o '"conversation_id": "[^"]*"' "$TMP" | head -1 | cut -d'"' -f4)
  CHUNKS=$(grep -c '"content"' "$TMP" || true)
  REPLY=$(grep -oE '"content": "[^"]*"' "$TMP" | cut -d'"' -f4 | tr -d '\n')
  ok "conversation_id=$CONV_ID chunks=$CHUNKS"
  echo "        ${DIM}reply:${RESET} \"$REPLY\""
else
  fail "no done event — first 500 chars:"
  head -c 500 "$TMP" | sed "s/^/        ${DIM}/; s/\$/${RESET}/"
  echo
fi

echo
if [[ "$FAIL" -eq 0 ]]; then
  echo "${GREEN}${BOLD}[check] passed=$PASS failed=$FAIL${RESET}"
else
  echo "${RED}${BOLD}[check] passed=$PASS failed=$FAIL${RESET}"
  exit 1
fi
