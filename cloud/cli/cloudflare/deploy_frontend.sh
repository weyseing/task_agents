#!/usr/bin/env bash
# Deploy the frontend (Vite static bundle) to Cloudflare Pages.
set -euo pipefail

ENV_PROD="/workspace/envs/.env.prod"
FRONTEND_SRC="/workspace/frontend"
BUILD_DIR="/tmp/frontend-build"

PROJECT="${CLOUDFLARE_PAGES_PROJECT:-}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
API_URL=""
BRANCH="main"

usage() {
  cat <<EOF
Deploy the frontend to Cloudflare Pages.

Builds Vite with VITE_API_URL baked in, then uploads dist/ via wrangler.

Usage:
  $(basename "$0") [options]

Options:
  -u, --api-url URL      VITE_API_URL to bake into bundle  (default: from .env.prod)
  -p, --project NAME     Cloudflare Pages project name     (default: \$CLOUDFLARE_PAGES_PROJECT)
  -b, --branch NAME      Pages deployment branch label     (default: $BRANCH)
  -h, --help             Show this help and exit

Run inside the cloud container:
  docker compose exec task_agents_cloud bash cloudflare/deploy_frontend.sh
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -u|--api-url) API_URL="$2";  shift 2 ;;
    -p|--project) PROJECT="$2";  shift 2 ;;
    -b|--branch)  BRANCH="$2";   shift 2 ;;
    -h|--help)    usage; exit 0 ;;
    *) echo "error: unknown arg '$1'" >&2; usage; exit 1 ;;
  esac
done

# Resolve VITE_API_URL: --api-url > .env.prod
# Don't fall back to $VITE_API_URL env — compose loads .env.local into the container,
# which would leak the dev URL (http://localhost:...) into the prod bundle.
if [[ -z "$API_URL" && -f "$ENV_PROD" ]]; then
  API_URL=$(grep -E '^VITE_API_URL=' "$ENV_PROD" | head -1 | cut -d= -f2- || true)
fi

# Sanity checks
[[ -z "$API_TOKEN" ]]  && { echo "error: CLOUDFLARE_API_TOKEN not set (check .env.local)" >&2; exit 1; }
[[ -z "$ACCOUNT_ID" ]] && { echo "error: CLOUDFLARE_ACCOUNT_ID not set (check .env.local)" >&2; exit 1; }
[[ -z "$PROJECT" ]]    && { echo "error: --project or CLOUDFLARE_PAGES_PROJECT required" >&2; exit 1; }
[[ -z "$API_URL" ]]    && { echo "error: --api-url or VITE_API_URL in .env.prod required" >&2; exit 1; }
[[ ! -d "$FRONTEND_SRC" ]] && { echo "error: $FRONTEND_SRC not mounted" >&2; exit 1; }

echo "[deploy] project = $PROJECT"
echo "[deploy] branch  = $BRANCH"
echo "[deploy] api_url = $API_URL"
echo

# Copy to a writable tmp dir — host /workspace/frontend is mounted :ro.
echo "[deploy] copying source to $BUILD_DIR…"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cp -R "$FRONTEND_SRC/." "$BUILD_DIR/"
# Drop host-built node_modules so npm ci is clean in this image's Node version.
rm -rf "$BUILD_DIR/node_modules" "$BUILD_DIR/dist"

echo "[deploy] installing deps (npm ci)…"
(cd "$BUILD_DIR" && npm ci)

echo "[deploy] building (vite build, VITE_API_URL=$API_URL)…"
(cd "$BUILD_DIR" && VITE_API_URL="$API_URL" npm run build)

[[ ! -d "$BUILD_DIR/dist" ]] && { echo "error: build did not produce $BUILD_DIR/dist" >&2; exit 1; }

# Create the Pages project if it doesn't exist yet (first deploy).
# wrangler reads CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID from the env.
# Output is a Unicode box-drawing table: "│ task-agents-web │ ..." — grep -F
# substring match with surrounding spaces avoids partial matches and Unicode
# regex pitfalls.
if ! wrangler pages project list 2>/dev/null | grep -qF " ${PROJECT} "; then
  echo "[deploy] creating Pages project '$PROJECT' (first-time setup)…"
  wrangler pages project create "$PROJECT" --production-branch "$BRANCH"
fi

echo "[deploy] uploading to Cloudflare Pages…"
wrangler pages deploy "$BUILD_DIR/dist" \
  --project-name "$PROJECT" \
  --branch "$BRANCH" \
  --commit-dirty=true

echo
echo "[deploy] ✓ done"
echo "[deploy] visit https://${PROJECT}.pages.dev (or the deployment URL printed above)"
