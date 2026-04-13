#!/bin/bash
# Remove an Ollama model

show_help() {
  echo "Usage: $0 --name <model>"
  echo ""
  echo "Remove a downloaded model."
  echo ""
  echo "Options:"
  echo "  --name    Model name (e.g. gemma4:e4b)"
  echo "  --help    Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0 --name gemma4:e4b"
}

NAME=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --name) NAME="$2"; shift 2 ;;
    --help) show_help; exit 0 ;;
    *) echo "Unknown option: $1"; show_help; exit 1 ;;
  esac
done

if [ -z "$NAME" ]; then
  echo "Error: --name is required"
  show_help
  exit 1
fi

ollama rm "$NAME"
