# Spec 043: Research Notes

## Loki Best Practices

### Timestamp Format
**Source**: [Loki HTTP API - Push Logs](https://grafana.com/docs/loki/latest/reference/loki-http-api/#ingest-logs)

> The timestamp must be a string representation of a Unix timestamp in nanoseconds.

**Key Finding**: Timestamps MUST be strings, not numbers. Loki returns 400 Bad Request if timestamps are numeric.

```typescript
// Correct
["1704895351123000000", "log message"]

// Wrong - returns 400
[1704895351123000000, "log message"]
```

### Label Cardinality
**Source**: [Loki Labels Best Practices](https://grafana.com/docs/loki/latest/get-started/labels/bp-labels/)

> Loki is designed to keep a small index and use parallelized brute-force with caching. High cardinality labels will blow up the index.

**Key Finding**: Never use user IDs, session IDs, trace IDs, URLs, or any unbounded value as a label. Keep cardinality under ~100 unique values per label.

**Recommended**: Put high-cardinality data in:
1. The log line itself (JSON)
2. Structured metadata (if using Loki 2.9+)

### Structured Metadata
**Source**: [Loki Structured Metadata](https://grafana.com/docs/loki/latest/get-started/labels/structured-metadata/)

Loki 2.9+ supports structured metadata as a third element in the values array:

```json
["1704895351123000000", "log message", {"sessionId": "abc123"}]
```

This allows querying high-cardinality fields without using labels:
```logql
{app="voxpage"} | sessionId="abc123"
```

**Consideration**: Gateway should detect Loki version and use structured metadata if available.

---

## Promtail vs Alloy

### Promtail Deprecation
**Source**: [Grafana Alloy Announcement](https://grafana.com/blog/2024/04/09/grafana-alloy-opentelemetry-collector-with-prometheus-pipelines/)

> Promtail entered Long-Term Support (LTS) on February 13, 2025, with End-of-Life expected March 2, 2026.

**Key Finding**: New deployments should use Grafana Alloy, not Promtail. However, for our use case (extension → gateway → Loki), we don't need a log collector agent on the host.

**Decision**: Use direct HTTP push to Loki via gateway. No need for Promtail/Alloy.

---

## Firefox Extension Context

### Background Script vs Service Worker
**Source**: [Firefox Extension Background Scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts)

Firefox uses event pages (not service workers) for background scripts in MV3:
- DOM access available
- `window` object available
- `speechSynthesis` available
- No 5-minute timeout like Chrome service workers

**Key Finding**: Firefox background scripts can use:
- `window.addEventListener('beforeunload')` for shutdown hooks
- `Audio` API directly
- `IndexedDB` for persistent storage

### IndexedDB in Extension Contexts
**Source**: [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)

IndexedDB is available in all extension contexts:
- Background scripts
- Content scripts
- Popup
- Options page

**Consideration**: Each context gets its own IndexedDB instance. For simplicity, route all events through background script which maintains the single buffer.

---

## Existing Codebase Analysis

### Current RemoteLogger
The existing `src/utils/logging/logger.ts` implements:
- Batching with configurable interval
- Circular buffer with size limits
- Retry queue persistence in `browser.storage.local`
- Circuit breaker (10 consecutive failures)
- Multiple auth types (none, basic, bearer, cloudflare)

**Gaps**:
- No structured event types (just freeform logs)
- No automatic context attachment
- No error capture integration
- Buffer uses `browser.storage.local` (limited to 5MB)
- No IndexedDB for larger buffer

### Current Dispatch Telemetry
The existing `src/utils/telemetry/dispatch-logger.ts` tracks:
- Hexagonal vs legacy handler usage
- Message type statistics
- Unknown message tracking

**Gaps**:
- In-memory only (lost on restart)
- No persistence
- No shipping to external system

### Integration Points

1. **Background Script**: `src/entrypoints/background.ts`
   - Initialize tracker on startup
   - Flush on suspend (`beforeunload`)
   - Instrument message handlers

2. **Hexagonal Handlers**: `src/handlers/*.ts`
   - Wrap handler execution with telemetry
   - Track timing and errors

3. **Popup**: `src/entrypoints/popup/`
   - Track lifecycle and button clicks

4. **Content Script**: `src/entrypoints/content.ts`
   - Track injection and paragraph clicks

5. **Options**: `src/entrypoints/options/`
   - Track settings changes

---

## Gateway Deployment on Dokku

### Dokku Setup
**Source**: [Dokku Documentation](https://dokku.com/docs/getting-started/installation/)

Dokku deployment requires:
1. `Dockerfile` or buildpack configuration
2. `app.json` for Dokku-specific settings
3. Environment variables for configuration

### Gateway Architecture

Simple Express.js server:
```
POST /ingest
├── Auth middleware (Bearer token)
├── Rate limit middleware
├── Validation middleware (Zod)
└── Loki push client
```

### Environment Variables
```bash
# Required
LOKI_URL=http://loki:3100
GATEWAY_TOKEN=<secret>

# Optional
PORT=3000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## Security Considerations

### Sensitive Data Redaction

Common patterns to redact:
1. **API Keys**: `sk_live_*`, `sk_test_*`, any 32+ char alphanumeric string
2. **Authorization Headers**: `Bearer *`, `Basic *`
3. **Known Key Names**: `apiKey`, `token`, `password`, `secret`

**Implementation**:
```typescript
function redact(obj: unknown, path: string[] = []): unknown {
  if (typeof obj === 'string') {
    if (SENSITIVE_KEY_PATTERN.test(obj)) {
      return '[REDACTED]';
    }
    return obj;
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redact(value, [...path, key]);
      }
    }
    return result;
  }
  
  return obj;
}
```

### URL Privacy

Hash URLs to prevent reconstruction:
```typescript
async function hashUrl(url: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return 'sha256:' + Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

---

## Error Fingerprinting

Generate stable fingerprints for error deduplication:

```typescript
function generateFingerprint(error: Error): string {
  // Normalize stack trace (remove line numbers, absolute paths)
  const normalizedStack = error.stack
    ?.replace(/:\d+:\d+/g, '')  // Remove line:col
    ?.replace(/file:\/\/[^)]+\//g, '')  // Remove absolute paths
    ?.split('\n')
    .slice(0, 5)  // Top 5 frames
    .join('\n');
  
  const input = `${error.name}:${error.message}:${normalizedStack}`;
  
  // Simple hash (FNV-1a)
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  
  return hash.toString(16);
}
```

---

## Performance Considerations

### Non-Blocking Design

1. **Track calls are synchronous** - Add to in-memory queue, return immediately
2. **Buffer writes are async** - IndexedDB operations don't block
3. **Shipping is background** - Run on interval, don't block user actions

### Memory Management

1. **Buffer size limits** - Evict oldest when full
2. **Event size limits** - Truncate large payloads
3. **Periodic cleanup** - Remove expired events on startup and interval

### Overhead Measurement

Target: <1ms per `track()` call

```typescript
// Measure in development
const ENABLE_TIMING = process.env.NODE_ENV === 'development';

function track(event: string, data?: object): void {
  const start = ENABLE_TIMING ? performance.now() : 0;
  
  // ... tracking logic ...
  
  if (ENABLE_TIMING) {
    const elapsed = performance.now() - start;
    if (elapsed > 1) {
      console.warn(`[UsageTracker] Slow track: ${event} took ${elapsed.toFixed(2)}ms`);
    }
  }
}
```
