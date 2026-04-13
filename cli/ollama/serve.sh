#!/bin/bash
# Start Ollama as a background service

show_help() {
  echo "Usage: $0"
  echo ""
  echo "Start Ollama as a background service (auto-starts on boot)."
  echo "Use 'brew services stop ollama' to stop."
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

brew services start ollama
