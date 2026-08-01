# Spec 043: Loki Push API Contract

Reference: [Grafana Loki Push API](https://grafana.com/docs/loki/latest/reference/loki-http-api/#ingest-logs)

## Endpoint

```
POST /loki/api/v1/push
```

## Request Format

### Headers

```http
Content-Type: application/json
```

### Body Schema

```typescript
interface LokiPushRequest {
  streams: LokiStream[];
}

interface LokiStream {
  /** Labels identifying this log stream */
  stream: Record<string, string>;
  
  /** Log entries in this stream */
  values: LokiLogEntry[];
}

/**
 * Log entry format:
 * [0]: Timestamp as nanosecond string (REQUIRED: must be string, not number)
 * [1]: Log line content (string)
 * [2]: Optional structured metadata (object)
 */
type LokiLogEntry = 
  | [string, string]                           // Without metadata
  | [string, string, Record<string, string>];  // With structured metadata
```

## Critical Requirements

### 1. Timestamp Format

**CRITICAL**: Timestamp MUST be a **string** containing nanoseconds since Unix epoch.

```typescript
// ✅ CORRECT - String
["1704895351123000000", "log message"]

// ❌ WRONG - Number (Loki returns 400)
[1704895351123000000, "log message"]

// ❌ WRONG - Milliseconds (incorrect precision)
["1704895351123", "log message"]
```

**Conversion from JavaScript**:
```typescript
function toNanosecondString(date: Date = new Date()): string {
  // Date.now() returns milliseconds, multiply by 1e6 for nanoseconds
  const ns = BigInt(date.getTime()) * BigInt(1_000_000);
  return ns.toString();
}
```

### 2. Label Cardinality

**CRITICAL**: Labels must be low-cardinality. High-cardinality labels cause:
- Memory explosion in Loki ingesters
- Slow queries
- Index bloat

| Label Type | Example | Cardinality | Allowed? |
|------------|---------|-------------|----------|
| Fixed | `app="voxpage"` | 1 | ✅ Yes |
| Enum | `level="info"` | 4 | ✅ Yes |
| Version | `version="1.0.0"` | ~10 | ✅ Yes |
| User ID | `user_id="abc123"` | Unbounded | ❌ No |
| Session ID | `session="xyz"` | Unbounded | ❌ No |
| URL | `url="https://..."` | Unbounded | ❌ No |
| Trace ID | `trace_id="..."` | Unbounded | ❌ No |

**Put high-cardinality data in the log line or structured metadata instead.**

### 3. Stream Ordering

Entries within a stream MUST be ordered by timestamp (oldest first). Out-of-order entries are rejected.

```typescript
// ✅ CORRECT - Ordered
{
  "stream": { "app": "voxpage" },
  "values": [
    ["1704895351000000000", "first"],
    ["1704895352000000000", "second"],
    ["1704895353000000000", "third"]
  ]
}

// ❌ WRONG - Out of order
{
  "stream": { "app": "voxpage" },
  "values": [
    ["1704895353000000000", "third"],
    ["1704895351000000000", "first"]  // Will be rejected!
  ]
}
```

## VoxPage Label Schema

```typescript
const VOXPAGE_LABELS = {
  // Always present
  app: 'voxpage',
  env: 'dev' | 'staging' | 'prod',
  
  // Context
  entrypoint: 'background' | 'popup' | 'options' | 'content',
  level: 'debug' | 'info' | 'warn' | 'error',
  event_group: 'user' | 'system' | 'playback' | 'pdf' | 'network' | 'shipper' | 'error',
  
  // Optional but low-cardinality
  ext_version: string,  // e.g., "1.0.0"
  provider: 'browser' | 'elevenlabs' | 'openai' | 'groq' | 'cartesia',
};
```

## Example Push Request

```json
{
  "streams": [
    {
      "stream": {
        "app": "voxpage",
        "env": "prod",
        "entrypoint": "background",
        "level": "info",
        "event_group": "playback",
        "ext_version": "1.0.0",
        "provider": "elevenlabs"
      },
      "values": [
        [
          "1704895351123000000",
          "{\"event\":\"playback.start_requested\",\"msg\":\"Playback started\",\"installId\":\"550e8400-e29b-41d4-a716-446655440000\",\"sessionId\":\"6ba7b810-9dad-11d1-80b4-00c04fd430c8\",\"data\":{\"paragraphs\":15}}"
        ],
        [
          "1704895351456000000",
          "{\"event\":\"tts.request_started\",\"msg\":\"TTS generation started\",\"installId\":\"550e8400-e29b-41d4-a716-446655440000\",\"sessionId\":\"6ba7b810-9dad-11d1-80b4-00c04fd430c8\",\"data\":{\"textLength\":250}}"
        ]
      ]
    },
    {
      "stream": {
        "app": "voxpage",
        "env": "prod",
        "entrypoint": "popup",
        "level": "info",
        "event_group": "user",
        "ext_version": "1.0.0"
      },
      "values": [
        [
          "1704895350000000000",
          "{\"event\":\"popup.opened\",\"msg\":\"Popup opened\",\"installId\":\"550e8400-e29b-41d4-a716-446655440000\",\"sessionId\":\"6ba7b810-9dad-11d1-80b4-00c04fd430c8\"}"
        ]
      ]
    }
  ]
}
```

## Response Codes

| Status | Meaning |
|--------|---------|
| 204 | Success (no content) |
| 400 | Bad request (invalid JSON, timestamps, etc.) |
| 429 | Rate limited |
| 500 | Internal server error |
| 503 | Service unavailable |

## Querying Logs (LogQL)

### Query by Session

```logql
{app="voxpage"} | json | sessionId="6ba7b810-9dad-11d1-80b4-00c04fd430c8"
```

### Query Errors

```logql
{app="voxpage", level="error"} | json
```

### Query by Event Type

```logql
{app="voxpage", event_group="playback"} | json | event="playback.start_requested"
```

### Query with Time Range

```logql
{app="voxpage"} | json | sessionId="abc123" 
  | line_format "{{.ts}} [{{.event}}] {{.msg}}"
```

### Aggregate Queries

```logql
# Count events by type
sum by (event) (count_over_time({app="voxpage"} | json [1h]))

# Error rate
sum(rate({app="voxpage", level="error"}[5m])) / sum(rate({app="voxpage"}[5m]))
```

## Gateway Transformation Logic

The gateway transforms VoxPage events to Loki format:

```typescript
function transformToLoki(events: UsageEvent[], env: string): LokiPushRequest {
  // Group events by label combination
  const streamMap = new Map<string, { labels: LokiLabels; values: LokiLogEntry[] }>();
  
  for (const event of events) {
    const labels: LokiLabels = {
      app: 'voxpage',
      env,
      entrypoint: event.entrypoint,
      level: event.level,
      event_group: event.eventGroup,
      ext_version: event.extVersion,
    };
    
    if (event.provider) {
      labels.provider = event.provider;
    }
    
    const labelKey = JSON.stringify(labels);
    
    if (!streamMap.has(labelKey)) {
      streamMap.set(labelKey, { labels, values: [] });
    }
    
    // Remove labels from event body (already in stream labels)
    const { entrypoint, level, eventGroup, extVersion, provider, ...bodyFields } = event;
    
    const timestamp = toNanosecondString(new Date(event.ts));
    const logLine = JSON.stringify(bodyFields);
    
    streamMap.get(labelKey)!.values.push([timestamp, logLine]);
  }
  
  // Sort values within each stream by timestamp
  for (const stream of streamMap.values()) {
    stream.values.sort((a, b) => {
      const tsA = BigInt(a[0]);
      const tsB = BigInt(b[0]);
      return tsA < tsB ? -1 : tsA > tsB ? 1 : 0;
    });
  }
  
  return {
    streams: Array.from(streamMap.values()).map(({ labels, values }) => ({
      stream: labels as Record<string, string>,
      values,
    })),
  };
}
```
