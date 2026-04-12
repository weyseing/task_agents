#!/bin/sh
set -e

echo "Starting Task Agents frontend (dev)..."

exec npm run dev -- --host 0.0.0.0 --port 3000
