#!/usr/bin/env bash
# Shared helpers for cloud/cli/database scripts. Sources OK; not executable.

# resolve_psql ENV
#   Populates the PSQL array with the right psql invocation:
#     local — talks to the task_agents_db service over the docker network
#     prod  — reads DATABASE_URL from /workspace/.env.prod
resolve_psql() {
  local env="${1:-local}"
  case "$env" in
    local)
      export PGPASSWORD="taskagents"
      PSQL=(psql -h task_agents_db -p 5432 -U taskagents -d taskagents)
      ;;
    prod)
      local f=/workspace/.env.prod
      if [[ ! -r "$f" ]]; then
        echo "error: $f not readable from this container" >&2
        return 1
      fi
      local url
      url=$(grep -E '^DATABASE_URL=' "$f" | head -1 | cut -d= -f2-)
      if [[ -z "$url" ]]; then
        echo "error: DATABASE_URL missing in $f" >&2
        return 1
      fi
      PSQL=(psql "$url")
      ;;
    *)
      echo "error: --env must be 'local' or 'prod' (got '$env')" >&2
      return 1
      ;;
  esac
}
