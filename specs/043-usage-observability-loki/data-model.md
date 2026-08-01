# Spec 043: Data Model

## Core Event Types

### UsageEvent

The base event structure that all usage events follow:

```typescript
interface UsageEvent {
  // === Required Fields ===
  
  /** ISO 8601 timestamp with millisecond precision */
  ts: string;  // e.g., "2026-01-10T15:22:31.123Z"
  
  /** Event name following dot-notation convention */
  event: string;  // e.g., "playback.start_requested"
  
  /** Event category for filtering and routing */
  eventGroup: EventGroup;
  
  /** Log severity level */
  level: LogLevel;
  
  /** Human-readable message describing the event */
  msg: string;
  
  /** Extension context where event originated */
  entrypoint: Entrypoint;
  
  /** Extension version from manifest */
  extVersion: string;
  
  /** Stable UUID generated on first installation */
  installId: string;
  
  /** UUID generated per browser session */
  sessionId: string;
  
  // === Optional Fields ===
  
  /** UUID for correlating events in a single user action/flow */
  actionId?: string;
  
  /** Current TTS provider */
  provider?: Provider;
  
  /** Migration feature flags snapshot */
  flags?: Record<string, boolean>;
  
  /** SHA-256 hash of current page URL (privacy-preserving) */
  urlHash?: string;
  
  /** For PDF pages, the URL scheme */
  pdfScheme?: 'http' | 'https' | 'file';
  
  /** Event-specific structured data */
  data?: Record<string, unknown>;
}
```

### Enums and Types

```typescript
type EventGroup = 
  | 'user'      // User-initiated actions (clicks, inputs)
  | 'system'    // Extension lifecycle and state
  | 'playback'  // Audio playback pipeline
  | 'pdf'       // PDF subsystem operations
  | 'network'   // API calls and network operations
  | 'shipper'   // Telemetry shipper health
  | 'error';    // All error conditions

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type Entrypoint = 
  | 'background'  // Background script
  | 'popup'       // Browser action popup
  | 'options'     // Options/settings page
  | 'content';    // Content script (including PDF viewer)

type Provider = 
  | 'browser'     // Native Browser TTS
  | 'elevenlabs'  // ElevenLabs API
  | 'openai'      // OpenAI TTS API
  | 'groq'        // Groq TTS API
  | 'cartesia';   // Cartesia TTS API
```

## Loki Labels

Labels are low-cardinality metadata attached to log streams. High-cardinality data causes performance issues in Loki.

```typescript
interface LokiLabels {
  /** Application identifier */
  app: 'voxpage';
  
  /** Deployment environment */
  env: 'dev' | 'staging' | 'prod';
  
  /** Extension context */
  entrypoint: Entrypoint;
  
  /** Log severity */
  level: LogLevel;
  
  /** Event category */
  event_group: EventGroup;
  
  /** Extension version (limited cardinality) */
  ext_version: string;
  
  /** TTS provider (limited cardinality) */
  provider?: Provider;
}
```

### What Goes Where

| Field | Label? | JSON Body? | Reason |
|-------|--------|------------|--------|
| `app` | ✅ | | Always "voxpage", 1 value |
| `env` | ✅ | | 2-3 values max |
| `entrypoint` | ✅ | | 4 values |
| `level` | ✅ | | 4 values |
| `event_group` | ✅ | | 7 values |
| `ext_version` | ✅ | | Few versions in production |
| `provider` | ✅ | | 5 values |
| `installId` | ❌ | ✅ | Unique per user - HIGH CARDINALITY |
| `sessionId` | ❌ | ✅ | Unique per session - HIGH CARDINALITY |
| `actionId` | ❌ | ✅ | Unique per action - HIGH CARDINALITY |
| `urlHash` | ❌ | ✅ | Unique per page - HIGH CARDINALITY |
| `event` | ❌ | ✅ | ~100 values, grows over time |
| `data.*` | ❌ | ✅ | Unbounded values |

## Buffer State

```typescript
interface BufferStats {
  /** Number of events in buffer */
  eventCount: number;
  
  /** Total size of buffered events in bytes */
  totalBytes: number;
  
  /** Buffer capacity in bytes */
  maxBytes: number;
  
  /** Percentage of buffer used */
  percentFull: number;
  
  /** Age of oldest event in milliseconds */
  oldestEventAgeMs: number;
  
  /** Number of events dropped due to overflow */
  droppedCount: number;
}

interface BufferConfig {
  /** Maximum buffer size in bytes (default: 10MB) */
  maxBytes: number;
  
  /** Maximum age of events before cleanup (default: 14 days) */
  maxAgeMs: number;
  
  /** IndexedDB database name */
  dbName: string;
  
  /** IndexedDB object store name */
  storeName: string;
}
```

## Shipper State

```typescript
interface ShipperState {
  /** Whether the circuit breaker is open */
  circuitOpen: boolean;
  
  /** Number of consecutive failures */
  consecutiveFailures: number;
  
  /** Timestamp when circuit was opened */
  circuitOpenedAt: number | null;
  
  /** Total events sent successfully */
  totalEventsSent: number;
  
  /** Total events that failed to send */
  totalEventsFailed: number;
  
  /** Last successful send timestamp */
  lastSuccessAt: number | null;
  
  /** Last failure timestamp */
  lastFailureAt: number | null;
  
  /** Last error message */
  lastError: string | null;
}

interface ShipperConfig {
  /** Gateway URL */
  gatewayUrl: string;
  
  /** Bearer token for authentication */
  gatewayToken: string;
  
  /** Maximum retry attempts */
  maxRetries: number;
  
  /** Base delay for exponential backoff (ms) */
  retryBaseDelayMs: number;
  
  /** Maximum delay between retries (ms) */
  retryMaxDelayMs: number;
  
  /** Failures before circuit opens */
  maxConsecutiveFailures: number;
  
  /** Time before circuit auto-closes (ms) */
  circuitResetMs: number;
  
  /** Enable gzip compression */
  enableGzip: boolean;
  
  /** Minimum batch size for gzip */
  gzipThresholdBytes: number;
}
```

## Tracker Configuration

```typescript
interface UsageTrackerConfig {
  /** Master enable switch */
  enabled: boolean;
  
  /** Gateway URL for event ingestion */
  gatewayUrl: string;
  
  /** Bearer token for gateway auth */
  gatewayToken: string;
  
  /** Deployment environment */
  environment: 'dev' | 'staging' | 'prod';
  
  // Buffer settings
  /** Maximum buffer size (default: 10MB) */
  maxBufferBytes: number;
  
  /** Maximum event age (default: 14 days) */
  maxBufferAgeMs: number;
  
  // Flush triggers
  /** Periodic flush interval (default: 30s) */
  flushIntervalMs: number;
  
  /** Batch size threshold (default: 100) */
  flushBatchSize: number;
  
  /** Immediate flush on error events (default: true) */
  flushOnError: boolean;
  
  // Circuit breaker
  /** Failures before opening (default: 5) */
  maxConsecutiveFailures: number;
  
  /** Auto-close delay (default: 60s) */
  circuitResetMs: number;
  
  // Retry
  /** Max retry attempts (default: 3) */
  maxRetries: number;
  
  /** Base retry delay (default: 1000ms) */
  retryBaseDelayMs: number;
  
  /** Max retry delay (default: 30000ms) */
  retryMaxDelayMs: number;
  
  // Debug
  /** Log events to console (dev only) */
  debugMode: boolean;
}
```

## Gateway Request/Response

### Ingest Request

```typescript
interface IngestRequest {
  /** Batch of events to ingest */
  events: UsageEvent[];
}
```

### Ingest Response

```typescript
// Success: 204 No Content (empty body)

// Validation Error: 400 Bad Request
interface ValidationErrorResponse {
  error: 'validation_error';
  details: Array<{
    path: string;
    message: string;
  }>;
}

// Auth Error: 401 Unauthorized
interface AuthErrorResponse {
  error: 'unauthorized';
  message: string;
}

// Rate Limit: 429 Too Many Requests
interface RateLimitResponse {
  error: 'rate_limited';
  retryAfter: number;  // seconds
}

// Gateway Error: 502 Bad Gateway
interface GatewayErrorResponse {
  error: 'loki_unavailable';
  message: string;
}
```

## Loki Push Format

The gateway transforms events to Loki's native push format:

```typescript
interface LokiPushRequest {
  streams: LokiStream[];
}

interface LokiStream {
  /** Low-cardinality labels */
  stream: LokiLabels;
  
  /** Array of log entries */
  values: LokiEntry[];
}

/** [timestamp_ns, json_line, structured_metadata?] */
type LokiEntry = [string, string, Record<string, string>?];
```

### Example Loki Push Payload

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
          "{\"event\":\"playback.start_requested\",\"msg\":\"Playback started\",\"installId\":\"abc-123\",\"sessionId\":\"def-456\",\"actionId\":\"ghi-789\",\"data\":{\"paragraphs\":15}}"
        ],
        [
          "1704895351456000000",
          "{\"event\":\"tts.request_started\",\"msg\":\"TTS generation started\",\"installId\":\"abc-123\",\"sessionId\":\"def-456\",\"actionId\":\"ghi-789\",\"data\":{\"textLength\":250}}"
        ]
      ]
    }
  ]
}
```

## Storage Schema (IndexedDB)

### Database: `voxpage_usage`

#### Object Store: `events`

```typescript
interface StoredEvent {
  /** Auto-incrementing key */
  id?: number;
  
  /** Event data */
  event: UsageEvent;
  
  /** Serialized size in bytes */
  sizeBytes: number;
  
  /** Storage timestamp for TTL */
  storedAt: number;
}
```

**Indexes**:
- `storedAt` - For TTL cleanup queries
- `event.level` - For priority flush (errors first)

#### Object Store: `meta`

```typescript
interface BufferMeta {
  key: 'stats';
  totalBytes: number;
  eventCount: number;
  droppedCount: number;
  lastFlushAt: number;
}

interface ContextMeta {
  key: 'context';
  installId: string;
  sessionId: string;
  lastSessionStart: number;
}
```

## Extension Storage Schema

### `browser.storage.local`

```typescript
interface TelemetryStorageSchema {
  // Configuration
  'telemetry.enabled': boolean;
  'telemetry.gatewayUrl': string;
  'telemetry.gatewayToken': string;  // Encrypted by browser
  'telemetry.environment': 'dev' | 'staging' | 'prod';
  
  // Context persistence
  'telemetry.installId': string;
  
  // Shipper state (for recovery after restart)
  'telemetry.shipperState': ShipperState;
}
```
