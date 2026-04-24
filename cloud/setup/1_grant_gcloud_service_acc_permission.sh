#!/usr/bin/env bash
# Grant roles/run.admin to the deploy service account.
#
# One-time bootstrap: the deploy SA ships with roles/editor, which does NOT
# include run.services.setIamPolicy. That means `gcloud run deploy
# --allow-unauthenticated` silently no-ops and the service stays 403.
# This script grants run.admin so future deploys can publish public services.
#
# Prereq: you must be authed as a user account (NOT the service account)
# with project owner / IAM admin. Run this first in your host terminal:
#
#   docker compose exec -it task_agents_cloud gcloud auth login --no-launch-browser
#
# Then execute:
#
#   docker compose exec -it task_agents_cloud bash setup/1_grant_gcloud_service_acc_permission.sh
set -euo pipefail

PROJECT="${GCP_PROJECT_ID:-}"
ROLE="roles/run.admin"

if [[ -z "$PROJECT" ]]; then
  echo "error: GCP_PROJECT_ID env var required" >&2
  exit 1
fi

SA="gcp-service@${PROJECT}.iam.gserviceaccount.com"

# Pick the first auth'd account that is NOT the service account.
USER_ACCOUNT=$(gcloud auth list --format="value(account)" 2>/dev/null \
  | grep -v "^${SA}$" | head -1 || true)

if [[ -z "$USER_ACCOUNT" ]]; then
  echo "error: no user account authenticated in this container." >&2
  echo "       run this first (in this same shell):" >&2
  echo "         gcloud auth login --no-launch-browser" >&2
  echo "       sign in as your project Owner account, paste the code, then re-run this script." >&2
  exit 1
fi

echo "[grant] running as   = $USER_ACCOUNT"
echo "[grant] project      = $PROJECT"
echo "[grant] service acc  = $SA"
echo "[grant] role         = $ROLE"
echo

gcloud projects add-iam-policy-binding "$PROJECT" \
  --account="$USER_ACCOUNT" \
  --member="serviceAccount:${SA}" \
  --role="$ROLE" \
  --condition=None \
  --quiet >/dev/null

echo "[grant] verifying..."
CURRENT=$(gcloud projects get-iam-policy "$PROJECT" \
  --account="$USER_ACCOUNT" \
  --flatten="bindings[].members" \
  --format="value(bindings.role)" \
  --filter="bindings.members:${SA}")

echo "$CURRENT" | sed 's/^/[grant]   /'

if echo "$CURRENT" | grep -qx "$ROLE"; then
  echo
  echo "[grant] ✓ $ROLE granted to $SA"
else
  echo
  echo "[grant] ✗ role not found after grant — inspect above output" >&2
  exit 1
fi

# Switch active account back to the service account so subsequent deploys
# exercise the SA's permissions (not the Owner's), matching future CI runs.
gcloud config set account "$SA" --quiet
echo "[grant] active account reverted to $SA"

# Revoke the Owner credentials so they don't linger in the container.
# Re-running this script will require gcloud auth login again.
gcloud auth revoke "$USER_ACCOUNT" --quiet 2>/dev/null || true
echo "[grant] revoked $USER_ACCOUNT — re-run gcloud auth login before next use"
