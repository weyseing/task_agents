#!/usr/bin/env bash
set -e

KEY_FILE=/tmp/gcp-key.json

if [ -n "$GOOGLE_CREDENTIALS_JSON" ]; then
  printf '%s' "$GOOGLE_CREDENTIALS_JSON" > "$KEY_FILE"
  chmod 600 "$KEY_FILE"

  gcloud auth activate-service-account --key-file="$KEY_FILE" --quiet
  export GOOGLE_APPLICATION_CREDENTIALS="$KEY_FILE"

  [ -n "$GCP_PROJECT_ID" ] && gcloud config set project "$GCP_PROJECT_ID" --quiet
  [ -n "$GCP_REGION" ]     && gcloud config set run/region "$GCP_REGION" --quiet

  echo "[cloud] authenticated: $(gcloud config get-value account 2>/dev/null)"
  echo "[cloud] project:       $(gcloud config get-value project 2>/dev/null)"
  echo "[cloud] region:        $(gcloud config get-value run/region 2>/dev/null)"
else
  echo "[cloud] WARNING: GOOGLE_CREDENTIALS_JSON not set — gcloud not authenticated"
fi

exec "$@"
