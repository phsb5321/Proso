# Proso Loki Query Scripts

Shell scripts for querying Proso telemetry data from Loki. These scripts are designed for debugging, support, and analysis of extension usage patterns.

## Prerequisites

- `curl` - for HTTP requests to Loki
- `jq` - for JSON parsing and formatting
- Access to a Loki instance with Proso telemetry data

## Configuration

Set environment variables to configure Loki connection:

```bash
export LOKI_URL="http://localhost:3100"      # Loki API URL
export LOKI_USER="admin"                      # Optional: basic auth username
export LOKI_PASSWORD="secret"                 # Optional: basic auth password
```

For production queries:

```bash
export LOKI_URL="https://loki.your-domain.com"
export LOKI_USER="your-username"
export LOKI_PASSWORD="your-password"
```

## Scripts

### query-session.sh

Query all logs for a specific browser session.

```bash
# Query last hour for a session
./query-session.sh 550e8400-e29b-41d4-a716-446655440000

# Query last 24 hours
./query-session.sh 550e8400-e29b-41d4-a716-446655440000 24h

# Query last 7 days, limit to 5000 entries
./query-session.sh 550e8400-e29b-41d4-a716-446655440000 7d 5000
```

**Output**: Chronological list of events with timestamp, level, event name, and message.

### query-errors.sh

Query error logs across all users.

```bash
# Query errors in last hour
./query-errors.sh

# Query errors in last 24 hours
./query-errors.sh 24h

# Query production errors only
./query-errors.sh 24h prod

# Query staging errors, limit to 100
./query-errors.sh 1h staging 100
```

**Output**: Detailed error information including session, install ID, entrypoint, and error data. Includes summary statistics.

### query-user.sh

Query all logs for a specific installation (user).

```bash
# Query user's last 24 hours of activity
./query-user.sh 550e8400-e29b-41d4-a716-446655440000

# Query last 7 days
./query-user.sh 550e8400-e29b-41d4-a716-446655440000 7d

# Query only playback events
./query-user.sh 550e8400-e29b-41d4-a716-446655440000 24h playback

# Query error events, limit to 500
./query-user.sh 550e8400-e29b-41d4-a716-446655440000 24h error 500
```

**Output**: Chronological list of events with session prefix, plus user activity summary.

## Time Range Formats

- `5m` - 5 minutes
- `1h` - 1 hour
- `24h` - 24 hours
- `7d` - 7 days

## LogQL Reference

These scripts use LogQL (Loki Query Language). For custom queries, use `curl` directly:

```bash
# Query by event type
curl -G "$LOKI_URL/loki/api/v1/query_range" \
  --data-urlencode 'query={app="proso", eventGroup="playback"}' \
  --data-urlencode "start=$(date -d '1 hour ago' +%s)000000000" \
  --data-urlencode "end=$(date +%s)000000000" \
  | jq '.data.result[].values[] | .[1] | fromjson'

# Query by entrypoint
curl -G "$LOKI_URL/loki/api/v1/query_range" \
  --data-urlencode 'query={app="proso", entrypoint="popup"}' \
  | jq '.'

# Count errors per hour
curl -G "$LOKI_URL/loki/api/v1/query_range" \
  --data-urlencode 'query=count_over_time({app="proso", level="error"}[1h])' \
  | jq '.'
```

## Proso Log Labels

Low-cardinality labels (efficient for filtering):

| Label | Values | Description |
|-------|--------|-------------|
| `app` | `proso` | Application identifier |
| `env` | `dev`, `staging`, `prod` | Environment |
| `entrypoint` | `background`, `popup`, `options`, `content` | Extension context |
| `level` | `debug`, `info`, `warn`, `error` | Log severity |
| `eventGroup` | `user`, `system`, `playback`, `pdf`, `network`, `shipper`, `error` | Event category |

High-cardinality fields (use JSON filtering):

| Field | Description |
|-------|-------------|
| `installId` | Stable UUID per installation |
| `sessionId` | UUID per browser session |
| `actionId` | UUID correlating related events |
| `event` | Event name (e.g., `playback.started`) |
| `extVersion` | Extension version |
| `provider` | TTS provider |
| `urlHash` | SHA-256 hash of page URL |

## Troubleshooting

### No logs found

1. Verify Loki URL is correct: `curl $LOKI_URL/ready`
2. Check time range - logs may be outside the queried window
3. Verify the installId/sessionId is correct
4. Check if telemetry is enabled in the extension settings

### Authentication errors

1. Verify LOKI_USER and LOKI_PASSWORD are set correctly
2. Check if your Loki instance requires authentication

### JSON parsing errors

1. Ensure `jq` is installed: `jq --version`
2. Check if Loki returned an error: run with `| jq '.'` at the end
