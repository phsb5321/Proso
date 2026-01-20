---
name: voxpage-loki-logs
description: Query VoxPage telemetry logs from the Loki gateway. Use when debugging user issues, investigating errors, analyzing telemetry data, or querying extension logs.
allowed-tools: Bash(curl:*), Bash(jq:*), Bash(./scripts/loki/*), Read, WebFetch
---

# VoxPage Loki Logs Skill

This skill guides Claude through querying VoxPage telemetry logs from the production Loki instance for debugging, support, and analysis.

## Infrastructure Overview

| Service | URL | Purpose |
|---------|-----|---------|
| Loki | https://loki.home301server.com.br | Log storage and query API |
| Grafana | https://grafana.home301server.com.br | Log visualization UI |
| VoxPage Gateway | https://voxpage-logs.home301server.com.br | Log ingestion endpoint |
| Prometheus | https://prometheus.home301server.com.br | Metrics (not logs) |

## Quick Reference

### Using Helper Scripts

VoxPage includes shell scripts in `scripts/loki/` for common queries:

```bash
# Set production Loki URL
export LOKI_URL="https://loki.home301server.com.br"

# Query errors in last 24 hours
./scripts/loki/query-errors.sh 24h

# Query specific session
./scripts/loki/query-session.sh <session-uuid> 24h

# Query user by install ID
./scripts/loki/query-user.sh <install-uuid> 7d
```

### Direct cURL Queries

For custom queries without scripts:

```bash
# Basic query - recent VoxPage logs
curl -s -G 'https://loki.home301server.com.br/loki/api/v1/query_range' \
  --data-urlencode 'query={app="voxpage"}' \
  --data-urlencode 'limit=100' | jq '.data.result[].values[] | .[1] | fromjson'

# Query errors only
curl -s -G 'https://loki.home301server.com.br/loki/api/v1/query_range' \
  --data-urlencode 'query={app="voxpage", level="error"}' \
  --data-urlencode 'limit=50' | jq '.'

# Query by environment
curl -s -G 'https://loki.home301server.com.br/loki/api/v1/query_range' \
  --data-urlencode 'query={app="voxpage", env="prod"}' \
  --data-urlencode 'limit=100' | jq '.'
```

### Via Grafana UI

1. Go to https://grafana.home301server.com.br/explore
2. Select "Loki" as the data source
3. Enter query: `{app="voxpage"}`
4. Adjust time range as needed

## LogQL Query Reference

### Label Selectors

VoxPage logs use these labels (low-cardinality, efficient for filtering):

| Label | Values | Description |
|-------|--------|-------------|
| `app` | `voxpage` | Application identifier (always "voxpage") |
| `env` | `dev`, `staging`, `prod` | Environment |
| `entrypoint` | `background`, `popup`, `options`, `content` | Extension context |
| `level` | `debug`, `info`, `warn`, `error` | Log severity |
| `eventGroup` | `user`, `system`, `playback`, `pdf`, `network`, `shipper`, `error` | Event category |

### JSON Fields

High-cardinality fields stored in the log body (use JSON filtering):

| Field | Description |
|-------|-------------|
| `installId` | Stable UUID per installation (identifies a user) |
| `sessionId` | UUID per browser session |
| `actionId` | UUID correlating related events in a playback session |
| `event` | Event name (e.g., `playback.started`, `error.tts`) |
| `extVersion` | Extension version |
| `provider` | TTS provider being used |
| `urlHash` | SHA-256 hash of page URL |
| `msg` | Human-readable message |
| `data` | Additional event data (JSON object) |

### Query Examples

```logql
# All VoxPage logs
{app="voxpage"}

# Production errors only
{app="voxpage", level="error", env="prod"}

# Playback events from popup
{app="voxpage", eventGroup="playback", entrypoint="popup"}

# Filter by JSON field (sessionId)
{app="voxpage"} | json | sessionId="550e8400-e29b-41d4-a716-446655440000"

# Filter by installId (user)
{app="voxpage"} | json | installId="550e8400-e29b-41d4-a716-446655440000"

# Filter by event name pattern
{app="voxpage"} | json | event=~"playback.*"

# Count errors per hour
count_over_time({app="voxpage", level="error"}[1h])
```

## Common Debugging Workflows

### 1. Investigate User-Reported Issue

When a user reports an issue:

```bash
# If you have their install ID
./scripts/loki/query-user.sh <install-uuid> 7d

# Or search for errors in the timeframe they reported
curl -s -G 'https://loki.home301server.com.br/loki/api/v1/query_range' \
  --data-urlencode 'query={app="voxpage", level="error"}' \
  --data-urlencode 'start=1704067200000000000' \
  --data-urlencode 'end=1704153600000000000' \
  --data-urlencode 'limit=500' | jq '.'
```

### 2. Check System Health

```bash
# Recent errors across all users
./scripts/loki/query-errors.sh 1h

# Production errors only
./scripts/loki/query-errors.sh 24h prod

# Check error rate trend
curl -s -G 'https://loki.home301server.com.br/loki/api/v1/query_range' \
  --data-urlencode 'query=count_over_time({app="voxpage", level="error"}[1h])' \
  --data-urlencode 'step=3600' | jq '.'
```

### 3. Debug Playback Issues

```bash
# Query playback events for a session
curl -s -G 'https://loki.home301server.com.br/loki/api/v1/query_range' \
  --data-urlencode 'query={app="voxpage", eventGroup="playback"} | json | sessionId="<uuid>"' \
  --data-urlencode 'limit=500' | jq '.data.result[].values[] | .[1] | fromjson | "\(.ts) \(.event): \(.msg)"' -r
```

### 4. Analyze PDF Processing

```bash
# PDF-related events
curl -s -G 'https://loki.home301server.com.br/loki/api/v1/query_range' \
  --data-urlencode 'query={app="voxpage", eventGroup="pdf"}' \
  --data-urlencode 'limit=200' | jq '.'
```

### 5. Check Extension Startup

```bash
# System events (extension lifecycle)
curl -s -G 'https://loki.home301server.com.br/loki/api/v1/query_range' \
  --data-urlencode 'query={app="voxpage", eventGroup="system"}' \
  --data-urlencode 'limit=100' | jq '.data.result[].values[] | .[1] | fromjson'
```

### 6. View Console Logs (Remote Debugging)

Console capture sends `console.log`, `console.warn`, `console.error` etc. to Loki:

```bash
# All console output
curl -s -G 'https://loki.home301server.com.br/loki/api/v1/query_range' \
  --data-urlencode 'query={app="voxpage"} | json | event=~"console\\..*"' \
  --data-urlencode 'limit=200' | jq '.data.result[].values[] | .[1] | fromjson | "\(.ts) [\(.event)] \(.data.message)"' -r

# Console errors only
curl -s -G 'https://loki.home301server.com.br/loki/api/v1/query_range' \
  --data-urlencode 'query={app="voxpage"} | json | event="console.error"' \
  --data-urlencode 'limit=100' | jq '.'

# Console warnings
curl -s -G 'https://loki.home301server.com.br/loki/api/v1/query_range' \
  --data-urlencode 'query={app="voxpage"} | json | event="console.warn"' \
  --data-urlencode 'limit=100' | jq '.'
```

## Time Range Formats

### For Helper Scripts

| Format | Duration |
|--------|----------|
| `5m` | 5 minutes |
| `1h` | 1 hour |
| `24h` | 24 hours |
| `7d` | 7 days |

### For cURL (nanoseconds since epoch)

```bash
# Calculate start time (24 hours ago)
START_NS=$(( ($(date +%s) - 86400) * 1000000000 ))
END_NS=$(( $(date +%s) * 1000000000 ))

curl -s -G 'https://loki.home301server.com.br/loki/api/v1/query_range' \
  --data-urlencode 'query={app="voxpage"}' \
  --data-urlencode "start=$START_NS" \
  --data-urlencode "end=$END_NS" \
  --data-urlencode 'limit=100' | jq '.'
```

## Parsing Log Output

### Pretty Print Logs

```bash
# Parse and format log entries
curl -s -G 'https://loki.home301server.com.br/loki/api/v1/query_range' \
  --data-urlencode 'query={app="voxpage"}' \
  --data-urlencode 'limit=50' | jq -r '
    .data.result[].values[] | .[1] | fromjson |
    "[\(.ts)] [\(.level | ascii_upcase)] \(.event): \(.msg)"
  '
```

### Extract Specific Fields

```bash
# Get sessionId, event, and message
curl -s -G 'https://loki.home301server.com.br/loki/api/v1/query_range' \
  --data-urlencode 'query={app="voxpage", level="error"}' \
  --data-urlencode 'limit=20' | jq -r '
    .data.result[].values[] | .[1] | fromjson |
    {sessionId, event, msg, data}
  '
```

### Count by Event Type

```bash
# Count logs by event type
curl -s -G 'https://loki.home301server.com.br/loki/api/v1/query_range' \
  --data-urlencode 'query={app="voxpage"}' \
  --data-urlencode 'limit=1000' | jq '
    [.data.result[].values[] | .[1] | fromjson | .event] |
    group_by(.) | map({event: .[0], count: length}) | sort_by(.count) | reverse
  '
```

## Troubleshooting

### No Logs Found

1. **Check Loki is reachable**:
   ```bash
   curl -s 'https://loki.home301server.com.br/ready'
   # Should return: "ready"
   ```

2. **Verify time range**: Logs may be outside the queried window

3. **Check label values**: Ensure label values are exact (case-sensitive)

4. **Telemetry disabled**: User may have telemetry disabled in extension settings

### Query Errors

1. **Invalid query syntax**: Check LogQL format
   ```bash
   # Test query syntax
   curl -s -G 'https://loki.home301server.com.br/loki/api/v1/query' \
     --data-urlencode 'query={app="voxpage"}' | jq '.status'
   # Should return: "success"
   ```

2. **JSON parsing errors**: Ensure `jq` is installed
   ```bash
   jq --version
   ```

### Rate Limiting

If queries are slow or timing out:
- Reduce `limit` parameter
- Narrow the time range
- Use more specific label filters

## When to Use This Skill

Use this skill when:

- **Debugging user issues**: Investigating reported bugs or problems
- **Analyzing errors**: Checking error rates and patterns
- **Telemetry analysis**: Understanding usage patterns
- **Session debugging**: Tracing events in a specific user session
- **Health monitoring**: Checking production log health
- **Remote console debugging**: Viewing console.log output from production

## Console Capture

VoxPage can capture console output and send it to Loki for remote debugging.

### Enabling Console Capture

In the extension code (typically in entrypoints):

```typescript
import { usageTracker, installConsoleCapture } from '../utils/telemetry/usage';

// After initializing the tracker
await usageTracker.initialize({ gatewayUrl, gatewayToken, entrypoint: 'background' });

// Install console capture
const cleanupConsole = installConsoleCapture(usageTracker, {
  captureLog: true,      // Capture console.log
  captureDebug: false,   // Skip console.debug (too verbose)
  captureInfo: true,     // Capture console.info
  captureWarn: true,     // Capture console.warn
  captureError: true,    // Capture console.error
});

// Later, to cleanup:
cleanupConsole();
```

### Console Capture Options

| Option | Default | Description |
|--------|---------|-------------|
| `captureLog` | `true` | Capture `console.log()` calls |
| `captureDebug` | `false` | Capture `console.debug()` calls |
| `captureInfo` | `true` | Capture `console.info()` calls |
| `captureWarn` | `true` | Capture `console.warn()` calls |
| `captureError` | `true` | Capture `console.error()` calls |
| `maxMessageLength` | `2000` | Truncate messages longer than this |
| `maxMessagesPerWindow` | `100` | Rate limit: max messages per minute |
| `passthrough` | `true` | Also log to original console |

### Self-Filtering

VoxPage internal logs (prefixed with `[VoxPage]`, `[UsageTracker]`, etc.) are automatically filtered to prevent infinite loops.

### Example Prompts

- "Show me recent VoxPage errors"
- "Query logs for session <uuid>"
- "What errors happened in the last hour?"
- "Check VoxPage telemetry"
- "Debug playback issues for install <uuid>"
- "Is Loki receiving logs from VoxPage?"
