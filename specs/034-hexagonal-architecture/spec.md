# Feature Specification: Hexagonal Architecture Activation & Legacy Handler Migration

**Feature Branch**: `034-hexagonal-architecture`
**Created**: 2026-01-06
**Updated**: 2026-01-06 (Phase 2: Activation & Migration Planning)
**Status**: Draft
**Input**: "Fully activate the hexagonal handler pipeline and progressively remove legacy handlers safely"

---

## 1. Problem Statement

### 1.1 What Hurts Today

The VoxPage browser extension is mid-migration to hexagonal architecture. The foundation exists (ports, adapters, services, handlers), but it's **not fully operational**:

| Metric | Current State | Target |
|--------|--------------|--------|
| `background.ts` LOC | **2,048 lines** (includes instrumentation) | <300 lines |
| Legacy inline handlers | **~46 handlers** | 0 handlers |
| Hexagonal handlers | 19 registered | 65+ (all message types) |
| Dual dispatch overhead | Yes (try hex → fall back legacy) | Single path |
| PlaybackService availability | **Sometimes unavailable** | Always available |

**Evidence** (from codebase analysis):
- `src/entrypoints/background.ts` lines 71-1666: ~1,500 LOC of legacy inline handlers
- `src/entrypoints/background.ts` lines 1808-1824: Strangler Fig dispatch (hex first, legacy fallback)
- `src/composition/container.ts` lines 86-99: Conditional service creation (4 adapters required)
- `src/handlers/registry.ts`: Only 19 handlers registered vs 65+ message types in protocol

### 1.2 Why It Matters

1. **Testability**: Legacy handlers in background.ts cannot be unit tested without browser context
2. **Maintainability**: 1,965 LOC file violates single-responsibility principle
3. **Reliability**: Dual dispatch path means bugs can hide in either path
4. **Performance**: Extra dispatch lookup on every message
5. **Confidence**: No telemetry to prove hexagonal path is actually being used

### 1.3 Root Causes

1. **Incomplete service layer**: Only PlaybackService and ContentExtractionService exist
2. **Missing handler registration**: 46+ message types have no hexagonal handler
3. **No verification mechanism**: Cannot confirm which path handled a message
4. **Graceful degradation hides failures**: Silent fallback to legacy masks hex failures

---

## 2. Goals / Non-Goals

### 2.1 Goals

| ID | Goal | Measurable Outcome |
|----|------|-------------------|
| G1 | **Verify hexagonal dispatch works** | Telemetry shows 100% of target messages use hex path |
| G2 | **Reduce background.ts to composition root** | <300 LOC (currently 1,965) |
| G3 | **Retire all legacy handlers** | 0 inline handlers in background.ts |
| G4 | **Maintain browser correctness** | All manual smoke tests pass in Firefox 100+ |
| G5 | **Enable rollback per phase** | Feature flag per handler domain |
| G6 | **Prove adapter interchangeability** | Contract tests pass for all adapters |

### 2.2 Non-Goals

- **NG1**: No new user-facing features
- **NG2**: No changes to message type names or payloads (backward compatible)
- **NG3**: No changes to storage format or keys
- **NG4**: No bundler/build system changes (stay with WXT/Vite)
- **NG5**: No new external dependencies (use existing patterns)

---

## 3. Glossary

| Term | Definition |
|------|------------|
| **Port** | Interface defining a dependency contract (e.g., `IAudioGenerator`). Lives in `src/ports/`. |
| **Adapter** | Concrete implementation of a port (e.g., `OpenAIAudioAdapter`). Lives in `src/adapters/`. |
| **Handler** | Function that processes a message type, calling domain services. Lives in `src/handlers/`. |
| **Legacy Handler** | Inline function in `background.ts` that processes messages without hexagonal dispatch. |
| **Handler Registry** | Central dispatcher mapping message names to handler functions (`src/handlers/registry.ts`). |
| **Dispatch** | Routing an incoming message to its handler via the registry. |
| **Message Envelope** | The runtime message object `{ type: string, data: unknown }` from @webext-core/messaging. |
| **Composition Root** | Single location where all dependencies are wired (`src/composition/`). |
| **Strangler Fig** | Migration pattern where new code wraps/replaces legacy code incrementally. |
| **Result<T,E>** | Type-safe error handling discriminated union (`src/core/shared/result.ts`). |
| **Contract Test** | Test verifying an adapter implements its port interface correctly. |
| **Service Worker** | MV3 background script context (non-persistent, can be suspended). |

---

## 4. Current-State Architecture Snapshot (As-Is)

### 4.1 File Inventory

```
src/entrypoints/background.ts    1,965 LOC  ← TARGET FOR REDUCTION
src/background/init-hexagonal.ts   164 LOC  ← Hex initialization
src/composition/container.ts       238 LOC  ← DI container
src/composition/factories.ts       162 LOC  ← Adapter factories
src/handlers/registry.ts           193 LOC  ← Handler dispatch
src/handlers/playback.handlers.ts  337 LOC  ← 7 playback handlers
src/handlers/cache.handlers.ts     150 LOC  ← Cache handlers
src/handlers/content.handlers.ts   150 LOC  ← Content handlers
src/ports/*.ts                     320 LOC  ← 6 port interfaces
src/adapters/**/*.ts             1,100 LOC  ← 17 adapters
src/core/**/*.ts                   400 LOC  ← 2 domain services
```

### 4.2 Port & Adapter Status

| Port | Adapters | Contract Test | Mock | Status |
|------|----------|---------------|------|--------|
| `IAudioGenerator` | 5 (OpenAI, ElevenLabs, Groq, Cartesia, Browser) | ✓ | ✓ | Ready |
| `ICacheStore` | 2 (IndexedDB, InMemory) | ✓ | ✓ | Ready |
| `ITextExtractor` | 1 (Readability) | ✓ | ✓ | Ready |
| `IContentScorer` | 1 (Trafilatura) | ✓ | ✓ | Ready |
| `IHighlightSynchronizer` | 2 (TabMessaging, NoOp) | ✓ | ✓ | Ready |
| `ISettingsStore` | 1 (BrowserStorage) | ✓ | ✓ | Ready |

### 4.3 Message Handler Coverage

**Hexagonal Handlers (19 registered)**:
- `playback.*` (7): getState, start, pause, resume, stop, next, previous
- `cache.*` (6): getStats, clear, clearUrl, check, get, set
- `content.*` (4): extract, score, findDOMElements, getState
- `hexagonal.getStatus` (1): Debug info

**Legacy Handlers Still in background.ts (~46)**:
- Playback: startPlayback, pausePlayback, stopPlayback, seekToPosition, etc.
- Audio: audio.generate, getVoices, setVoice, testApiKey
- Provider: provider.select, validateLanguageSupport
- Settings: settings.get, settings.update, settings.migrate
- Footer: FOOTER_ACTION, FOOTER_SHOW, FOOTER_HIDE
- Prefetch: prefetch.start, prefetch.stop, prefetch.getStatus
- Cost: cost.estimate
- PDF: pdf.extract, pdf.detected, pdf.ocr
- Queue: queue.add, queue.remove, queue.play
- Export/OCR/Summarize: (roadmap features)

### 4.4 Current Dispatch Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   browser.runtime.onMessage                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  background.ts:1796-1853 (Strangler Fig Dispatch)               │
│                                                                  │
│  1. Translate: LEGACY_TO_HEXAGONAL_MAP[type] || type            │
│  2. Try hex:   dispatchToHexagonal(hexType, data)               │
│  3. If null:   messageHandlers[type](data)  ← LEGACY FALLBACK   │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│  Hexagonal Path (19)    │     │  Legacy Path (~46)      │
│                         │     │                         │
│  HandlerRegistry        │     │  messageHandlers{}      │
│  → PlaybackService      │     │  → inline functions     │
│  → ContentExtrService   │     │  → global state         │
│  → Adapters             │     │  → direct API calls     │
└─────────────────────────┘     └─────────────────────────┘
```

### 4.5 Browser Context Map

| Context | Role | Persistence | Message API |
|---------|------|-------------|-------------|
| **Background (Service Worker)** | Playback, TTS, caching | Non-persistent (5-30s timeout) | `browser.runtime.onMessage` |
| **Content Script** | DOM access, highlighting | Per-tab | `browser.runtime.sendMessage` |
| **Popup** | UI, controls | Transient (closes on blur) | `browser.runtime.sendMessage` |
| **Options** | Settings | Tab-based | `browser.runtime.sendMessage` |

**Critical**: Service worker can be suspended. Global variables (including container singleton) will be lost. Must re-initialize on wake.

---

## 5. Target-State Architecture (To-Be)

### 5.1 Target File Structure

```
src/entrypoints/background.ts        <300 LOC  ← Composition root only
src/composition/
  ├── container.ts                   238 LOC   (unchanged)
  ├── factories.ts                   162 LOC   (unchanged)
  └── bootstrap.ts                   NEW ~100 LOC  ← Initialization orchestration
src/handlers/
  ├── registry.ts                    193 LOC   (unchanged)
  ├── playback.handlers.ts           337 LOC   (expanded)
  ├── cache.handlers.ts              200 LOC   (expanded)
  ├── content.handlers.ts            200 LOC   (expanded)
  ├── audio.handlers.ts              NEW ~150 LOC
  ├── provider.handlers.ts           NEW ~100 LOC
  ├── settings.handlers.ts           NEW ~150 LOC
  ├── footer.handlers.ts             NEW ~100 LOC
  ├── prefetch.handlers.ts           NEW ~100 LOC
  ├── pdf.handlers.ts                NEW ~150 LOC
  ├── queue.handlers.ts              NEW ~150 LOC
  └── index.ts                       NEW ~50 LOC  ← Barrel export
```

### 5.2 Target Dispatch Flow (Single Path)

```
┌─────────────────────────────────────────────────────────────────┐
│                   browser.runtime.onMessage                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  background.ts (<300 LOC)                                        │
│                                                                  │
│  1. Ensure container initialized (lazy, handles SW wake)         │
│  2. Dispatch to HandlerRegistry (single path)                   │
│  3. Return Result<T, E> or error response                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  HandlerRegistry (65+ handlers)                                  │
│                                                                  │
│  playback.* → PlaybackService                                   │
│  cache.* → CacheStore adapter                                    │
│  content.* → ContentExtractionService                            │
│  audio.* → AudioGenerator adapter                                │
│  settings.* → SettingsStore adapter                              │
│  footer.* → HighlightSync adapter                                │
│  ...etc                                                          │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Module Responsibilities

| Module | Responsibility | Dependencies |
|--------|---------------|--------------|
| `background.ts` | Event listener registration, composition root invocation | composition/* |
| `bootstrap.ts` | Container initialization, handler registration, lazy wake-up | container, factories, handlers |
| `container.ts` | DI container lifecycle (create, get, reset) | factories |
| `factories.ts` | Adapter instantiation (switch on config) | adapters/* |
| `registry.ts` | Handler dispatch (name → handler → Result) | None |
| `*.handlers.ts` | Message-to-service delegation | services, adapters |

### 5.4 Dependency Boundaries (Enforced)

```
┌─────────────────────────────────────────────────────────────────┐
│  CORE (src/core/)                                                │
│  - Pure business logic                                           │
│  - No imports from adapters, ports, or browser APIs              │
│  - Only depends on: shared/result.ts, shared/errors.ts           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (depends on)
┌─────────────────────────────────────────────────────────────────┐
│  PORTS (src/ports/)                                              │
│  - Interface definitions only                                    │
│  - No implementations                                            │
│  - No browser API imports                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (implements)
┌─────────────────────────────────────────────────────────────────┐
│  ADAPTERS (src/adapters/)                                        │
│  - Implement port interfaces                                     │
│  - Contain all browser API, IndexedDB, fetch calls               │
│  - Can import from ports (interfaces) and core (types)           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (wired by)
┌─────────────────────────────────────────────────────────────────┐
│  COMPOSITION (src/composition/)                                  │
│  - Wires adapters to ports                                       │
│  - Creates services with injected dependencies                   │
│  - Only place that imports both adapters AND services            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Phased Migration Plan

### Phase 0: Instrumentation & Verification (Baseline)

**Goal**: Prove hexagonal dispatch is working; establish telemetry baseline.

**Deliverables**:
1. Add dispatch telemetry to `dispatchToHexagonal()`:
   - Log: `{ type, path: 'hex' | 'legacy', durationMs, success }`
   - Store in `browser.storage.local` under `__hex_dispatch_log`
2. Add `hexagonal.getDispatchStats` handler returning aggregated stats
3. Add debug console command: `__voxpage_hex_stats()` (dev builds only)

**Verification**:
```typescript
// Expected output after Phase 0:
{
  total: 100,
  hex: 19,      // Messages handled by hexagonal
  legacy: 81,   // Messages handled by legacy
  hexPercent: 19
}
```

**Checkpoint**: Telemetry working; baseline recorded.

**Rollback**: Remove telemetry code (no functional changes).

---

### Phase 1: Complete PlaybackService Availability

**Goal**: Ensure PlaybackService is always available (currently conditional).

**Problem** (from `container.ts:86-99`):
```typescript
// PlaybackService only created if ALL 4 adapters available
if (adapters.audioGenerator && adapters.cacheStore &&
    adapters.highlightSync && adapters.settingsStore) {
  services.playback = new PlaybackService(...)
}
```

**Deliverables**:
1. Fix adapter initialization order (cacheStore depends on IndexedDB async init)
2. Add fallback for missing adapters (NoOpHighlightSync, InMemoryCacheStore)
3. Verify PlaybackService always exists after container creation

**Verification**:
```typescript
const status = await browser.runtime.sendMessage({ type: 'hexagonal.getStatus' });
assert(status.services.includes('PlaybackService')); // Always true
```

**Checkpoint**: PlaybackService available in 100% of container initializations.

**Rollback**: Revert container.ts changes; hex dispatch continues with fallback.

---

### Phase 2: Migrate Playback Handlers

**Goal**: Route all playback messages through hexagonal handlers; remove legacy.

**Scope** (8 message types):
- `startPlayback` → `playback.start`
- `pausePlayback` → `playback.pause`
- `stopPlayback` → `playback.stop`
- `seekToPosition` → `playback.seek`
- `nextParagraph` → `playback.next`
- `previousParagraph` → `playback.previous`
- `getPlaybackState` → `playback.getState`
- `setSpeed` → `playback.setSpeed`

**Deliverables**:
1. Ensure all 8 handlers registered in `playback.handlers.ts`
2. Add mappings to `LEGACY_TO_HEXAGONAL_MAP`
3. Verify via telemetry: 100% playback messages use hex path
4. Remove legacy handlers from `messageHandlers{}` in background.ts

**Verification**:
```typescript
const stats = await getDispatchStats();
assert(stats.byDomain.playback.hex === stats.byDomain.playback.total);
```

**Checkpoint**: Zero legacy playback handlers in background.ts.

**Rollback**: Re-add legacy handlers to `messageHandlers{}`; add feature flag `USE_LEGACY_PLAYBACK=true`.

---

### Phase 3: Migrate Audio & Provider Handlers

**Goal**: Route audio generation and provider messages through hexagonal handlers.

**Scope** (7 message types):
- `getVoices` → `audio.getVoices`
- `setVoice` → `audio.setVoice`
- `testApiKey` → `audio.validateCredentials`
- `provider.select` → `provider.select`
- `provider.getList` → `provider.getList`
- `validateLanguageSupport` → `provider.validateLanguage`
- `audio.generate` → `audio.generate`

**Deliverables**:
1. Create `audio.handlers.ts` and `provider.handlers.ts`
2. Create necessary services/facade if needed
3. Register handlers, add mappings
4. Remove legacy handlers

**Verification**: 100% audio/provider messages use hex path.

**Checkpoint**: Zero legacy audio/provider handlers.

**Rollback**: Feature flag `USE_LEGACY_AUDIO=true`.

---

### Phase 4: Migrate Settings & Footer Handlers

**Goal**: Route settings and UI coordination through hexagonal handlers.

**Scope** (10 message types):
- `settings.get`, `settings.update`, `settings.migrate`
- `settings.testApiKey`, `settings.getTheme`, `settings.setTheme`
- `FOOTER_ACTION`, `FOOTER_SHOW`, `FOOTER_HIDE`
- `FOOTER_STATE_UPDATE`

**Deliverables**:
1. Create `settings.handlers.ts` and `footer.handlers.ts`
2. Register handlers, add mappings
3. Remove legacy handlers

**Verification**: 100% settings/footer messages use hex path.

**Checkpoint**: Zero legacy settings/footer handlers.

**Rollback**: Feature flag `USE_LEGACY_SETTINGS=true`.

---

### Phase 5: Migrate Cache & Prefetch Handlers

**Goal**: Route cache operations through hexagonal handlers.

**Scope** (10 message types):
- `getCachedParagraphs`, `cost.estimate`
- `prefetch.start`, `prefetch.stop`, `prefetch.getStatus`, `prefetch.clearBuffer`
- `cache.getStats`, `cache.clear`, `cache.check`, `cache.get`

**Deliverables**:
1. Expand `cache.handlers.ts`
2. Create `prefetch.handlers.ts` (or merge into cache)
3. Register handlers, add mappings
4. Remove legacy handlers

**Verification**: 100% cache/prefetch messages use hex path.

**Checkpoint**: Zero legacy cache handlers.

**Rollback**: Feature flag `USE_LEGACY_CACHE=true`.

---

### Phase 6: Migrate PDF, Queue, Roadmap Handlers

**Goal**: Route remaining feature handlers through hexagonal path.

**Scope** (~20 message types):
- `pdf.*` (8): detected, extract, ocr, getState, play, seek, highlight, scrollToPage
- `queue.*` (9): add, remove, reorder, updateStatus, updateProgress, clear, getState, play, playNext
- `export.*`, `summarize.*`, `ocr.*` (roadmap features)

**Deliverables**:
1. Create `pdf.handlers.ts`, `queue.handlers.ts`
2. Register handlers, add mappings
3. Remove legacy handlers

**Verification**: 100% of all message types use hex path (telemetry shows legacy=0).

**Checkpoint**: Zero legacy handlers in background.ts.

**Rollback**: Feature flags per domain.

---

### Phase 7: Cleanup & Final Reduction

**Goal**: Remove Strangler Fig scaffolding; achieve <300 LOC background.ts.

**Deliverables**:
1. Remove `LEGACY_TO_HEXAGONAL_MAP` (no longer needed)
2. Remove `messageHandlers{}` object (empty)
3. Remove dual dispatch logic
4. Extract remaining initialization to `bootstrap.ts`
5. Final background.ts contains only:
   - Event listener registration
   - Composition root invocation
   - Error boundary

**Verification**:
```bash
wc -l src/entrypoints/background.ts  # <300
```

**Checkpoint**: background.ts <300 LOC; all tests pass; manual smoke test pass.

**Rollback**: This is the final phase. Rollback = revert to Phase 6 state.

---

## 7. Acceptance Criteria

### 7.1 Quantitative Criteria

| ID | Criterion | Measurement | Target |
|----|-----------|-------------|--------|
| AC-01 | background.ts LOC | `wc -l` | <300 |
| AC-02 | Legacy handlers count | grep in background.ts | 0 |
| AC-03 | Hexagonal handler coverage | Registry.getHandlerNames().length | 65+ |
| AC-04 | Dispatch telemetry legacy % | getDispatchStats().legacyPercent | 0% |
| AC-05 | Unit test execution time | Jest --coverage | <5s |
| AC-06 | Circular dependencies | `pnpm run deps:check` | 0 |
| AC-07 | Code duplication | `pnpm run duplication` | <2% |
| AC-08 | Contract test coverage | Ports with contract tests | 6/6 |

### 7.2 Qualitative Criteria

| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-09 | PlaybackService always available | `hexagonal.getStatus` in 10 consecutive loads |
| AC-10 | All adapters interchangeable | Contract tests pass for all 6 ports (adapters implementing same port are interchangeable by definition) |
| AC-11 | Service worker wake-up resilient | Test after forced suspension |
| AC-12 | Manual smoke test pass | Play article in Firefox 112+ |
| AC-13 | Rollback works | Enable feature flag, verify legacy path works |

---

## 8. Verification Plan

### 8.1 Validating Adapters in Real Browser Context

**Approach**: Integration tests using web-ext and actual browser.

```bash
# Run in Firefox with extension loaded
pnpm run dev:firefox

# Execute browser console commands:
await browser.runtime.sendMessage({ type: 'hexagonal.getStatus' })
// Verify: all adapters listed, all services available

await browser.runtime.sendMessage({ type: 'playback.start', data: { mode: 'article' } })
// Verify: audio plays, highlighting works
```

**Automated verification** (Playwright):
```typescript
test('adapter integration', async ({ page, extensionId }) => {
  await page.goto('https://example.com/article');
  const status = await page.evaluate(() =>
    browser.runtime.sendMessage({ type: 'hexagonal.getStatus' })
  );
  expect(status.adapters).toContain('OpenAIAudioAdapter');
  expect(status.services).toContain('PlaybackService');
});
```

### 8.2 Confirming Which Path Handled a Request

**Telemetry approach** (Phase 0 deliverable):

```typescript
// In dispatchToHexagonal():
const start = performance.now();
const result = await registry.dispatch(type, data);
const path = result !== null ? 'hex' : 'legacy';
const duration = performance.now() - start;

// Log to storage for later analysis
await logDispatch({ type, path, duration, timestamp: Date.now() });
```

**Runtime verification**:
```typescript
// Debug command in console:
const log = await browser.storage.local.get('__hex_dispatch_log');
console.table(log.__hex_dispatch_log.slice(-20));
// Shows: type, path, duration for last 20 messages
```

### 8.3 Contract Test Verification

```bash
# Run contract tests for all ports
pnpm test -- --testPathPattern="contract"

# Expected output:
# PASS tests/contract/audio-generator.contract.test.ts
# PASS tests/contract/cache-store.contract.test.ts
# PASS tests/contract/content-scorer.contract.test.ts
# PASS tests/contract/text-extractor.contract.test.ts
# PASS tests/contract/highlight-sync.contract.test.ts    ← NEW
# PASS tests/contract/settings-store.contract.test.ts    ← NEW
```

---

## 9. Risks & Mitigations

### 9.1 Service Worker Lifecycle

**Risk**: Service worker suspension loses container state mid-operation.

**Impact**: High - playback stops unexpectedly.

**Mitigation**:
1. Lazy initialization pattern: `getContainer()` re-creates if needed
2. Store critical state in `browser.storage.local` (not memory)
3. Audio playback keeps service worker alive (active audio element)
4. Test forced suspension in dev: `browser.test.suspendBackgroundScript()`

**Verification**:
```typescript
test('survives service worker suspension', async () => {
  await page.evaluate(() => browser.test.suspendBackgroundScript());
  await page.waitForTimeout(1000);
  const status = await page.evaluate(() =>
    browser.runtime.sendMessage({ type: 'hexagonal.getStatus' })
  );
  expect(status.initialized).toBe(true);
});
```

### 9.2 Incomplete Handler Migration Breaks Functionality

**Risk**: Removing legacy handler before hex handler is ready.

**Impact**: High - message returns error, feature broken.

**Mitigation**:
1. Telemetry verification before removal (100% hex path for type)
2. Feature flags for rollback per domain
3. Keep legacy handler commented (not deleted) for 1 phase
4. E2E smoke test after each phase

**Rollback**:
```typescript
// In background.ts:
const USE_LEGACY_PLAYBACK = localStorage.getItem('USE_LEGACY_PLAYBACK') === 'true';
if (USE_LEGACY_PLAYBACK) {
  messageHandlers['startPlayback'] = legacyStartPlayback;
}
```

### 9.3 Adapter Initialization Race Condition

**Risk**: Handler called before adapter fully initialized (especially IndexedDB).

**Impact**: Medium - first request fails, subsequent succeed.

**Mitigation**:
1. Async initialization barrier: `await ensureContainerReady()`
2. Retry mechanism in dispatch (1 retry after 100ms)
3. Return `{ pending: true }` if initializing, client polls

**Verification**:
```typescript
test('handles early message during init', async () => {
  // Send message immediately on extension load
  const result = await browser.runtime.sendMessage({ type: 'playback.getState' });
  expect(result.error).not.toBe('service_unavailable');
});
```

### 9.4 Message Type Name Mismatch

**Risk**: Legacy type name differs from hexagonal name; mapping missed.

**Impact**: Medium - message falls through to legacy (works but defeats purpose).

**Mitigation**:
1. Comprehensive mapping in `LEGACY_TO_HEXAGONAL_MAP`
2. Telemetry alert if legacy path used for "migrated" type
3. Contract test: every protocol type has hexagonal handler

**Verification**:
```typescript
test('all protocol types mapped', () => {
  const protocolTypes = Object.keys(VoxPageProtocol);
  const handlerNames = registry.getHandlerNames();
  for (const type of protocolTypes) {
    const hexType = LEGACY_TO_HEXAGONAL_MAP[type] || type;
    expect(handlerNames).toContain(hexType);
  }
});
```

### 9.5 Test Coverage Gap

**Risk**: Legacy code tested; hexagonal code untested.

**Impact**: Low-Medium - regression bugs.

**Mitigation**:
1. Require tests before legacy removal (test-first migration)
2. Contract tests for all ports (6/6 complete ✓)
3. Mock factory for all adapters (6/6 complete ✓)
4. Integration test for each message type

---

## 10. Open Questions (TBDs)

### TBD-1: Exact Service Worker Suspension Behavior in Firefox

**Question**: Does Firefox MV3 suspend service workers the same way Chrome does?

**Resolution Steps**:
1. Read Firefox WebExtension documentation on background scripts
2. Test with `about:debugging` → Inspect background script → Terminate
3. Verify container re-initialization after termination

**Owner**: Implementation phase

---

### TBD-2: IndexedDB Initialization Timing

**Question**: How long does IndexedDB cache store take to initialize?

**Resolution Steps**:
1. Add timing instrumentation to `IndexedDBCacheAdapter.init()`
2. Measure in Firefox dev tools (cold start, warm start)
3. Decide if initialization barrier or retry is better

**Owner**: Phase 1

---

### TBD-3: Feature Flag Storage Location ✅ RESOLVED

**Question**: Where to store per-domain feature flags for rollback?

**Options**:
- `browser.storage.local` (persists, accessible everywhere) ← **CHOSEN**
- `localStorage` in background (service worker limitation?)
- Environment variable (build-time only)

**Resolution**: Use `browser.storage.local` for all feature flags. MV3 service workers have limited `localStorage` availability (may not persist across suspension). `browser.storage.local` is the standard WebExtension API and works reliably across all contexts.

**Implementation**: Feature flags stored under keys `USE_LEGACY_PLAYBACK`, `USE_LEGACY_AUDIO`, etc. Read via `browser.storage.local.get()` at dispatch time.

**Owner**: Phase 0 (resolved)

---

### TBD-4: Contract Test for IHighlightSynchronizer

**Question**: How to test browser.tabs.sendMessage in isolation?

**Resolution Steps**:
1. Review existing jest-webextension-mock usage in tests/setup.js
2. Create mock that captures sendMessage calls
3. Verify message format matches expected

**Owner**: Phase 1

---

### TBD-5: PlaybackService State Persistence

**Question**: Should PlaybackService state survive service worker suspension?

**Options**:
- A: No - playback stops on suspension (current behavior)
- B: Yes - persist to storage, resume on wake

**Trade-offs**:
- Option A: Simpler, but breaks long listening sessions
- Option B: Complex, risk of stale state

**Resolution**: Defer to user feedback post-migration. Start with Option A.

**Owner**: Post-migration

---

## 11. Research Brief

### Sources Consulted

1. **Hexagonal Architecture / Ports & Adapters**
   - Alistair Cockburn (original author): [angular.love/ports-and-adapters](https://angular.love/ports-and-adapters-vs-hexagonal-architecture-is-it-the-same-pattern/)
   - TSH.io Overview: [tsh.io/blog/hexagonal-architecture](https://tsh.io/blog/hexagonal-architecture)
   - TypeScript Example: [github.com/Sairyss/domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon)

2. **Composition Root Pattern**
   - Mark Seemann: [blog.ploeh.dk/2011/07/28/CompositionRoot](https://blog.ploeh.dk/2011/07/28/CompositionRoot/)
   - TypeScript Implementation: [timmykokke.com/blog/2023-06-20-compositionroot](https://timmykokke.com/blog/2023/2023-06-20-compositionroot-in-typescript/)

3. **Browser Extension Service Worker Lifecycle**
   - Chrome Official: [developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
   - Chrome Blog: [developer.chrome.com/blog/eyeos-journey-to-testing-mv3-service-worker-suspension](https://developer.chrome.com/blog/eyeos-journey-to-testing-mv3-service%20worker-suspension)

4. **Result Types / Error Handling**
   - neverthrow library: [github.com/supermacro/neverthrow](https://github.com/supermacro/neverthrow)

5. **Testing Strategy**
   - QWAN Test Architecture: [qwan.eu/2020/09/17/test-architecture](https://www.qwan.eu/2020/09/17/test-architecture.html)
   - jest-webextension-mock: [github.com/clarkbw/jest-webextension-mock](https://github.com/clarkbw/jest-webextension-mock)

6. **Strangler Fig Pattern**
   - Microsoft Azure: [learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig](https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig)

---

## Appendix A: Message Type Inventory

**Total Protocol Types**: 65+

<details>
<summary>Click to expand full list</summary>

| Domain | Legacy Name | Hexagonal Name | Handler Status |
|--------|-------------|----------------|----------------|
| playback | startPlayback | playback.start | ✓ Registered |
| playback | pausePlayback | playback.pause | ✓ Registered |
| playback | stopPlayback | playback.stop | ✓ Registered |
| playback | getPlaybackState | playback.getState | ✓ Registered |
| playback | nextParagraph | playback.next | ✓ Registered |
| playback | previousParagraph | playback.previous | ✓ Registered |
| playback | seekToPosition | playback.seek | Needs registration |
| playback | setSpeed | playback.setSpeed | Needs registration |
| audio | getVoices | audio.getVoices | Needs handler |
| audio | setVoice | audio.setVoice | Needs handler |
| audio | testApiKey | audio.validateCredentials | Needs handler |
| audio | audio.generate | audio.generate | Needs handler |
| provider | provider.select | provider.select | Needs handler |
| provider | provider.getList | provider.getList | Needs handler |
| provider | validateLanguageSupport | provider.validateLanguage | Needs handler |
| settings | settings.get | settings.get | Needs handler |
| settings | settings.update | settings.update | Needs handler |
| settings | settings.migrate | settings.migrate | Needs handler |
| footer | FOOTER_ACTION | footer.action | Needs handler |
| footer | FOOTER_SHOW | footer.show | Needs handler |
| footer | FOOTER_HIDE | footer.hide | Needs handler |
| cache | getCachedParagraphs | cache.getCachedParagraphs | Needs registration |
| cache | cost.estimate | cost.estimate | Needs handler |
| prefetch | prefetch.start | prefetch.start | Needs handler |
| prefetch | prefetch.stop | prefetch.stop | Needs handler |
| prefetch | prefetch.getStatus | prefetch.getStatus | Needs handler |
| pdf | pdf.detected | pdf.detected | Needs handler |
| pdf | pdf.extract | pdf.extract | Needs handler |
| ... | ... | ... | ... |

</details>

---

## Appendix B: Contract Test Template

```typescript
// tests/contract/example.contract.test.ts
import type { IExamplePort } from '@/ports/example.port';
import { Ok, Err } from '@/core/shared/result';

export function runExamplePortContractTests(
  adapterName: string,
  createAdapter: () => IExamplePort
) {
  describe(`${adapterName} implements IExamplePort contract`, () => {
    let adapter: IExamplePort;

    beforeEach(() => {
      adapter = createAdapter();
    });

    describe('requiredMethod', () => {
      it('returns Ok on valid input', async () => {
        const result = await adapter.requiredMethod({ valid: true });
        expect(result.ok).toBe(true);
      });

      it('returns Err with typed error on invalid input', async () => {
        const result = await adapter.requiredMethod({ valid: false });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.type).toBe('ValidationError');
        }
      });
    });
  });
}
```

---

*End of Specification*
