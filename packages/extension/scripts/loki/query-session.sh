#!/bin/bash
#
# query-session.sh - Query Proso telemetry logs by sessionId
#
# Usage:
#   ./query-session.sh <sessionId> [time_range] [limit]
#
# Arguments:
#   sessionId   - The session UUID to query (required)
#   time_range  - Time range to query, e.g., "1h", "24h", "7d" (default: 1h)
#   limit       - Maximum number of log entries to return (default: 1000)
#
# Environment Variables:
#   LOKI_URL      - Loki API URL (default: http://localhost:3100)
#   LOKI_USER     - Loki basic auth username (optional)
#   LOKI_PASSWORD - Loki basic auth password (optional)
#
# Examples:
#   ./query-session.sh 550e8400-e29b-41d4-a716-446655440000
#   ./query-session.sh 550e8400-e29b-41d4-a716-446655440000 24h
#   ./query-session.sh 550e8400-e29b-41d4-a716-446655440000 7d 5000
#

set -euo pipefail

# Configuration
LOKI_URL="${LOKI_URL:-http://localhost:3100}"
SESSION_ID="${1:-}"
TIME_RANGE="${2:-1h}"
LIMIT="${3:-1000}"

# Validate arguments
if [[ -z "$SESSION_ID" ]]; then
  echo "Error: sessionId is required" >&2
  echo "Usage: $0 <sessionId> [time_range] [limit]" >&2
  exit 1
fi

# Validate sessionId format (UUID)
if ! [[ "$SESSION_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  echo "Error: sessionId must be a valid UUID" >&2
  exit 1
fi

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

# LogQL query: filter by sessionId in JSON
QUERY='{app="proso"} | json | sessionId="'"$SESSION_ID"'"'

# Execute query
echo "Querying Loki for sessionId: $SESSION_ID (last $TIME_RANGE)" >&2
echo "---" >&2

curl -s -G "${AUTH_OPTS[@]}" "$LOKI_URL/loki/api/v1/query_range" \
  --data-urlencode "query=$QUERY" \
  --data-urlencode "start=$START_NS" \
  --data-urlencode "end=$END_NS" \
  --data-urlencode "limit=$LIMIT" \
  --data-urlencode "direction=forward" \
  | jq -r '
    if .status == "success" then
      if (.data.result | length) == 0 then
        "No logs found for this session"
      else
        .data.result[].values[]
        | .[1]
        | fromjson
        | "\(.ts) [\(.level | ascii_upcase)] \(.event): \(.msg)"
      end
    else
      "Error: \(.status) - \(.error // "unknown error")"
    end
  '
