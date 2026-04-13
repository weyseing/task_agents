#!/bin/bash
# Check Ollama server and loaded models

show_help() {
  echo "Usage: $0"
  echo ""
  echo "Show Ollama server status and currently loaded models."
  echo ""
  echo "Options:"
  echo "  --help    Show this help message"
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --help) show_help; exit 0 ;;
    *) echo "Unknown option: $1"; show_help; exit 1 ;;
  esac
done

echo "=== Server ==="
if curl -s http://localhost:11434 > /dev/null 2>&1; then
  echo "Running on http://localhost:11434"
else
  echo "Not running. Start with: brew services start ollama"
  exit 1
fi

echo ""
echo "=== Loaded Models ==="
ollama ps
