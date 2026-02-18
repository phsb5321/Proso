#!/bin/bash
#
# query-user.sh - Query VoxPage telemetry logs by installId
#
# Usage:
#   ./query-user.sh <installId> [time_range] [event_filter] [limit]
#
# Arguments:
#   installId    - The install UUID to query (required)
#   time_range   - Time range to query, e.g., "1h", "24h", "7d" (default: 24h)
#   event_filter - Optional event name filter, e.g., "playback" (default: all)
#   limit        - Maximum number of log entries to return (default: 1000)
#
# Environment Variables:
#   LOKI_URL      - Loki API URL (default: http://localhost:3100)
#   LOKI_USER     - Loki basic auth username (optional)
#   LOKI_PASSWORD - Loki basic auth password (optional)
#
# Examples:
#   ./query-user.sh 550e8400-e29b-41d4-a716-446655440000
#   ./query-user.sh 550e8400-e29b-41d4-a716-446655440000 7d
#   ./query-user.sh 550e8400-e29b-41d4-a716-446655440000 24h playback
#   ./query-user.sh 550e8400-e29b-41d4-a716-446655440000 24h error 500
#

set -euo pipefail

# Configuration
LOKI_URL="${LOKI_URL:-http://localhost:3100}"
INSTALL_ID="${1:-}"
TIME_RANGE="${2:-24h}"
EVENT_FILTER="${3:-}"
LIMIT="${4:-1000}"

# Validate arguments
if [[ -z "$INSTALL_ID" ]]; then
  echo "Error: installId is required" >&2
  echo "Usage: $0 <installId> [time_range] [event_filter] [limit]" >&2
  exit 1
fi

# Validate installId format (UUID)
if ! [[ "$INSTALL_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  echo "Error: installId must be a valid UUID" >&2
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
  *)  START_NS=$(( ($(date +%s) - 86400) * 1000000000 )) ;;
esac
END_NS=$(( $(date +%s) * 1000000000 ))

# Build LogQL query
QUERY='{app="voxpage"} | json | installId="'"$INSTALL_ID"'"'
if [[ -n "$EVENT_FILTER" ]]; then
  QUERY="$QUERY | event=~\".*$EVENT_FILTER.*\""
fi

# Execute query
echo "Querying Loki for installId: $INSTALL_ID (last $TIME_RANGE${EVENT_FILTER:+, event filter: $EVENT_FILTER})" >&2
echo "---" >&2

RESULT=$(curl -s -G "${AUTH_OPTS[@]}" "$LOKI_URL/loki/api/v1/query_range" \
  --data-urlencode "query=$QUERY" \
  --data-urlencode "start=$START_NS" \
  --data-urlencode "end=$END_NS" \
  --data-urlencode "limit=$LIMIT" \
  --data-urlencode "direction=forward")

# Parse and format output with session grouping
echo "$RESULT" | jq -r '
  if .status == "success" then
    if (.data.result | length) == 0 then
      "No logs found for this install"
    else
      .data.result[].values[]
      | .[1]
      | fromjson
      | "\(.ts) [\(.level | ascii_upcase)] [\(.sessionId | .[0:8])...] \(.event): \(.msg)"
    end
  else
    "Error: \(.status) - \(.error // "unknown error")"
  end
'

# User activity summary
echo "" >&2
echo "---" >&2
echo "$RESULT" | jq -r '
  if .status == "success" and (.data.result | length) > 0 then
    [.data.result[].values[] | .[1] | fromjson]
    | {
        total_events: length,
        sessions: (map(.sessionId) | unique | length),
        first_event: (sort_by(.ts) | first | .ts),
        last_event: (sort_by(.ts) | last | .ts),
        entrypoints: (group_by(.entrypoint) | map({key: .[0].entrypoint, count: length}) | from_entries),
        event_types: (group_by(.event) | map({key: .[0].event, count: length}) | sort_by(.count) | reverse | .[0:10] | from_entries)
      }
    | "User Activity Summary:\n  Total events: \(.total_events)\n  Sessions: \(.sessions)\n  First seen: \(.first_event)\n  Last seen: \(.last_event)\n  By entrypoint: \(.entrypoints | tostring)\n  Top events: \(.event_types | tostring)"
  else
    ""
  end
' >&2
