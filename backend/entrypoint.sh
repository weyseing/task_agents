#!/bin/bash
set -e

echo "Starting Task Agents backend..."

PORT="${PORT:-8080}"
if [ "${DEV:-0}" = "1" ]; then
  exec uvicorn main:app --host 0.0.0.0 --port "$PORT" --reload
else
  exec uvicorn main:app --host 0.0.0.0 --port "$PORT"
fi
