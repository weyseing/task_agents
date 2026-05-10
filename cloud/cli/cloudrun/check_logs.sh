#!/usr/bin/env bash
# Read or tail logs from a deployed Cloud Run service.
#
# Modes:
#   default  — print the last N entries (most recent first) and exit
#   --tail   — stream new log entries live until Ctrl-C
set -euo pipefail

SERVICE="task-agents-backend"
PROJECT="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-asia-southeast1}"
TAIL=0
LIMIT=50
FROM=""
TO=""

# Colors — disabled if stdout is not a terminal (CI-friendly).
if [[ -t 1 ]]; then
  GREEN=$'\033[0;32m'; RED=$'\033[0;31m';  YEL=$'\033[0;33m'
  CYN=$'\033[0;36m';   MAG=$'\033[0;35m'
  DIM=$'\033[2m';      BOLD=$'\033[1m';    RESET=$'\033[0m'
else
  GREEN=; RED=; YEL=; CYN=; MAG=; DIM=; BOLD=; RESET=
fi

usage() {
  cat <<EOF
Read or tail logs from a deployed Cloud Run service.

Usage:
  $(basename "$0") [options]

Options:
  -n, --name NAME        Cloud Run service name      (default: $SERVICE)
  -p, --project ID       GCP project id              (default: \$GCP_PROJECT_ID)
  -r, --region REGION    GCP region                  (default: $REGION)
  -t, --tail             Stream new entries live (Ctrl-C to stop)
  -l, --limit N          Max entries when not tailing (default: $LIMIT)
  -f, --from WHEN        Start time. 'now', 'now-30m', or RFC3339
  -T, --to WHEN          End time.   'now', 'now-1h', or RFC3339
  -h, --help             Show this help and exit

Time examples:
  --from now-30m                   last 30 minutes
  --from now-2h --to now-1h        between 2h and 1h ago
  --from 2026-05-11T00:00:00Z      since an absolute UTC timestamp
  Units: s (seconds), m (minutes), h (hours), d (days), w (weeks)

Examples:
  $(basename "$0")
  $(basename "$0") --tail
  $(basename "$0") --from now-1h --limit 200
  $(basename "$0") --from 2026-05-11T00:00:00Z --to 2026-05-11T12:00:00Z

Run inside the cloud container:
  docker compose exec task_agents_cloud bash cloudrun/check_logs.sh
  docker compose exec task_agents_cloud bash cloudrun/check_logs.sh --tail
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--name)    SERVICE="$2"; shift 2 ;;
    -p|--project) PROJECT="$2"; shift 2 ;;
    -r|--region)  REGION="$2";  shift 2 ;;
    -t|--tail)    TAIL=1;       shift ;;
    -l|--limit)   LIMIT="$2";   shift 2 ;;
    -f|--from)    FROM="$2";    shift 2 ;;
    -T|--to)      TO="$2";      shift 2 ;;
    -h|--help)    usage; exit 0 ;;
    *) echo "error: unknown arg '$1'" >&2; usage; exit 1 ;;
  esac
done

# Convert 'now', 'now-30m', 'now-2h', etc. to an RFC3339 UTC timestamp.
# Pass anything else (e.g. an explicit RFC3339) through unchanged.
to_rfc3339() {
  local v="$1"
  if [[ "$v" == "now" ]]; then
    date -u '+%Y-%m-%dT%H:%M:%SZ'
  elif [[ "$v" =~ ^now-([0-9]+)([smhdw])$ ]]; then
    local n="${BASH_REMATCH[1]}" unit="${BASH_REMATCH[2]}"
    case "$unit" in
      s) date -u -d "$n seconds ago" '+%Y-%m-%dT%H:%M:%SZ' ;;
      m) date -u -d "$n minutes ago" '+%Y-%m-%dT%H:%M:%SZ' ;;
      h) date -u -d "$n hours ago"   '+%Y-%m-%dT%H:%M:%SZ' ;;
      d) date -u -d "$n days ago"    '+%Y-%m-%dT%H:%M:%SZ' ;;
      w) date -u -d "$n weeks ago"   '+%Y-%m-%dT%H:%M:%SZ' ;;
    esac
  else
    printf '%s\n' "$v"
  fi
}

if [[ -z "$PROJECT" ]]; then
  echo "${RED}error:${RESET} --project or GCP_PROJECT_ID env var required" >&2
  exit 1
fi

FILTER="resource.type=cloud_run_revision AND resource.labels.service_name=\"$SERVICE\" AND resource.labels.location=\"$REGION\""

if [[ -n "$FROM" ]]; then
  FROM_RFC=$(to_rfc3339 "$FROM")
  FILTER="$FILTER AND timestamp>=\"$FROM_RFC\""
fi
if [[ -n "$TO" ]]; then
  TO_RFC=$(to_rfc3339 "$TO")
  FILTER="$FILTER AND timestamp<=\"$TO_RFC\""
fi

# Format: tab-separated columns — timestamp, severity, then payload candidates.
FORMAT='value[separator="	"](timestamp.date(format="%Y-%m-%d %H:%M:%S"),severity,textPayload,jsonPayload.message,jsonPayload)'

# Colorize gcloud's output: dim timestamp, severity tinted by level, message plain.
colorize() {
  awk -v dim="$DIM" -v reset="$RESET" -v red="$RED" -v yel="$YEL" \
      -v cyn="$CYN"  -v grn="$GREEN" -v mag="$MAG" '
    BEGIN { FS = "\t" }
    {
      ts = $1; sev = $2
      msg = $3; if (msg == "") msg = $4; if (msg == "") msg = $5

      color = ""
      if (sev == "ERROR" || sev == "CRITICAL" || sev == "ALERT" || sev == "EMERGENCY") color = red
      else if (sev == "WARNING")                                                        color = yel
      else if (sev == "NOTICE")                                                         color = mag
      else if (sev == "INFO")                                                           color = cyn
      else if (sev == "DEBUG")                                                          color = dim
      else                                                                              color = grn

      printf "%s%s%s  %s%-9s%s  %s\n", dim, ts, reset, color, sev, reset, msg
      fflush()
    }
  '
}

if [[ "$TAIL" == "1" ]]; then
  echo "${BOLD}[logs]${RESET} tailing ${YEL}$SERVICE${RESET} in ${YEL}$REGION${RESET} ${DIM}(Ctrl-C to stop)${RESET}"
  echo
  gcloud logging tail "$FILTER" \
    --project="$PROJECT" \
    --format="$FORMAT" \
    --buffer-window=2s \
    | colorize
else
  echo "${BOLD}[logs]${RESET} last ${YEL}$LIMIT${RESET} entries for ${YEL}$SERVICE${RESET} in ${YEL}$REGION${RESET}"
  echo
  # Fetch newest N (desc), then reverse so display reads oldest → newest top-down.
  gcloud logging read "$FILTER" \
    --project="$PROJECT" \
    --limit="$LIMIT" \
    --order=desc \
    --format="$FORMAT" \
    | tac \
    | colorize
fi
