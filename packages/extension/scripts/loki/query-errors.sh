#!/bin/bash
#
# query-errors.sh - Query Proso error logs from Loki
#
# Usage:
#   ./query-errors.sh [time_range] [environment] [limit]
#
# Arguments:
#   time_range   - Time range to query, e.g., "1h", "24h", "7d" (default: 1h)
#   environment  - Environment filter: dev, staging, prod (default: all)
#   limit        - Maximum number of log entries to return (default: 500)
#
# Environment Variables:
#   LOKI_URL      - Loki API URL (default: http://localhost:3100)
#   LOKI_USER     - Loki basic auth username (optional)
#   LOKI_PASSWORD - Loki basic auth password (optional)
#
# Examples:
#   ./query-errors.sh                    # Last hour, all environments
#   ./query-errors.sh 24h                # Last 24 hours
#   ./query-errors.sh 7d prod            # Last 7 days, production only
#   ./query-errors.sh 1h staging 100     # Last hour, staging, max 100 entries
#

set -euo pipefail

# Configuration
LOKI_URL="${LOKI_URL:-http://localhost:3100}"
TIME_RANGE="${1:-1h}"
ENVIRONMENT="${2:-}"
LIMIT="${3:-500}"

# Build auth header if credentials provided
AUTH_OPTS=()
if [[ -n "${LOKI_USER:-}" ]] && [[ -n "${LOKI_PASSWORD:-}" ]]; then
  AUTH_OPTS=(-u "$LOKI_USER:$LOKI_PASSWORD")
fi

# Calculate start time based on range
case "$TIME_RANGE" in
  *h) START_NS=$(( ($(date +%s) - ${TIME_RANGE%h} * 3600) * 1000000000 )) ;;
  *d) START_NS=$(( ($(date +%s) - ${TIME_RANGE%d} * 86400) * 1000000000 )) ;;
  *m) START_NS=$(( ($(date +%s) - ${TIME_RANGE%m} * 60) * 1000000000 )) ;;
  *)  START_NS=$(( ($(date +%s) - 3600) * 1000000000 )) ;;
esac
END_NS=$(( $(date +%s) * 1000000000 ))

# Build LogQL query
if [[ -n "$ENVIRONMENT" ]]; then
  QUERY='{app="proso", level="error", env="'"$ENVIRONMENT"'"}'
else
  QUERY='{app="proso", level="error"}'
fi

# Execute query
echo "Querying Loki for errors (last $TIME_RANGE${ENVIRONMENT:+, env=$ENVIRONMENT})" >&2
echo "---" >&2

RESULT=$(curl -s -G "${AUTH_OPTS[@]}" "$LOKI_URL/loki/api/v1/query_range" \
  --data-urlencode "query=$QUERY" \
  --data-urlencode "start=$START_NS" \
  --data-urlencode "end=$END_NS" \
  --data-urlencode "limit=$LIMIT" \
  --data-urlencode "direction=backward")

# Parse and format output
echo "$RESULT" | jq -r '
  if .status == "success" then
    if (.data.result | length) == 0 then
      "No errors found in the specified time range"
    else
      .data.result[].values[]
      | .[1]
      | fromjson
      | "[\(.ts)] \(.event)\n  Session: \(.sessionId)\n  Install: \(.installId)\n  Entrypoint: \(.entrypoint)\n  Message: \(.msg)\n  Data: \(.data | tostring)\n"
    end
  else
    "Error: \(.status) - \(.error // "unknown error")"
  end
'

# Summary statistics
echo "---" >&2
echo "$RESULT" | jq -r '
  if .status == "success" and (.data.result | length) > 0 then
    .data.result[].values[]
    | .[1]
    | fromjson
  else
    empty
  end
' | jq -s '
  if length > 0 then
    "Summary:\n  Total errors: \(length)\n  Unique sessions: \(map(.sessionId) | unique | length)\n  Unique installs: \(map(.installId) | unique | length)\n  By event: \(group_by(.event) | map({key: .[0].event, count: length}) | from_entries | tostring)"
  else
    ""
  end
' -r >&2
