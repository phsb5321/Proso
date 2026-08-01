# Spec 043: Implementation Plan

## Phase 1: Core Infrastructure (P1 - Critical Path)

### T001: Create UsageTracker Types and Interfaces
**Priority**: P1 | **Estimate**: 2h | **Dependencies**: None

Create the foundational types for the usage tracking system.

**Files to create**:
- `src/utils/telemetry/usage/types.ts`

**Implementation**:
```typescript
// Event types, LogLevel, EventGroup, Entrypoint
// UsageEvent interface
// UsageTrackerConfig interface
// BufferState interface
// ShipperState interface
```

**Acceptance Criteria**:
- [ ] All event types from spec defined
- [ ] Zod schemas for runtime validation
- [ ] TypeScript strict mode compatible

---

### T002: Implement Context Provider
**Priority**: P1 | **Estimate**: 3h | **Dependencies**: T001

Manage stable identifiers and session context.

**Files to create**:
- `src/utils/telemetry/usage/context.ts`

**Implementation**:
```typescript
interface UsageContext {
  installId: string;      // Stable, generated on first run
  sessionId: string;      // Generated per browser session
  extVersion: string;     // From manifest
  entrypoint: Entrypoint; // Detected from context
  provider?: string;      // Current TTS provider
  flags?: Record<string, boolean>; // Migration flags
}

class ContextProvider {
  private installId: string | null = null;
  private sessionId: string;
  
  async initialize(): Promise<void>;
  getContext(): UsageContext;
  setProvider(provider: string): void;
  setFlags(flags: Record<string, boolean>): void;
}
```

**Acceptance Criteria**:
- [ ] `installId` persists across browser restarts (stored in `browser.storage.local`)
- [ ] `sessionId` regenerates on each browser session
- [ ] `entrypoint` correctly detected in all contexts
- [ ] Unit tests for context generation and persistence

---

### T003: Implement Redaction Module
**Priority**: P1 | **Estimate**: 2h | **Dependencies**: T001

Redact sensitive data before logging.

**Files to create**:
- `src/utils/telemetry/usage/redaction.ts`

**Implementation**:
```typescript
const SENSITIVE_KEYS = [
  'elevenlabsApiKey', 'openaiApiKey', 'groqApiKey', 'cartesiaApiKey',
  'apiKey', 'token', 'password', 'secret', 'authorization'
];

const API_KEY_PATTERN = /[a-zA-Z0-9_-]{32,}/g;

function redactSensitiveData(data: unknown): unknown;
function hashUrl(url: string): string;
function redactStackTrace(stack: string): string;
```

**Acceptance Criteria**:
- [ ] API keys redacted from nested objects
- [ ] URLs hashed to SHA-256
- [ ] Stack traces have file paths normalized
- [ ] Unit tests with various sensitive data patterns

---

### T004: Implement IndexedDB Ring Buffer
**Priority**: P1 | **Estimate**: 4h | **Dependencies**: T001

Persistent buffer for events before shipping.

**Files to create**:
- `src/utils/telemetry/usage/buffer.ts`

**Implementation**:
```typescript
interface BufferConfig {
  maxBytes: number;        // Default: 10MB
  maxAgeMs: number;        // Default: 14 days
  dbName: string;          // 'voxpage_usage_buffer'
  storeName: string;       // 'events'
}

class UsageBuffer {
  private db: IDBDatabase | null = null;
  
  async initialize(): Promise<void>;
  async add(event: UsageEvent): Promise<boolean>;
  async flush(count: number): Promise<UsageEvent[]>;
  async getStats(): Promise<BufferStats>;
  async cleanup(): Promise<number>;  // Remove expired events
  async clear(): Promise<void>;
}
```

**Key Implementation Details**:
- Use IndexedDB for persistence across restarts
- Ring buffer behavior: evict oldest when full
- TTL cleanup on initialization and periodic
- Size tracking for overflow prevention

**Acceptance Criteria**:
- [ ] Events persist across browser restart
- [ ] Oldest events evicted when buffer full
- [ ] TTL expiration works correctly
- [ ] Size limits enforced
- [ ] Integration tests with real IndexedDB

---

### T005: Implement HTTP Shipper with Retry/Circuit Breaker
**Priority**: P1 | **Estimate**: 5h | **Dependencies**: T001, T004

Reliable HTTP transport to gateway.

**Files to create**:
- `src/utils/telemetry/usage/shipper.ts`

**Implementation**:
```typescript
interface ShipperConfig {
  gatewayUrl: string;
  gatewayToken: string;
  maxRetries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  maxConsecutiveFailures: number;
  circuitResetMs: number;
}

class UsageShipper {
  private consecutiveFailures: number = 0;
  private circuitOpen: boolean = false;
  private circuitOpenedAt: number = 0;
  
  async send(events: UsageEvent[]): Promise<boolean>;
  isCircuitOpen(): boolean;
  getState(): ShipperState;
}
```

**Key Implementation Details**:
- Exponential backoff with jitter
- Circuit breaker pattern (open after N failures, auto-close after timeout)
- Gzip compression for large batches
- Track shipper health events

**Acceptance Criteria**:
- [ ] Exponential backoff with jitter works correctly
- [ ] Circuit breaker opens after consecutive failures
- [ ] Circuit breaker auto-closes after timeout
- [ ] Gzip compression for batches > 1KB
- [ ] Unit tests for retry and circuit breaker logic

---

### T006: Implement UsageTracker Core Class
**Priority**: P1 | **Estimate**: 4h | **Dependencies**: T002, T003, T004, T005

Main tracker class orchestrating all components.

**Files to create**:
- `src/utils/telemetry/usage/tracker.ts`
- `src/utils/telemetry/usage/index.ts`

**Implementation**:
```typescript
class UsageTracker {
  private context: ContextProvider;
  private buffer: UsageBuffer;
  private shipper: UsageShipper;
  private config: UsageTrackerConfig;
  private flushInterval: number | null = null;
  
  async initialize(config: Partial<UsageTrackerConfig>): Promise<void>;
  
  track(
    event: string, 
    data?: Record<string, unknown>,
    level?: LogLevel,
    options?: { actionId?: string }
  ): void;
  
  async flush(options?: { sync?: boolean }): Promise<void>;
  
  setProvider(provider: string): void;
  setFlags(flags: Record<string, boolean>): void;
  
  getStats(): TrackerStats;
  destroy(): void;
}

// Singleton export
export const usageTracker: UsageTracker;
```

**Key Implementation Details**:
- Periodic flush on interval
- Flush on error events (immediate)
- Flush on buffer threshold
- Best-effort sync flush on shutdown

**Acceptance Criteria**:
- [ ] Events tracked with full context
- [ ] Periodic flush works
- [ ] Immediate flush on error events
- [ ] Shutdown flush works
- [ ] Singleton pattern works across module imports

---

### T007: Implement Global Error Capture
**Priority**: P1 | **Estimate**: 2h | **Dependencies**: T006

Automatic capture of uncaught errors.

**Files to create**:
- `src/utils/telemetry/usage/error-capture.ts`

**Implementation**:
```typescript
function generateErrorFingerprint(error: Error): string;

function installErrorCapture(tracker: UsageTracker): () => void {
  const handleError = (event: ErrorEvent) => { ... };
  const handleRejection = (event: PromiseRejectionEvent) => { ... };
  
  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);
  
  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  };
}
```

**Acceptance Criteria**:
- [ ] Uncaught exceptions captured with stack trace
- [ ] Unhandled rejections captured
- [ ] Error fingerprinting for deduplication
- [ ] Cleanup function removes listeners

---

## Phase 2: Gateway Service (P1 - Critical Path)

### T008: Create Dokku Gateway Service Scaffold
**Priority**: P1 | **Estimate**: 2h | **Dependencies**: None

Set up the gateway service project structure.

**Files to create**:
- `services/voxpage-log-gateway/package.json`
- `services/voxpage-log-gateway/tsconfig.json`
- `services/voxpage-log-gateway/Dockerfile`
- `services/voxpage-log-gateway/dokku.yml`
- `services/voxpage-log-gateway/.env.example`

**Acceptance Criteria**:
- [ ] Node.js/Express project structure
- [ ] TypeScript configuration
- [ ] Dockerfile builds successfully
- [ ] dokku.yml defines deployment config

---

### T009: Implement Gateway Authentication Middleware
**Priority**: P1 | **Estimate**: 2h | **Dependencies**: T008

Bearer token validation.

**Files to create**:
- `services/voxpage-log-gateway/src/middleware/auth.ts`

**Implementation**:
```typescript
import { RequestHandler } from 'express';

export function authMiddleware(expectedToken: string): RequestHandler {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization' });
    }
    
    const token = authHeader.slice(7);
    
    // Constant-time comparison to prevent timing attacks
    if (!timingSafeEqual(token, expectedToken)) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    next();
  };
}
```

**Acceptance Criteria**:
- [ ] Rejects requests without Bearer token
- [ ] Constant-time token comparison
- [ ] Unit tests for auth scenarios

---

### T010: Implement Gateway Rate Limiting
**Priority**: P1 | **Estimate**: 2h | **Dependencies**: T008

Rate limiting with brute-force hardening.

**Files to create**:
- `services/voxpage-log-gateway/src/middleware/rate-limit.ts`

**Implementation**:
```typescript
import rateLimit from 'express-rate-limit';

export const rateLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 100,             // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  // Include 401s in rate limit (brute-force protection)
  skipFailedRequests: false,
});
```

**Acceptance Criteria**:
- [ ] Rate limits enforced per IP
- [ ] 401 responses count toward limit
- [ ] Standard rate limit headers returned

---

### T011: Implement Gateway Schema Validation
**Priority**: P1 | **Estimate**: 2h | **Dependencies**: T008, T001

Validate incoming event batches.

**Files to create**:
- `services/voxpage-log-gateway/src/middleware/validate.ts`

**Implementation**:
```typescript
import { z } from 'zod';

const UsageEventSchema = z.object({
  ts: z.string(),
  event: z.string(),
  eventGroup: z.enum(['user', 'system', 'playback', 'pdf', 'network', 'shipper', 'error']),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  msg: z.string(),
  entrypoint: z.enum(['background', 'popup', 'options', 'content']),
  extVersion: z.string(),
  installId: z.string(),
  sessionId: z.string(),
  // ... optional fields
});

const BatchSchema = z.object({
  events: z.array(UsageEventSchema).max(1000),
});
```

**Acceptance Criteria**:
- [ ] Rejects invalid event schemas
- [ ] Enforces max batch size
- [ ] Returns helpful validation errors

---

### T012: Implement Loki Push Client
**Priority**: P1 | **Estimate**: 3h | **Dependencies**: T008

Forward validated events to Loki.

**Files to create**:
- `services/voxpage-log-gateway/src/loki/client.ts`

**Implementation**:
```typescript
interface LokiPushRequest {
  streams: Array<{
    stream: Record<string, string>;  // Labels
    values: Array<[string, string, Record<string, unknown>?]>;  // [timestamp, message, metadata]
  }>;
}

class LokiClient {
  constructor(private lokiUrl: string) {}
  
  async push(events: UsageEvent[]): Promise<void> {
    // Group events by labels
    const streams = this.groupByLabels(events);
    
    // Build Loki push request
    const payload: LokiPushRequest = { streams };
    
    // POST to Loki
    const response = await fetch(`${this.lokiUrl}/loki/api/v1/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      throw new Error(`Loki push failed: ${response.status}`);
    }
  }
  
  private groupByLabels(events: UsageEvent[]): LokiPushRequest['streams'] {
    // Group by: entrypoint, level, eventGroup
    // Keep high-cardinality data in values
  }
}
```

**Key Implementation Details**:
- Timestamp as nanosecond string (Loki requirement)
- Low-cardinality labels only
- High-cardinality data in JSON body

**Acceptance Criteria**:
- [ ] Correct Loki push payload format
- [ ] Timestamps as nanosecond strings
- [ ] Labels are low-cardinality only
- [ ] Integration test with Loki

---

### T013: Implement Gateway Ingest Endpoint
**Priority**: P1 | **Estimate**: 2h | **Dependencies**: T009, T010, T011, T012

Main ingestion endpoint.

**Files to create**:
- `services/voxpage-log-gateway/src/routes/ingest.ts`
- `services/voxpage-log-gateway/src/index.ts`

**Implementation**:
```typescript
// POST /ingest
router.post('/ingest', 
  express.json({ limit: '5mb' }),
  validateMiddleware,
  async (req, res) => {
    const { events } = req.body;
    
    try {
      await lokiClient.push(events);
      res.status(204).end();
    } catch (error) {
      console.error('Loki push failed:', error);
      res.status(502).json({ error: 'Failed to forward to Loki' });
    }
  }
);
```

**Acceptance Criteria**:
- [ ] Accepts valid event batches
- [ ] Returns 204 on success
- [ ] Returns 502 on Loki failure
- [ ] Supports gzip request bodies

---

## Phase 3: Extension Integration (P1 - Critical Path)

### T014: Integrate UsageTracker in Background Script
**Priority**: P1 | **Estimate**: 3h | **Dependencies**: T006

Initialize tracker and track lifecycle events.

**Files to modify**:
- `src/entrypoints/background.ts`
- `src/background/init-hexagonal.ts`

**Implementation**:
```typescript
// In background.ts
import { usageTracker, installErrorCapture } from '../utils/telemetry/usage';

export default defineBackground(() => {
  // Initialize tracker with config from browser.storage.local
  const initUsageTracker = async () => {
    const result = await browser.storage.local.get([
      'telemetryEnabled', 
      'telemetryGatewayUrl', 
      'telemetryGatewayToken'
    ]);
    
    if (result.telemetryEnabled === false) {
      console.log('[Background] Usage telemetry disabled by user');
      return;
    }

    await usageTracker.initialize({
      gatewayUrl: result.telemetryGatewayUrl || 'https://voxpage-logs.home301server.com.br',
      gatewayToken: result.telemetryGatewayToken || '',
      entrypoint: 'background',
      enabled: true,
    });

    installErrorCapture(usageTracker);
    usageTracker.track('background.started');
  };
  initUsageTracker();
  
  // ... existing code ...
});
```

**Acceptance Criteria**:
- [ ] Tracker initializes on background start
- [ ] `background.started` event logged
- [ ] Best-effort flush on suspend
- [ ] Config from browser.storage.local (user configurable)
- [ ] Respects user opt-out via telemetryEnabled flag

---

### T015: Instrument Message Handlers
**Priority**: P1 | **Estimate**: 4h | **Dependencies**: T014

Track handler execution and errors.

**Files to modify**:
- `src/handlers/playback.handlers.ts`
- `src/handlers/settings.handlers.ts`
- `src/handlers/cache.handlers.ts`
- `src/handlers/pdf.handlers.ts`
- `src/handlers/footer.handlers.ts`

**Implementation Pattern**:
```typescript
registry.register('playback.start', async (params) => {
  const actionId = crypto.randomUUID();
  usageTracker.track('playback.start_requested', { 
    paragraphs: params.paragraphs?.length 
  }, 'info', { actionId });
  
  const startTime = performance.now();
  
  try {
    const result = await service.start(params);
    
    usageTracker.track('playback.state_changed', {
      from: 'stopped',
      to: 'playing',
      durationMs: performance.now() - startTime
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
```

**Acceptance Criteria**:
- [ ] All handlers instrumented with timing
- [ ] Errors captured with actionId correlation
- [ ] No performance regression (< 1ms overhead)

---

### T016: Integrate Tracker in Popup
**Priority**: P2 | **Estimate**: 2h | **Dependencies**: T006

Track popup lifecycle and user interactions.

**Files to modify**:
- `src/entrypoints/popup/main.ts`

**Implementation**:
```typescript
import { usageTracker } from '../../utils/telemetry/usage';

// Initialize with popup context
await usageTracker.initialize({ entrypoint: 'popup' });

// Track lifecycle
usageTracker.track('popup.opened');
window.addEventListener('unload', () => usageTracker.track('popup.closed'));

// Track interactions
playButton.addEventListener('click', () => {
  usageTracker.track('playback.play_clicked');
});

pauseButton.addEventListener('click', () => {
  usageTracker.track('playback.pause_clicked');
});
```

**Acceptance Criteria**:
- [ ] Popup lifecycle tracked
- [ ] Button clicks tracked
- [ ] No duplicate events on rapid clicks

---

### T017: Integrate Tracker in Content Script
**Priority**: P2 | **Estimate**: 2h | **Dependencies**: T006

Track content script events.

**Files to modify**:
- `src/entrypoints/content.ts`

**Implementation**:
```typescript
// Track injection
usageTracker.track('content.injected', {
  url_hash: hashUrl(window.location.href),
  isPdf: document.contentType === 'application/pdf'
});

// Track paragraph interactions
function handleParagraphClick(index: number) {
  usageTracker.track('paragraph.clicked', { paragraphIndex: index });
}
```

**Acceptance Criteria**:
- [ ] Content injection tracked
- [ ] Paragraph clicks tracked
- [ ] URL hashed for privacy

---

### T018: Integrate Tracker in Options Page
**Priority**: P2 | **Estimate**: 2h | **Dependencies**: T006

Track settings page events.

**Files to modify**:
- `src/entrypoints/options/main.ts`

**Implementation**:
```typescript
// Track page open
usageTracker.track('settings.opened');

// Track provider changes
providerSelect.addEventListener('change', (e) => {
  usageTracker.track('settings.provider_changed', {
    from: previousProvider,
    to: e.target.value
  });
});

// Track API key tests
testKeyButton.addEventListener('click', () => {
  usageTracker.track('settings.api_key_test_clicked', { provider });
});
```

**Acceptance Criteria**:
- [ ] Settings page open tracked
- [ ] Provider/voice changes tracked
- [ ] API key tests tracked (not the key itself!)

---

## Phase 4: Agent Retrieval Tools (P2)

### T019: Create Loki Query Scripts
**Priority**: P2 | **Estimate**: 2h | **Dependencies**: T012

Scripts for Claude Code to query Loki.

**Files to create**:
- `scripts/loki/query-session.sh`
- `scripts/loki/query-errors.sh`
- `scripts/loki/query-user.sh`
- `scripts/loki/README.md`

**Implementation**:
```bash
#!/bin/bash
# query-session.sh - Query logs by sessionId
# Usage: ./query-session.sh <sessionId> [start_time] [end_time]

SESSION_ID=$1
START=${2:-"1h"}
END=${3:-"now"}

curl -G -s "http://loki:3100/loki/api/v1/query_range" \
  --data-urlencode "query={app=\"voxpage\"} |= \"$SESSION_ID\"" \
  --data-urlencode "start=$START" \
  --data-urlencode "end=$END" \
  | jq '.data.result[].values[] | .[1] | fromjson'
```

**Acceptance Criteria**:
- [ ] Query by sessionId
- [ ] Query errors in time range
- [ ] Query by installId
- [ ] README with usage examples

---

## Phase 5: E2E Verification (P2)

### T020: Create E2E Telemetry Tests
**Priority**: P2 | **Estimate**: 4h | **Dependencies**: T014, T013

Verify events arrive in Loki.

**Files to create**:
- `tests/e2e/telemetry/event-delivery.e2e.test.ts`

**Implementation**:
```typescript
test('events arrive in Loki within 60s', async ({ page, context }) => {
  // Load extension
  await loadExtension(context);
  
  // Perform actions that generate events
  await page.goto('https://example.com');
  await clickPopup(context, 'play');
  
  // Wait and query Loki
  await page.waitForTimeout(60000);
  
  const events = await queryLoki({
    query: `{app="voxpage"} | json | sessionId="${sessionId}"`,
  });
  
  // Verify expected events
  expect(events).toContainEqual(expect.objectContaining({
    event: 'popup.opened'
  }));
  expect(events).toContainEqual(expect.objectContaining({
    event: 'playback.play_clicked'
  }));
});
```

**Acceptance Criteria**:
- [ ] Test verifies popup events
- [ ] Test verifies playback events
- [ ] Test verifies error events
- [ ] CI integration with Loki

---

## Phase 6: Documentation and Rollout (P3)

### T021: Create Telemetry Documentation
**Priority**: P3 | **Estimate**: 2h | **Dependencies**: All above

**Files to create**:
- `docs/telemetry/README.md`
- `docs/telemetry/event-catalog.md`
- `docs/telemetry/debugging.md`

---

### T022: Create Gradual Rollout Plan
**Priority**: P3 | **Estimate**: 1h | **Dependencies**: T021

Document rollout strategy with `enabled` flag.

---

## Task Summary

| Task | Priority | Estimate | Dependencies |
|------|----------|----------|--------------|
| T001: Types/Interfaces | P1 | 2h | - |
| T002: Context Provider | P1 | 3h | T001 |
| T003: Redaction Module | P1 | 2h | T001 |
| T004: IndexedDB Buffer | P1 | 4h | T001 |
| T005: HTTP Shipper | P1 | 5h | T001, T004 |
| T006: UsageTracker Core | P1 | 4h | T002-T005 |
| T007: Error Capture | P1 | 2h | T006 |
| T008: Gateway Scaffold | P1 | 2h | - |
| T009: Gateway Auth | P1 | 2h | T008 |
| T010: Gateway Rate Limit | P1 | 2h | T008 |
| T011: Gateway Validation | P1 | 2h | T008, T001 |
| T012: Loki Client | P1 | 3h | T008 |
| T013: Gateway Ingest | P1 | 2h | T009-T012 |
| T014: Background Integration | P1 | 3h | T006 |
| T015: Handler Instrumentation | P1 | 4h | T014 |
| T016: Popup Integration | P2 | 2h | T006 |
| T017: Content Integration | P2 | 2h | T006 |
| T018: Options Integration | P2 | 2h | T006 |
| T019: Loki Query Scripts | P2 | 2h | T012 |
| T020: E2E Tests | P2 | 4h | T014, T013 |
| T021: Documentation | P3 | 2h | All |
| T022: Rollout Plan | P3 | 1h | T021 |

**Total Estimate**: ~55 hours

**Critical Path** (P1): T001 → T002/T003/T004 → T005 → T006 → T007 → T014 → T015
**Parallel Track** (Gateway): T008 → T009/T010/T011/T012 → T013
