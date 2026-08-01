# Spec 043: VoxPage Full Usage Observability (Loki + Dokku Gateway)

## Overview

This specification defines a complete telemetry system for VoxPage that tracks 100% of meaningful user/system actions and reliably ships them to Loki via a Dokku-hosted gateway. The goal is session reconstruction from Loki logs without requiring Firefox console access.

## Goals

1. **100% usage tracking** across all extension contexts (background, popup, options, content, PDF viewer)
2. **Reliable delivery** to Loki via authenticated Dokku gateway with retry/backoff
3. **Low-cardinality labels** + structured JSON body (Loki best practice)
4. **Agent-friendly retrieval**: Scripts + docs for Claude Code to SSH and query Loki deterministically
5. **E2E verification**: Real Firefox runtime simulation proves logs arrive in Loki

## Non-Goals

- Store raw page/PDF text in Loki
- Store API keys or secrets in logs
- Rely on Firefox console as "source of truth"
- Replace existing `RemoteLogger` for structured logging (this system complements it)

## Architecture

### System Components

```
┌──────────────────────────────────────────────────────────────────┐
│                        VoxPage Extension                         │
├─────────────┬─────────────┬──────────────┬──────────────────────┤
│  Background │   Popup     │   Options    │   Content Scripts    │
│   Script    │             │              │   (incl. PDF)        │
├─────────────┴─────────────┴──────────────┴──────────────────────┤
│                    UsageTracker Module                           │
│  - track(event, payload, severity)                              │
│  - context attachment (installId, sessionId, etc.)              │
│  - redaction (API keys, tokens)                                 │
│  - local IndexedDB ring buffer                                  │
│  - shipper with retry/backoff/circuit breaker                   │
└────────────────────────────┬─────────────────────────────────────┘
                             │ POST /ingest
                             │ Authorization: Bearer <token>
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│              Dokku Log Gateway (voxpage-log-gateway)             │
│  - Auth validation (Bearer token)                                │
│  - Rate limiting + brute-force hardening                        │
│  - Schema validation                                             │
│  - Label policy enforcement                                      │
│  - Gzip request body support                                     │
└────────────────────────────┬─────────────────────────────────────┘
                             │ POST /loki/api/v1/push
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                         Loki Instance                            │
│  - Low-cardinality labels only                                   │
│  - Structured JSON body for high-cardinality data               │
│  - LogQL queries for session reconstruction                      │
└──────────────────────────────────────────────────────────────────┘
```

### Key Constraints

#### Loki Ingestion Rules
- Push logs via `/loki/api/v1/push`
- **Timestamp in push payload must be a string** (nanosecond precision), not a number
- Loki HTTP API has no built-in auth; secure via gateway

#### Loki Label Policy
- **Very low-cardinality labels only** - high-cardinality causes performance problems
- DO NOT put as labels: `sessionId`, `installId`, `url`, `traceId`, `actionId`
- Keep high-cardinality data in JSON body ("structured metadata")

#### Firefox-First Considerations
- Background scripts use event pages (not service workers) - DOM access available
- Can use `window.addEventListener('beforeunload')` for best-effort flush
- IndexedDB available in all contexts for local buffer

## Data Model

> **Note**: Complete type definitions are in [data-model.md](./data-model.md). This section provides a summary.

### Base Event Schema

The `UsageEvent` interface captures all telemetry events:

- **Required fields**: `ts`, `event`, `eventGroup`, `level`, `msg`, `entrypoint`, `extVersion`, `installId`, `sessionId`
- **Optional fields**: `actionId`, `provider`, `flags`, `urlHash`, `pdfScheme`, `data`

See [data-model.md](./data-model.md#usageevent) for full TypeScript interface.

### Loki Stream Labels (Low-Cardinality Only)

Labels are low-cardinality metadata for efficient Loki querying:

```typescript
interface LokiLabels {
  app: 'voxpage';
  env: 'dev' | 'staging' | 'prod';
  entrypoint: Entrypoint;
  level: LogLevel;
  event_group: EventGroup;
  ext_version: string;
  provider?: Provider;
}
```

High-cardinality data (`installId`, `sessionId`, `actionId`, `urlHash`) goes in the JSON body, not labels.

See [data-model.md](./data-model.md#loki-labels) for the complete label policy.

## Event Taxonomy

### A) User Interactions (`event_group: 'user'`)

| Event | Description |
|-------|-------------|
| `popup.opened` | Popup opened |
| `popup.closed` | Popup closed |
| `playback.play_clicked` | Play button clicked |
| `playback.pause_clicked` | Pause button clicked |
| `playback.stop_clicked` | Stop button clicked |
| `playback.next_clicked` | Next paragraph clicked |
| `playback.prev_clicked` | Previous paragraph clicked |
| `playback.seek_clicked` | Seek slider used |
| `playback.speed_changed` | Speed changed |
| `settings.opened` | Settings page opened |
| `settings.provider_changed` | TTS provider changed |
| `settings.voice_changed` | Voice selection changed |
| `settings.api_key_test_clicked` | API key test initiated |
| `settings.api_key_test_result` | API key test completed |
| `settings.saved` | Settings saved |
| `queue.opened` | Queue panel opened |
| `queue.item_added` | Item added to queue |
| `queue.item_removed` | Item removed from queue |
| `queue.reordered` | Queue reordered |
| `paragraph.clicked` | Paragraph clicked for playback |
| `paragraph.hovered` | Paragraph hover preview |

### B) System/Lifecycle (`event_group: 'system'`)

| Event | Description |
|-------|-------------|
| `extension.installed` | Extension installed |
| `extension.updated` | Extension updated |
| `background.started` | Background script started |
| `background.suspended` | Background script about to suspend |
| `content.injected` | Content script injected |
| `content.unloaded` | Content script unloaded |
| `container.initialized` | Hexagonal container initialized |
| `flags.snapshot` | Migration flags snapshot |
| `storage.quota_warning` | Storage quota warning |

### C) Playback Pipeline (`event_group: 'playback'`)

| Event | Description | Data |
|-------|-------------|------|
| `playback.start_requested` | Playback start requested | `{paragraphs: number}` |
| `playback.state_changed` | State transition | `{from, to, paragraphIndex}` |
| `playback.completed` | Playback completed | `{totalParagraphs, durationMs}` |
| `tts.request_started` | TTS generation started | `{provider, textLength}` |
| `tts.request_finished` | TTS generation finished | `{provider, latencyMs, status, cached}` |
| `audio.cache_hit` | Audio cache hit | `{cacheKey, sizeBytes}` |
| `audio.cache_miss` | Audio cache miss | `{cacheKey}` |
| `prefetch.started` | Prefetch started | `{paragraphIndex}` |
| `prefetch.completed` | Prefetch completed | `{paragraphIndex, latencyMs}` |
| `highlight.word_sync` | Word highlight synced | `{paragraphIndex, wordIndex}` |

### D) PDF Subsystem (`event_group: 'pdf'`)

| Event | Description | Data |
|-------|-------------|------|
| `pdf.detected` | PDF detected | `{scheme, url_hash}` |
| `pdf.extraction_started` | PDF extraction started | `{pageCount}` |
| `pdf.extraction_completed` | PDF extraction completed | `{pages, blocks, durationMs}` |
| `pdf.blocked_file_scheme` | file:// PDF blocked | `{url_hash}` |
| `pdf.error_security` | PDF security error | `{error}` |
| `pdf.error_fetch` | PDF fetch error | `{error, status}` |
| `pdf.password_required` | Password-protected PDF | |
| `pdf.ocr_started` | OCR started | `{pageCount}` |
| `pdf.ocr_completed` | OCR completed | `{pages, textLength, durationMs}` |

### E) Network/Timing (`event_group: 'network'`)

| Event | Description | Data |
|-------|-------------|------|
| `api.request_started` | API request started | `{endpoint, method}` |
| `api.request_completed` | API request completed | `{endpoint, status, latencyMs}` |
| `api.request_failed` | API request failed | `{endpoint, error, retryCount}` |
| `api.rate_limited` | Rate limit hit | `{endpoint, retryAfterMs}` |

### F) Shipper Health (`event_group: 'shipper'`)

| Event | Description | Data |
|-------|-------------|------|
| `shipper.batch_queued` | Batch queued for sending | `{eventCount, batchSizeBytes}` |
| `shipper.batch_sent` | Batch sent successfully | `{eventCount, latencyMs}` |
| `shipper.batch_failed` | Batch send failed | `{eventCount, error, retryCount}` |
| `shipper.retry_scheduled` | Retry scheduled | `{delayMs, attemptNumber}` |
| `shipper.circuit_opened` | Circuit breaker opened | `{consecutiveFailures}` |
| `shipper.circuit_closed` | Circuit breaker closed | `{closedAfterMs}` |
| `shipper.buffer_depth` | Buffer depth report | `{eventCount, totalBytes, pctFull}` |
| `shipper.buffer_overflow` | Buffer overflow, events dropped | `{droppedCount}` |

### G) Errors (`event_group: 'error'`)

| Event | Description | Data |
|-------|-------------|------|
| `error.uncaught` | Uncaught exception | `{message, stack, fingerprint}` |
| `error.unhandled_rejection` | Unhandled Promise rejection | `{message, stack, fingerprint}` |
| `error.handler_exception` | Handler threw exception | `{handler, message, stack}` |
| `error.message_dispatch` | Message dispatch error | `{messageType, error}` |
| `error.validation` | Schema validation error | `{schema, path, message}` |

## Module Structure

```
src/utils/telemetry/usage/
├── index.ts              # Public API exports
├── tracker.ts            # UsageTracker class (singleton)
├── context.ts            # Context provider (installId, sessionId, etc.)
├── types.ts              # TypeScript types, Zod schemas, event definitions
├── redaction.ts          # Sensitive data redaction, URL hashing
├── buffer.ts             # IndexedDB ring buffer (10MB, 14-day TTL)
├── shipper.ts            # HTTP shipper with retry/circuit breaker
└── error-capture.ts      # Global error handlers, fingerprinting

services/voxpage-log-gateway/
├── Dockerfile            # Multi-stage Node.js build
├── Procfile              # Dokku process definition
├── package.json          # Dependencies (express, zod, pino, helmet, cors)
├── tsconfig.json         # TypeScript configuration
├── env.example           # Environment variable template
└── src/
    ├── index.ts          # Express server (auth, rate-limit, routes)
    ├── schemas.ts        # Zod schemas matching client types
    └── loki-client.ts    # Loki push client with label grouping

scripts/loki/
├── query-session.sh      # Query logs by sessionId
├── query-errors.sh       # Query error logs
└── README.md             # Agent retrieval docs
```

## Integration Points

### 1. Background Script (`src/entrypoints/background.ts`)

```typescript
import { usageTracker } from '../utils/telemetry/usage';

// Initialize on startup
export default defineBackground(() => {
  usageTracker.track('background.started');
  
  // ... existing code ...
  
  // Best-effort flush on suspend
  // Firefox event pages support beforeunload
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      usageTracker.flush({ sync: true });
    });
  }
});
```

### 2. Message Handlers (`src/handlers/*.ts`)

```typescript
// Wrap handler execution with telemetry
export function registerPlaybackHandlers(registry: HandlerRegistry): void {
  registry.register('playback.start', async (params) => {
    const actionId = crypto.randomUUID();
    usageTracker.track('playback.start_requested', { 
      paragraphs: params.paragraphs?.length 
    }, 'info', { actionId });
    
    try {
      const result = await service.start(params);
      usageTracker.track('playback.state_changed', {
        from: 'stopped',
        to: 'playing'
      }, 'info', { actionId });
      return result;
    } catch (error) {
      usageTracker.track('error.handler_exception', {
        handler: 'playback.start',
        message: error.message,
        stack: error.stack
      }, 'error', { actionId });
      throw error;
    }
  });
}
```

### 3. Popup (`src/entrypoints/popup/`)

```typescript
// Track popup lifecycle
document.addEventListener('DOMContentLoaded', () => {
  usageTracker.track('popup.opened');
});

window.addEventListener('unload', () => {
  usageTracker.track('popup.closed');
});

// Track button clicks
playButton.addEventListener('click', () => {
  usageTracker.track('playback.play_clicked');
});
```

### 4. Content Script (`src/entrypoints/content.ts`)

```typescript
// Track paragraph clicks
function handleParagraphClick(index: number) {
  usageTracker.track('paragraph.clicked', { paragraphIndex: index });
}
```

### 5. Error Capture (Automatic)

```typescript
// Installed automatically by UsageTracker.initialize()
window.addEventListener('error', (event) => {
  usageTracker.track('error.uncaught', {
    message: event.message,
    stack: event.error?.stack,
    fingerprint: generateFingerprint(event.error)
  }, 'error');
});

window.addEventListener('unhandledrejection', (event) => {
  usageTracker.track('error.unhandled_rejection', {
    message: event.reason?.message || String(event.reason),
    stack: event.reason?.stack,
    fingerprint: generateFingerprint(event.reason)
  }, 'error');
});
```

## Configuration

### Extension Settings

```typescript
interface UsageTrackerConfig {
  enabled: boolean;
  gatewayUrl: string;
  gatewayToken: string;
  environment: 'dev' | 'prod';
  
  // Buffer settings
  maxBufferBytes: number;      // Default: 10MB
  maxBufferAgeMs: number;      // Default: 14 days
  
  // Flush triggers
  flushIntervalMs: number;     // Default: 30s
  flushBatchSize: number;      // Default: 100 events
  flushOnError: boolean;       // Default: true
  
  // Circuit breaker
  maxConsecutiveFailures: number;  // Default: 5
  circuitResetMs: number;          // Default: 60s
  
  // Retry
  maxRetries: number;          // Default: 3
  retryBaseDelayMs: number;    // Default: 1000
  retryMaxDelayMs: number;     // Default: 30000
}
```

### Gateway Configuration (Environment Variables)

```bash
# Required
LOKI_URL=http://loki:3100
GATEWAY_TOKEN=<secret-bearer-token>

# Optional
PORT=3000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
MAX_BATCH_SIZE=1000
MAX_BODY_SIZE_BYTES=5242880  # 5MB
```

## Security Considerations

### Redaction

The following patterns are automatically redacted before sending:

1. **API Keys**: Any string matching known API key patterns
   - `elevenlabsApiKey`, `openaiApiKey`, `groqApiKey`, `cartesiaApiKey`
   - Bearer tokens in Authorization headers
   - Any key matching `/[a-zA-Z0-9_-]{32,}/` in sensitive contexts

2. **URLs**: Hashed using SHA-256, stored as `urlHash`

3. **User Content**: Page text, PDF content never logged

### Gateway Authentication

- Bearer token required for all requests
- Token stored in `browser.storage.local` (encrypted by browser)
- Rate limiting prevents brute-force attacks
- 401 responses included in rate limit (prevents timing attacks)

## Testing Strategy

### Unit Tests

- `tracker.test.ts`: Event tracking, context attachment
- `buffer.test.ts`: Ring buffer, size limits, TTL
- `shipper.test.ts`: Retry logic, circuit breaker
- `redaction.test.ts`: Sensitive data filtering

### Integration Tests

- Gateway endpoint tests with mock Loki
- IndexedDB buffer persistence tests
- Cross-context event routing tests

### E2E Tests

- Real Firefox simulation with Playwright
- Verify events arrive in Loki within 60s
- Session reconstruction from Loki logs

## Success Metrics

1. **Coverage**: 100% of defined event types have at least one unit test verifying event emission
2. **Reliability**: <0.1% event loss under normal conditions
   - Normal conditions: Network latency <500ms, gateway uptime >99%, no browser crashes
   - Measured over 7-day rolling window
3. **Latency**: 95th percentile delivery <5s from event emission to Loki ingestion
   - Includes buffer flush interval (30s default) + network RTT
   - Excludes circuit breaker open periods
4. **Recovery**: Buffer survives browser restart, events delivered on next session
   - Verified via E2E test: emit events, close browser, reopen, verify Loki receipt

## Migration Path

1. Deploy gateway to Dokku
2. Add `UsageTracker` module to extension
3. Instrument background script lifecycle events
4. Instrument popup/options user interactions
5. Instrument content script events
6. Instrument error capture
7. Enable E2E verification tests
8. Gradual rollout via `enabled` flag
