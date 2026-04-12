#!/bin/sh
set -e

echo "Starting Task Agents frontend..."

exec nginx -g "daemon off;"
