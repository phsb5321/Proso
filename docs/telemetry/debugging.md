# VoxPage Telemetry Debugging Guide

This guide covers how to query and debug VoxPage telemetry using Loki and the provided scripts.

## Quick Start

### Query Scripts

Use the scripts in `scripts/loki/` for common queries:

```bash
# Query a specific session
./scripts/loki/query-session.sh <sessionId>

# Query recent errors
./scripts/loki/query-errors.sh 1h

# Query a specific user's activity
./scripts/loki/query-user.sh <installId>
```

### Configuration

Set environment variables for the production Loki instance:

```bash
export LOKI_URL="https://loki.home301server.com.br"
```

For local development:

```bash
export LOKI_URL="http://localhost:3100"
```

See also: `.claude/skills/voxpage-loki-logs.md` for the Claude skill reference.

## LogQL Query Basics

Loki uses LogQL for queries. VoxPage logs use these labels:

| Label | Values | Description |
|-------|--------|-------------|
| `app` | `voxpage` | Application identifier |
| `env` | `dev`, `staging`, `prod` | Environment |
| `entrypoint` | `background`, `popup`, `options`, `content` | Extension context |
| `level` | `debug`, `info`, `warn`, `error` | Severity |
| `eventGroup` | `user`, `system`, `playback`, `pdf`, `network`, `shipper`, `error` | Category |

### Basic Queries

```logql
# All VoxPage logs
{app="voxpage"}

# Production errors only
{app="voxpage", env="prod", level="error"}

# Popup events
{app="voxpage", entrypoint="popup"}

# Playback events
{app="voxpage", eventGroup="playback"}
```

### JSON Filtering

High-cardinality fields are in the JSON body. Use `| json` to parse:

```logql
# Find a specific session
{app="voxpage"} | json | sessionId="550e8400-e29b-41d4-a716-446655440000"

# Find a specific install
{app="voxpage"} | json | installId="550e8400-e29b-41d4-a716-446655440000"

# Find specific events
{app="voxpage"} | json | event="playback.started"

# Filter by event pattern
{app="voxpage"} | json | event=~"error\\..*"
```

### Aggregations

```logql
# Count errors per hour
count_over_time({app="voxpage", level="error"}[1h])

# Count by event type
sum by (event) (count_over_time({app="voxpage"} | json[1h]))

# Count unique sessions
count(count by (sessionId) ({app="voxpage"} | json))
```

## Common Debugging Scenarios

### Finding Why Playback Failed

1. Get the session ID from the user (if available)
2. Query the session's events:

```bash
./scripts/loki/query-session.sh <sessionId> 1h
```

3. Look for error events:

```logql
{app="voxpage"} 
| json 
| sessionId="<sessionId>" 
| level="error"
```

4. Trace the actionId to find related events:

```logql
{app="voxpage"} 
| json 
| actionId="<actionId-from-error>"
```

### Diagnosing TTS Issues

```logql
# Find TTS failures
{app="voxpage"} | json | event=~"tts\\..*failed"

# Check TTS timing
{app="voxpage"} 
| json 
| event="tts.request_completed" 
| durationMs > 5000
```

### PDF Loading Problems

```logql
# PDF-related events
{app="voxpage", eventGroup="pdf"}

# PDF failures
{app="voxpage"} | json | event=~"pdf\\..*failed"
```

### Cache Issues

```logql
# Cache hit rate (rough)
{app="voxpage"} | json | event=~"tts\\.cache_.*"

# Cache store failures
{app="voxpage"} | json | event="cache.store_failed"
```

### Extension Not Loading

```logql
# Background startup events
{app="voxpage", entrypoint="background"} 
| json 
| event="background.started"

# Content script injection
{app="voxpage"} | json | event="content.injected"
```

## Debugging Telemetry Itself

### Check if Events are Being Shipped

```logql
# Shipper health events
{app="voxpage", eventGroup="shipper"}

# Successful flushes
{app="voxpage"} | json | event="shipper.flush_completed"

# Failed flushes
{app="voxpage"} | json | event="shipper.flush_failed"

# Circuit breaker state
{app="voxpage"} | json | event=~"shipper\\.circuit_.*"
```

### Check Gateway Health

1. Query Loki for gateway logs (if logged separately):
   ```logql
   {app="voxpage-log-gateway"}
   ```

2. Check gateway health endpoint:
   ```bash
   curl https://voxpage-logs.home301server.com.br/health
   ```

3. Look for validation errors:
   ```logql
   {app="voxpage-log-gateway"} |= "validation_error"
   ```

## Local Development Debugging

### Enable Debug Mode

In extension storage:
```javascript
browser.storage.local.set({ telemetryDebugMode: true });
```

This logs all events to the browser console.

### Inspect IndexedDB Buffer

1. Open DevTools in extension context
2. Go to Application → IndexedDB
3. Find `voxpage_usage` database
4. Check `events` object store

### Test Gateway Connection

```bash
# Test with curl
curl -X POST http://localhost:3000/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-token" \
  -d '{"events":[{"ts":"2024-01-01T00:00:00.000Z","event":"test","eventGroup":"system","level":"info","msg":"test","entrypoint":"background","extVersion":"1.0.0","installId":"550e8400-e29b-41d4-a716-446655440000","sessionId":"550e8400-e29b-41d4-a716-446655440001"}]}'
```

## Grafana Dashboards

If using Grafana with Loki:

### Error Rate Panel

```logql
sum(rate({app="voxpage", level="error"}[5m])) by (event)
```

### Active Users (Last Hour)

```logql
count(count by (installId) ({app="voxpage"}[1h] | json))
```

### Event Volume

```logql
sum(rate({app="voxpage"}[5m])) by (eventGroup)
```

### Playback Success Rate

```logql
# Success rate = completed / started
sum(rate({app="voxpage"} | json | event="playback.completed"[1h]))
/
sum(rate({app="voxpage"} | json | event="playback.start_requested"[1h]))
```

## Troubleshooting

### No Events in Loki

1. **Check telemetry is enabled**: Settings → Developer → Telemetry toggle
2. **Check gateway URL**: Verify `telemetryGatewayUrl` in storage
3. **Check network**: Look for failed requests in Network tab
4. **Check circuit breaker**: Look for `shipper.circuit_opened` events

### Events Delayed

1. **Check flush interval**: Default is 30 seconds
2. **Check buffer size**: Events flush when batch reaches 100
3. **Check circuit breaker**: May be open due to previous failures

### Validation Errors

Gateway returns 400 with details:
```json
{
  "error": "validation_error",
  "details": [{"path": "events.0.ts", "message": "Invalid datetime"}]
}
```

Common causes:
- Invalid timestamp format (must be ISO 8601)
- Missing required fields
- Invalid enum values

### Rate Limited

Gateway returns 429:
```json
{
  "error": "rate_limited",
  "retryAfter": 60
}
```

The shipper will back off automatically. If persistent, check for:
- Multiple extensions instances
- Runaway event generation
- Flush interval too aggressive
