#!/bin/bash
# List installed Ollama models

show_help() {
  echo "Usage: $0"
  echo ""
  echo "List all downloaded models."
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

ollama list
