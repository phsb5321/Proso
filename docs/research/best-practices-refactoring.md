# Best Practices for VoxPage Refactoring

**Last Updated**: 2026-01-22  
**Purpose**: Authoritative patterns and decisions for the hexagonal architecture refactoring

This document captures research findings on best practices applicable to VoxPage's Firefox extension refactoring. Each section includes a decision, rationale, alternatives considered, and primary sources.

---

## Table of Contents

1. [Browser Extension Architecture](#1-browser-extension-architecture)
   - [Messaging Patterns](#11-messaging-patterns)
   - [Storage Change Handling](#12-storage-change-handling)
   - [Event Pages vs Service Workers](#13-event-pages-vs-service-workers)
   - [API Key Management](#14-api-key-management)
2. [Hexagonal Architecture Testing](#2-hexagonal-architecture-testing)
   - [Contract Tests for Ports/Adapters](#21-contract-tests-for-portsadapters)
   - [Composition Root Testing](#22-composition-root-testing)
   - [Mocking Strategies](#23-mocking-strategies)
   - [Integration Test Boundaries](#24-integration-test-boundaries)
3. [Error Handling & Observability](#3-error-handling--observability)
   - [Structured Logging](#31-structured-logging)
   - [Error Boundaries and Recovery](#32-error-boundaries-and-recovery)
   - [Rate Limiting and Retry](#33-rate-limiting-and-retry)
   - [Telemetry Without PII](#34-telemetry-without-pii)
4. [State Management](#4-state-management)
   - [Single Source of Truth](#41-single-source-of-truth)
   - [Settings Synchronization](#42-settings-synchronization)
   - [Hot-Reload of Configuration](#43-hot-reload-of-configuration)

---

## 1. Browser Extension Architecture

### 1.1 Messaging Patterns

**Decision**: Use one-off messages (`runtime.sendMessage`) for request-response patterns; use connection-based messaging (`runtime.connect`) for long-lived streaming scenarios like playback progress updates.

**Rationale**: 
- One-off messages are simpler and sufficient for ~90% of extension messaging
- Connection-based messaging avoids repeated setup overhead for frequent updates
- MDN explicitly recommends connection-based for "sessions where multiple messages are exchanged"
- Firefox's promise-based `runtime.sendMessage` is cleaner than Chrome's callback pattern

**Pattern Implementation**:

```typescript
// One-off: Settings, cache queries, single actions
async function getSettings(): Promise<Settings> {
  return browser.runtime.sendMessage({ type: 'settings.get' });
}

// Connection-based: Playback progress, real-time updates
function subscribeToProgress(callback: (progress: number) => void): () => void {
  const port = browser.runtime.connect({ name: 'playback-progress' });
  port.onMessage.addListener((msg) => callback(msg.progress));
  return () => port.disconnect();
}
```

**Content Script to Background Communication**:
- Content scripts use `browser.runtime.sendMessage()` to reach background
- Background uses `browser.tabs.sendMessage()` to reach specific tabs
- Always include `tabId` and `frameId` from event details rather than assuming "current tab"

**Alternatives Considered**:
- Shared state via `browser.storage.session`: Rejected due to serialization overhead and lack of real-time updates
- Custom event bus: Over-engineering for extension use case
- Only connection-based: Unnecessary complexity for simple request-response

**Links**:
- [MDN: runtime.sendMessage()](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/sendMessage)
- [MDN: Content scripts - Communicating with background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#communicating_with_background_scripts)
- [MDN: Choosing between one-off and connection-based messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#choosing_between_one-off_messages_and_connection-based_messaging)

---

### 1.2 Storage Change Handling

**Decision**: Use `storage.onChanged` listener for reactive settings updates; implement debouncing for UI components that respond to frequent changes.

**Rationale**:
- `storage.onChanged` fires for all storage areas, providing unified reactivity
- Firefox persists `storage.local` data across browser restarts (unlike `localStorage` which can be cleared)
- The `StorageChange` object provides both `oldValue` and `newValue`, enabling differential updates
- `storage.session` (Firefox 115+) is ideal for transient state that shouldn't survive restarts

**Pattern Implementation**:

```typescript
// Background script: React to settings changes
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  
  if (changes.provider) {
    // Reconfigure audio adapter with new provider
    container.reconfigure({ provider: changes.provider.newValue });
  }
  
  if (changes.apiKey) {
    // Never log the actual key
    console.log('API key updated');
  }
});

// Content script: React to mode changes with debouncing
const debouncedUpdate = debounce((changes) => {
  if (changes.highlightMode) {
    updateHighlightStyle(changes.highlightMode.newValue);
  }
}, 100);

browser.storage.onChanged.addListener(debouncedUpdate);
```

**Storage Area Selection**:
| Data Type | Storage Area | Reason |
|-----------|--------------|--------|
| User preferences | `storage.local` | Persists across sessions |
| API keys | `storage.local` | Never use sync for secrets |
| Playback state | Memory (background) | Transient, high-frequency |
| Session-only flags | `storage.session` | Cleared on browser restart |
| Debug flags | `storage.local` | Persists for debugging |

**Alternatives Considered**:
- Polling storage: Wasteful and introduces latency
- Custom pub/sub: Reinventing what `storage.onChanged` provides
- `storage.sync`: Not suitable for API keys or large data

**Links**:
- [MDN: storage](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage)
- [MDN: storage.onChanged](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/onChanged)

---

### 1.3 Event Pages vs Service Workers

**Decision**: Use non-persistent event pages (Firefox MV2/MV3 pattern) with careful state persistence, not service workers.

**Rationale**:
- Firefox uses event pages, not service workers, for background scripts
- Event pages have DOM access (including `Audio` API) - a key VoxPage advantage
- Event pages can go idle after ~30 seconds of inactivity, requiring state persistence
- VoxPage's `persistent: false` setting enables better resource usage
- Context menus must be registered in `runtime.onInstalled` listener

**Key Constraints**:
1. **Register listeners at top level**: Listeners must be synchronous and at module top level
2. **No global variables for state**: Use `storage.local` or `storage.session` instead
3. **Use alarms, not setTimeout**: Timers don't survive event page suspension
4. **Handle `runtime.onSuspend`**: Clean up resources before suspension

**Pattern Implementation**:

```typescript
// CORRECT: Top-level listener registration
browser.runtime.onMessage.addListener(handleMessage);
browser.runtime.onInstalled.addListener(initializeContextMenus);

// CORRECT: Persist state to storage
async function updatePlaybackState(state: PlaybackState) {
  await browser.storage.session.set({ playbackState: state });
}

// CORRECT: Use alarms for recurring tasks
browser.alarms.create('prefetch', { delayInMinutes: 1 });
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'prefetch') prefetchNextParagraph();
});

// CORRECT: Context menus in onInstalled
browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: 'voxpage-read-selection',
    title: 'Read with VoxPage',
    contexts: ['selection'],
  });
});

// INCORRECT: Don't rely on global variables
let currentAudio = null; // Will be lost on suspension!
```

**Firefox-Specific Advantages**:
- DOM access means native `Audio` element works directly
- No need for offscreen documents (Chrome MV3 requirement)
- `speechSynthesis` API available directly

**Alternatives Considered**:
- Persistent background page: Higher resource usage, deprecated in MV3
- Service workers: Not used by Firefox, would require offscreen document for audio
- Content script audio: Cross-origin issues, page navigation problems

**Links**:
- [MDN: Background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts)
- [Extension Workshop: Manifest V3 migration guide](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)

---

### 1.4 API Key Management

**Decision**: Store API keys in `browser.storage.local` (never sync), validate on entry, use key prefixes for provider identification, and implement key rotation support.

**Rationale**:
- `storage.local` is extension-isolated and survives browser restarts
- Never use `storage.sync` for secrets (would sync to user's account)
- MDN notes: "The storage area is not encrypted and shouldn't be used for storing confidential user information"
- For TTS API keys, the risk is primarily quota/billing abuse, not data exposure

**Pattern Implementation**:

```typescript
// API Key storage with validation
interface ApiKeyStore {
  set(provider: string, key: string): Promise<void>;
  get(provider: string): Promise<string | null>;
  validate(provider: string, key: string): Promise<boolean>;
  clear(provider: string): Promise<void>;
}

class BrowserApiKeyStore implements ApiKeyStore {
  private keyPrefix = 'apiKey_';
  
  async set(provider: string, key: string): Promise<void> {
    // Validate format before storing
    if (!this.isValidKeyFormat(provider, key)) {
      throw new Error(`Invalid ${provider} API key format`);
    }
    await browser.storage.local.set({ 
      [`${this.keyPrefix}${provider}`]: key 
    });
  }
  
  async get(provider: string): Promise<string | null> {
    const result = await browser.storage.local.get(`${this.keyPrefix}${provider}`);
    return result[`${this.keyPrefix}${provider}`] || null;
  }
  
  private isValidKeyFormat(provider: string, key: string): boolean {
    const patterns: Record<string, RegExp> = {
      elevenlabs: /^[a-f0-9]{32}$/i,
      openai: /^sk-[A-Za-z0-9]{48}$/,
    };
    return patterns[provider]?.test(key) ?? key.length > 10;
  }
}
```

**Security Practices**:
1. **Never log API keys**: Use `console.log('API key updated')` not `console.log(key)`
2. **Validate on input**: Check format before storing
3. **Clear on logout**: Provide explicit key clearing
4. **Monitor for exposure**: Check CSP headers prevent exfiltration

**Alternatives Considered**:
- Native messaging to OS keychain: Over-engineering for extension keys
- Encrypted storage: Adds complexity without significant benefit (extension is sandboxed)
- Environment variables: Not available in browser extension context

**Links**:
- [MDN: storage](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage)
- [Extension Workshop: Build a secure extension](https://extensionworkshop.com/documentation/develop/build-a-secure-extension/)

---

## 2. Hexagonal Architecture Testing

### 2.1 Contract Tests for Ports/Adapters

**Decision**: Implement contract tests that verify adapters conform to port interfaces, running against both mock and real implementations periodically.

**Rationale**:
- Martin Fowler: "Contract tests check that all the calls against your test doubles return the same results as a call to the external service would"
- Prevents mock drift: mocks can become stale when external APIs change
- Contract tests should run on the "rhythm of changes to the external service" (e.g., daily)
- In hexagonal architecture, ports define contracts that all adapters must satisfy

**Pattern Implementation**:

```typescript
// Port definition
interface IAudioGenerator {
  generate(text: string, voice: string): Promise<GeneratedAudio>;
  listVoices(): Promise<Voice[]>;
}

// Contract test that runs against any adapter
function createAudioGeneratorContractTests(
  name: string,
  createAdapter: () => IAudioGenerator
) {
  describe(`IAudioGenerator contract: ${name}`, () => {
    let adapter: IAudioGenerator;
    
    beforeEach(() => {
      adapter = createAdapter();
    });
    
    it('generate returns audio blob with valid MIME type', async () => {
      const result = await adapter.generate('Hello world', 'default');
      expect(result.blob).toBeInstanceOf(Blob);
      expect(['audio/mpeg', 'audio/wav', 'audio/ogg']).toContain(result.blob.type);
    });
    
    it('generate returns word timings when supported', async () => {
      const result = await adapter.generate('Hello world', 'default');
      if (result.wordTimings) {
        expect(result.wordTimings).toBeInstanceOf(Array);
        expect(result.wordTimings[0]).toHaveProperty('word');
        expect(result.wordTimings[0]).toHaveProperty('startTime');
      }
    });
    
    it('listVoices returns non-empty array', async () => {
      const voices = await adapter.listVoices();
      expect(voices.length).toBeGreaterThan(0);
      expect(voices[0]).toHaveProperty('id');
      expect(voices[0]).toHaveProperty('name');
    });
  });
}

// Run against mock for CI
createAudioGeneratorContractTests('MockAudioGenerator', () => new MockAudioGenerator());

// Run against real service in scheduled job
if (process.env.RUN_CONTRACT_TESTS === 'true') {
  createAudioGeneratorContractTests('ElevenLabsAdapter', () => 
    new ElevenLabsAdapter(process.env.ELEVENLABS_API_KEY!)
  );
}
```

**Test Scheduling**:
| Test Type | Frequency | Triggered By |
|-----------|-----------|--------------|
| Unit tests | Every commit | CI pipeline |
| Contract tests (mock) | Every commit | CI pipeline |
| Contract tests (real) | Daily | Scheduled job |
| Integration tests | Every PR | CI pipeline |

**Alternatives Considered**:
- Consumer-Driven Contracts (Pact): Overkill for single-consumer scenario
- No contract tests: Risk of mock drift
- Only real service tests: Too slow/flaky for CI

**Links**:
- [Martin Fowler: Contract Test](https://martinfowler.com/bliki/ContractTest.html)
- [Martin Fowler: Consumer Driven Contracts](https://martinfowler.com/articles/consumerDrivenContracts.html)

---

### 2.2 Composition Root Testing

**Decision**: Test the composition root (DI container) separately with integration tests that verify correct wiring without external services.

**Rationale**:
- The composition root is where "all the pieces come together"
- Wiring errors are common and should be caught early
- Tests should verify that dependency injection produces working object graphs
- Container should be testable in isolation with mock adapters

**Pattern Implementation**:

```typescript
// Composition root with testable factory
export function createContainer(
  config: Config,
  adapters?: Partial<Adapters>
): Container {
  const defaults: Adapters = {
    audioGenerator: new ElevenLabsAdapter(config.apiKey),
    cacheStore: new IndexedDBCacheAdapter(config.cacheDb),
    settingsStore: new BrowserSettingsAdapter(),
    // ...
  };
  
  const resolved = { ...defaults, ...adapters };
  
  return {
    services: {
      playback: new PlaybackService(
        resolved.audioGenerator,
        resolved.cacheStore,
        resolved.settingsStore
      ),
      // ...
    },
    adapters: resolved,
  };
}

// Integration test for composition root
describe('Composition Root', () => {
  it('creates working PlaybackService with mock adapters', async () => {
    const container = createContainer(testConfig, {
      audioGenerator: new MockAudioGenerator(),
      cacheStore: new InMemoryCacheStore(),
      settingsStore: new InMemorySettingsStore(),
    });
    
    // Verify the service is properly wired
    const result = await container.services.playback.play('Hello', 0);
    expect(result.status).toBe('playing');
  });
  
  it('uses real adapters when no overrides provided', () => {
    const container = createContainer(productionConfig);
    
    expect(container.adapters.audioGenerator).toBeInstanceOf(ElevenLabsAdapter);
    expect(container.adapters.cacheStore).toBeInstanceOf(IndexedDBCacheAdapter);
  });
});
```

**Alternatives Considered**:
- Testing only through E2E: Too slow, hard to diagnose wiring issues
- No composition root tests: Wiring errors caught late in development
- Auto-wiring DI framework: Adds complexity, magic behavior

**Links**:
- [Mark Seemann: Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/)
- [Alistair Cockburn: Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)

---

### 2.3 Mocking Strategies

**Decision**: Use three types of test doubles: mocks for behavior verification, stubs for canned responses, and in-memory implementations for stateful adapters.

**Rationale**:
- Hexagonal architecture naturally supports testing: inject test doubles via ports
- Mocks verify interactions (e.g., "was cache called?")
- Stubs provide canned responses for isolated unit tests
- In-memory implementations maintain state for integration tests

**Pattern Implementation**:

```typescript
// Stub: Returns canned responses
class StubAudioGenerator implements IAudioGenerator {
  async generate(text: string, voice: string): Promise<GeneratedAudio> {
    return {
      blob: new Blob(['fake audio'], { type: 'audio/mpeg' }),
      wordTimings: [{ word: text, startTime: 0, endTime: 1000 }],
    };
  }
  
  async listVoices(): Promise<Voice[]> {
    return [{ id: 'voice-1', name: 'Test Voice' }];
  }
}

// Mock: Tracks calls for verification
class MockAudioGenerator extends StubAudioGenerator {
  calls: { method: string; args: unknown[] }[] = [];
  
  async generate(text: string, voice: string): Promise<GeneratedAudio> {
    this.calls.push({ method: 'generate', args: [text, voice] });
    return super.generate(text, voice);
  }
  
  expectGenerated(text: string): void {
    const found = this.calls.find(
      c => c.method === 'generate' && c.args[0] === text
    );
    if (!found) throw new Error(`Expected generate(${text}) to be called`);
  }
}

// In-memory implementation: Maintains state
class InMemoryCacheStore implements ICacheStore {
  private store = new Map<string, Blob>();
  
  async get(key: string): Promise<Blob | null> {
    return this.store.get(key) || null;
  }
  
  async set(key: string, value: Blob): Promise<void> {
    this.store.set(key, value);
  }
  
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
  
  // Test helper
  clear(): void {
    this.store.clear();
  }
}
```

**When to Use Each**:
| Test Type | Double Type | Example |
|-----------|-------------|---------|
| Unit test (isolated logic) | Stub | Test paragraph parsing |
| Unit test (interaction) | Mock | Verify cache is called |
| Integration test | In-memory | Test playback flow |
| E2E test | Real or In-memory | Full extension test |

**Alternatives Considered**:
- Auto-mocking libraries: Less explicit, can hide interface changes
- Only real implementations: Too slow, flaky
- Single mock type: Loses expressiveness

**Links**:
- [Martin Fowler: Test Double](https://martinfowler.com/bliki/TestDouble.html)
- [Alistair Cockburn: Hexagonal Architecture - Sample Code](https://alistair.cockburn.us/hexagonal-architecture/)

---

### 2.4 Integration Test Boundaries

**Decision**: Integration tests should test through ports (hexagon boundaries), not through internal implementation details.

**Rationale**:
- Hexagonal architecture defines clear test boundaries: the ports
- "Primary ports" (driving) are tested via API/message calls
- "Secondary ports" (driven) are tested via contract tests
- Tests should be resilient to internal refactoring

**Test Boundary Diagram**:

```
┌─────────────────────────────────────────────────────────────┐
│                     Integration Test                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Application Hexagon                     │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │           Domain Services                    │    │    │
│  │  │  PlaybackService, ContentExtractionService   │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  │                      │                               │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │              Port Interfaces                 │    │    │
│  │  │  IAudioGenerator, ICacheStore, etc.          │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  └──────────────────────│──────────────────────────────┘    │
│                         │                                    │
│  ┌──────────────────────▼──────────────────────────────┐    │
│  │              In-Memory Adapters                      │    │
│  │  MockAudioGenerator, InMemoryCacheStore              │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Pattern Implementation**:

```typescript
describe('PlaybackService integration', () => {
  let container: Container;
  let mockAudio: MockAudioGenerator;
  let cacheStore: InMemoryCacheStore;
  
  beforeEach(() => {
    mockAudio = new MockAudioGenerator();
    cacheStore = new InMemoryCacheStore();
    
    container = createContainer(testConfig, {
      audioGenerator: mockAudio,
      cacheStore: cacheStore,
    });
  });
  
  it('generates and caches audio on first play', async () => {
    // Test through the service (primary port)
    await container.services.playback.play('Hello world', 0);
    
    // Verify via port contracts
    mockAudio.expectGenerated('Hello world');
    const cached = await cacheStore.get('test-url|0|elevenlabs');
    expect(cached).not.toBeNull();
  });
  
  it('uses cached audio on replay', async () => {
    // Pre-populate cache
    await cacheStore.set('test-url|0|elevenlabs', new Blob(['audio']));
    
    // Play should use cache
    await container.services.playback.play('Hello world', 0);
    
    // Audio generator should NOT be called
    expect(mockAudio.calls).toHaveLength(0);
  });
});
```

**Alternatives Considered**:
- Test internal classes directly: Breaks on refactoring
- Only E2E tests: Too slow, hard to isolate failures
- Test through UI: Brittle, slow

**Links**:
- [Alistair Cockburn: Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- [Martin Fowler: Integration Test](https://martinfowler.com/bliki/IntegrationTest.html)

---

## 3. Error Handling & Observability

### 3.1 Structured Logging

**Decision**: Use structured JSON logging with consistent fields; include correlation IDs for request tracing; use log levels appropriately.

**Rationale**:
- Structured logs enable machine parsing and aggregation
- Correlation IDs connect related events across contexts
- Log levels allow filtering in production vs development
- Extension logging should work with browser devtools

**Pattern Implementation**:

```typescript
interface LogContext {
  correlationId?: string;
  tabId?: number;
  url?: string;
  duration?: number;
  [key: string]: unknown;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  constructor(
    private component: string,
    private minLevel: LogLevel = 'info'
  ) {}
  
  private log(level: LogLevel, message: string, context?: LogContext) {
    if (!this.shouldLog(level)) return;
    
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      ...context,
    };
    
    // Format for browser console
    const prefix = `[${this.component}]`;
    
    switch (level) {
      case 'debug': console.debug(prefix, message, context); break;
      case 'info': console.info(prefix, message, context); break;
      case 'warn': console.warn(prefix, message, context); break;
      case 'error': console.error(prefix, message, context); break;
    }
    
    // Optionally send to telemetry service
    if (level === 'error' || level === 'warn') {
      this.sendToTelemetry(entry);
    }
  }
  
  debug(message: string, context?: LogContext) { this.log('debug', message, context); }
  info(message: string, context?: LogContext) { this.log('info', message, context); }
  warn(message: string, context?: LogContext) { this.log('warn', message, context); }
  error(message: string, context?: LogContext) { this.log('error', message, context); }
}

// Usage
const logger = new Logger('PlaybackService');

async function play(text: string, index: number) {
  const correlationId = crypto.randomUUID();
  logger.info('Playback started', { correlationId, index, textLength: text.length });
  
  try {
    // ... playback logic
    logger.debug('Audio generated', { correlationId, duration: 1234 });
  } catch (error) {
    logger.error('Playback failed', { 
      correlationId, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    throw error;
  }
}
```

**Log Level Guidelines**:
| Level | When to Use | Example |
|-------|-------------|---------|
| debug | Detailed flow info | "Cache key derived: abc123" |
| info | Significant events | "Playback started" |
| warn | Recoverable issues | "Cache miss, generating audio" |
| error | Failures requiring attention | "API request failed" |

**Alternatives Considered**:
- Console.log everywhere: No structure, hard to filter
- Third-party logging library: Adds bundle size
- No logging: Impossible to debug production issues

**Links**:
- [12 Factor App: Logs](https://12factor.net/logs)

---

### 3.2 Error Boundaries and Recovery

**Decision**: Implement error boundaries at message handler level; use typed error classes; provide graceful degradation paths.

**Rationale**:
- Message handlers are natural error boundaries in extensions
- Typed errors enable specific recovery strategies
- Users should never see raw error messages
- Background script errors should not crash the extension

**Pattern Implementation**:

```typescript
// Typed error hierarchy
class VoxPageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = true
  ) {
    super(message);
    this.name = 'VoxPageError';
  }
}

class NetworkError extends VoxPageError {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR', true);
  }
}

class ApiKeyError extends VoxPageError {
  constructor(message: string) {
    super(message, 'API_KEY_ERROR', false);
  }
}

class QuotaExceededError extends VoxPageError {
  constructor(message: string) {
    super(message, 'QUOTA_EXCEEDED', false);
  }
}

// Error boundary wrapper for handlers
function withErrorBoundary<T>(
  handler: () => Promise<T>,
  fallback: T | (() => T)
): Promise<T> {
  return handler().catch((error) => {
    if (error instanceof VoxPageError) {
      logger.warn(`Handled error: ${error.code}`, { message: error.message });
      
      if (error.recoverable) {
        return typeof fallback === 'function' ? fallback() : fallback;
      }
    }
    
    logger.error('Unhandled error in handler', { 
      error: error instanceof Error ? error.message : 'Unknown' 
    });
    
    return typeof fallback === 'function' ? fallback() : fallback;
  });
}

// Message handler with error boundary
const handlers: MessageHandlers = {
  'playback.start': async (msg) => {
    return withErrorBoundary(
      async () => {
        const result = await playbackService.play(msg.text, msg.index);
        return { success: true, result };
      },
      { success: false, error: 'Playback failed' }
    );
  },
};
```

**Recovery Strategies by Error Type**:
| Error Type | Recovery Strategy |
|------------|-------------------|
| NetworkError | Retry with exponential backoff |
| ApiKeyError | Show settings UI, disable TTS |
| QuotaExceededError | Show upgrade prompt, use browser TTS |
| CacheError | Clear cache, continue without |

**Alternatives Considered**:
- Global error handler only: Loses context
- No error boundaries: Crashes propagate
- String error codes: No type safety

---

### 3.3 Rate Limiting and Retry

**Decision**: Implement exponential backoff with jitter for API retries; respect rate limit headers; implement client-side rate limiting.

**Rationale**:
- External APIs have rate limits (ElevenLabs: 10 req/sec)
- Exponential backoff prevents thundering herd
- Jitter prevents synchronized retries
- Client-side limiting avoids hitting server limits

**Pattern Implementation**:

```typescript
interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: string[];
}

async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    retryableErrors: ['NETWORK_ERROR', 'RATE_LIMITED'],
  }
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      const isRetryable = error instanceof VoxPageError && 
        config.retryableErrors.includes(error.code);
      
      if (!isRetryable || attempt === config.maxAttempts) {
        throw error;
      }
      
      // Exponential backoff with jitter
      const delay = Math.min(
        config.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000,
        config.maxDelayMs
      );
      
      logger.info(`Retry attempt ${attempt}/${config.maxAttempts}`, { delay });
      await sleep(delay);
    }
  }
  
  throw lastError;
}

// Client-side rate limiter
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  
  constructor(
    private maxTokens: number = 10,
    private refillRate: number = 1000 // ms per token
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }
  
  async acquire(): Promise<void> {
    this.refill();
    
    if (this.tokens <= 0) {
      const waitTime = this.refillRate - (Date.now() - this.lastRefill);
      await sleep(waitTime);
      this.refill();
    }
    
    this.tokens--;
  }
  
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = Math.floor(elapsed / this.refillRate);
    
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }
}
```

**Alternatives Considered**:
- No retry: Single failures cause bad UX
- Fixed delay retry: Can still cause thundering herd
- No client-side limiting: Relies on server 429s

**Links**:
- [AWS: Exponential Backoff And Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)

---

### 3.4 Telemetry Without PII

**Decision**: Collect only aggregate/anonymous metrics; never log URLs, text content, or API keys; use content hashes for debugging.

**Rationale**:
- User privacy is paramount
- URLs can reveal browsing history
- Text content can contain sensitive information
- Hashes enable debugging without exposing content

**Safe vs Unsafe Data**:
| Data | Safe? | Alternative |
|------|-------|-------------|
| Full URL | No | Domain only or hash |
| Text content | No | Character count, word count |
| API key | No | "key_present: true/false" |
| Paragraph index | Yes | Keep as-is |
| Provider name | Yes | Keep as-is |
| Error messages | Maybe | Sanitize, remove user data |
| Session duration | Yes | Keep as-is |

**Pattern Implementation**:

```typescript
interface TelemetryEvent {
  eventName: string;
  timestamp: string;
  sessionId: string; // Random, not tied to user
  properties: Record<string, string | number | boolean>;
}

function sanitizeForTelemetry(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Never include these fields
    if (['url', 'text', 'apiKey', 'content'].includes(key)) {
      continue;
    }
    
    // Hash URLs if needed for debugging
    if (key === 'urlHash' && typeof value === 'string') {
      sanitized.urlHash = hashCode(value);
      continue;
    }
    
    // Convert text to metrics
    if (key === 'textLength' || key === 'wordCount') {
      sanitized[key] = value;
      continue;
    }
    
    // Safe primitives
    if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    }
    
    // Safe string values (non-sensitive)
    if (typeof value === 'string' && !containsPII(value)) {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

// Usage
telemetry.track('playback_started', sanitizeForTelemetry({
  provider: 'elevenlabs',
  paragraphIndex: 5,
  textLength: text.length,
  wordCount: text.split(/\s+/).length,
  urlHash: hashCode(url), // Hash, not raw URL
  cached: true,
}));
```

**Alternatives Considered**:
- No telemetry: Can't improve product
- Full data collection: Privacy violation
- Opt-in only: Low adoption, biased data

**Links**:
- [Extension Workshop: Best practices for collecting user data consents](https://extensionworkshop.com/documentation/develop/best-practices-for-collecting-user-data-consents/)

---

## 4. State Management

### 4.1 Single Source of Truth

**Decision**: Background script owns all state; content scripts and popup receive state via messages; use state update events for reactivity.

**Rationale**:
- Extensions have multiple execution contexts that can get out of sync
- Background script is the only persistent context
- State should flow down (background -> content/popup), actions flow up
- Prevents state conflicts and race conditions

**Pattern Implementation**:

```typescript
// State definitions
interface PlaybackState {
  status: 'stopped' | 'loading' | 'playing' | 'paused';
  currentParagraph: number;
  totalParagraphs: number;
  progress: number;
  speed: number;
}

interface AppState {
  playback: PlaybackState;
  settings: Settings;
}

// Background: State owner and broadcaster
class StateManager {
  private state: AppState;
  private subscribers: Set<number> = new Set(); // Tab IDs
  
  constructor(initialState: AppState) {
    this.state = initialState;
  }
  
  getState(): AppState {
    return { ...this.state }; // Return copy
  }
  
  updateState(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial };
    this.broadcast();
  }
  
  subscribe(tabId: number): void {
    this.subscribers.add(tabId);
    // Send current state immediately
    this.sendToTab(tabId, { type: 'STATE_UPDATE', state: this.state });
  }
  
  unsubscribe(tabId: number): void {
    this.subscribers.delete(tabId);
  }
  
  private broadcast(): void {
    for (const tabId of this.subscribers) {
      this.sendToTab(tabId, { type: 'STATE_UPDATE', state: this.state });
    }
  }
  
  private async sendToTab(tabId: number, message: unknown): Promise<void> {
    try {
      await browser.tabs.sendMessage(tabId, message);
    } catch {
      // Tab may be closed
      this.subscribers.delete(tabId);
    }
  }
}

// Content script: State consumer
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATE_UPDATE') {
    updateUI(message.state);
  }
});

// Request current state on load
browser.runtime.sendMessage({ type: 'STATE_GET' });
```

**Alternatives Considered**:
- State in each context: Sync issues, conflicts
- `storage.session` as state: Serialization overhead
- Event sourcing: Over-engineering for extension

---

### 4.2 Settings Synchronization

**Decision**: Settings stored in `storage.local`; changes trigger `storage.onChanged` events; services reconfigure on change.

**Rationale**:
- `storage.onChanged` provides built-in reactivity
- No custom pub/sub needed
- Settings persist across sessions
- Multiple contexts can listen independently

**Pattern Implementation**:

```typescript
// Settings schema
interface Settings {
  provider: 'elevenlabs' | 'browser';
  voice: string | null;
  speed: number;
  highlightMode: 'sentence' | 'word' | 'none';
  theme: 'light' | 'dark' | 'system';
}

const DEFAULT_SETTINGS: Settings = {
  provider: 'elevenlabs',
  voice: null,
  speed: 1.0,
  highlightMode: 'sentence',
  theme: 'system',
};

// Settings service
class SettingsService {
  private cache: Settings | null = null;
  
  async get(): Promise<Settings> {
    if (this.cache) return this.cache;
    
    const stored = await browser.storage.local.get('settings');
    this.cache = { ...DEFAULT_SETTINGS, ...stored.settings };
    return this.cache;
  }
  
  async set(partial: Partial<Settings>): Promise<void> {
    const current = await this.get();
    const updated = { ...current, ...partial };
    await browser.storage.local.set({ settings: updated });
    this.cache = updated;
  }
  
  // Call during initialization
  setupChangeListener(onUpdate: (settings: Settings) => void): void {
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes.settings) return;
      
      this.cache = changes.settings.newValue;
      onUpdate(this.cache);
    });
  }
}

// Usage in background
const settingsService = new SettingsService();
settingsService.setupChangeListener((settings) => {
  container.reconfigure(settings);
  broadcastStateUpdate();
});
```

---

### 4.3 Hot-Reload of Configuration

**Decision**: Support runtime reconfiguration without extension reload; use adapter factory pattern for swappable implementations.

**Rationale**:
- Users shouldn't need to reload extension after settings change
- Provider switching should be seamless
- Adapter interfaces enable implementation swapping
- Factory pattern defers instantiation

**Pattern Implementation**:

```typescript
// Adapter factory
type AdapterFactory<T> = (config: Config) => T;

const audioGeneratorFactories: Record<string, AdapterFactory<IAudioGenerator>> = {
  elevenlabs: (config) => new ElevenLabsAdapter(config.apiKeys.elevenlabs),
  browser: () => new BrowserTTSAdapter(),
  openai: (config) => new OpenAIAdapter(config.apiKeys.openai),
};

// Reconfigurable container
class ReconfigurableContainer {
  private config: Config;
  private _audioGenerator: IAudioGenerator;
  
  constructor(config: Config) {
    this.config = config;
    this._audioGenerator = this.createAudioGenerator();
  }
  
  get audioGenerator(): IAudioGenerator {
    return this._audioGenerator;
  }
  
  reconfigure(partial: Partial<Config>): void {
    const newConfig = { ...this.config, ...partial };
    
    // Check if provider changed
    if (partial.provider && partial.provider !== this.config.provider) {
      logger.info('Switching audio provider', { 
        from: this.config.provider, 
        to: partial.provider 
      });
      this._audioGenerator = this.createAudioGenerator(newConfig);
    }
    
    this.config = newConfig;
  }
  
  private createAudioGenerator(config = this.config): IAudioGenerator {
    const factory = audioGeneratorFactories[config.provider];
    if (!factory) {
      logger.warn(`Unknown provider ${config.provider}, falling back to browser`);
      return audioGeneratorFactories.browser(config);
    }
    return factory(config);
  }
}
```

**Alternatives Considered**:
- Require reload: Poor UX
- Singleton adapters: Can't swap implementations
- No hot-reload: Settings changes don't apply immediately

---

## Summary of Key Decisions

| Topic | Decision | Key Benefit |
|-------|----------|-------------|
| Messaging | One-off for request-response, connections for streaming | Simplicity + efficiency |
| Storage | `storage.local` for persistence, `onChanged` for reactivity | Built-in sync |
| Background | Event pages with state persistence | Resource efficiency |
| API Keys | Local storage, validate on entry, never log | Security |
| Contract Tests | Run against mocks and real services | Prevent mock drift |
| Composition Root | Testable with mock adapters | Verify wiring |
| Mocking | Stubs, mocks, and in-memory implementations | Appropriate test doubles |
| Integration Tests | Test through ports | Refactoring resilience |
| Logging | Structured JSON with correlation IDs | Debuggability |
| Error Handling | Typed errors with boundaries | Graceful degradation |
| Retry | Exponential backoff with jitter | Resilience |
| Telemetry | Anonymous metrics, no PII | Privacy |
| State | Background owns, broadcasts updates | Single source of truth |
| Settings | `storage.local` with `onChanged` | Reactive updates |
| Hot-Reload | Adapter factories | Seamless reconfiguration |
