# Research: Hexagonal Architecture Refactoring

**Feature**: 034-hexagonal-architecture
**Date**: 2026-01-06
**Status**: Complete

## Research Tasks

### 1. Hexagonal Architecture Implementation in TypeScript

**Decision**: Adopt layer-first directory structure with explicit core/, ports/, adapters/ directories

**Rationale**:
- Layer-first makes the hexagonal layers visually obvious in the file system
- Works well with TypeScript barrel exports (index.ts per directory)
- Clearer for developers unfamiliar with codebase than module-first organization
- Aligns with existing utils/ structure while adding new architectural layers

**Alternatives Considered**:
- **Module-first (domain-driven)**: Groups all layers within each module (e.g., playback/domain/, playback/adapters/). Rejected because VoxPage has only 2 main domains (playback, content-extraction) - module-first adds unnecessary nesting.
- **Colocation with existing utils/**: Keep ports/adapters within utils/. Rejected because it obscures the architectural boundaries we're trying to establish.

**Sources**:
- [Domain-Driven Hexagon - GitHub](https://github.com/Sairyss/domain-driven-hexagon)
- [Hexagonal Architecture Frontend - Sergio Carracedo](https://sergiocarracedo.es/hexagonal-architecture-frontend/)

---

### 2. Dependency Injection Without Frameworks

**Decision**: Manual constructor injection with a composition root (factory-based container)

**Rationale**:
- No external DI library required - keeps bundle size minimal
- TypeScript interfaces provide compile-time type checking
- WXT/Vite tree-shaking works correctly with manual DI
- Easier to understand and debug than decorator-based DI
- Browser extension constraints (service worker lifecycle) don't work well with complex DI frameworks

**Implementation Pattern**:
```typescript
// composition/container.ts
export function createContainer(config: AppConfig) {
  // Create adapters
  const cacheStore = new IndexedDBCacheAdapter();
  const audioGenerator = createAudioGeneratorAdapter(config.provider, config.apiKeys);
  const highlightSync = new HighlightSyncAdapter();

  // Create services with injected dependencies
  const playbackService = new PlaybackService({
    audioGenerator,
    cacheStore,
    highlightSync,
  });

  return { playbackService, cacheStore, audioGenerator };
}
```

**Alternatives Considered**:
- **InversifyJS**: Full-featured DI container. Rejected due to decorator requirement and bundle size.
- **TSyringe**: Microsoft's lightweight DI. Rejected due to reflect-metadata requirement.
- **Service locator pattern**: Rejected due to implicit dependencies making testing harder.

**Sources**:
- [Clean Architecture with TypeScript - Khalil Stemmler](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/)
- [Ports and Adapters TypeScript - GitHub vloth](https://github.com/vloth/ports-and-adapters)

---

### 3. Migration Strategy: Strangler Fig Pattern

**Decision**: Incremental migration using adapter wrappers around existing code

**Rationale**:
- Preserves existing functionality during migration
- Each phase delivers testable, working code
- Can be paused or rolled back at any phase boundary
- Minimizes risk of breaking the 934 existing tests

**Migration Phases**:
1. **Phase 1**: Define port interfaces (no behavior change)
2. **Phase 2**: Create adapter wrappers around existing utils/ code
3. **Phase 3**: Extract PlaybackService, wire through composition root
4. **Phase 4**: Migrate message handlers to delegate to services
5. **Phase 5**: Extract ContentExtractionService
6. **Phase 6**: Consolidate duplicate provider implementations
7. **Phase 7**: Clean up legacy code paths

**Alternatives Considered**:
- **Big bang rewrite**: Rejected due to high risk and inability to verify correctness incrementally.
- **Parallel implementation**: Run old and new code simultaneously, compare results. Rejected due to complexity overhead for an internal refactoring.

**Sources**:
- [Hexagonal/Onion Architecture Migration Strategies - Java Code Geeks](https://www.javacodegeeks.com/2025/10/hexagonal-onion-architecture-in-a-real-java-codebase-migration-strategies.html)
- [Strangler Fig Pattern - Martin Fowler](https://martinfowler.com/bliki/StranglerFigApplication.html)

---

### 4. Port Interface Design Patterns

**Decision**: Use TypeScript interfaces with method-per-operation pattern, Result<T, E> for error handling

**Rationale**:
- Interfaces are erased at runtime (no overhead)
- Method-per-operation is more explicit than generic execute() pattern
- Result type makes error handling explicit without exceptions
- Aligns with existing Zod-first type approach

**Example Pattern**:
```typescript
// ports/audio-generator.port.ts
export interface IAudioGenerator {
  generateAudio(request: AudioRequest): Promise<Result<AudioResponse, AudioError>>;
  getVoices(language?: string): Promise<Result<Voice[], AudioError>>;
  validateCredentials(): Promise<boolean>;
}

// Typed errors instead of generic Error
export type AudioError =
  | { type: 'network'; message: string }
  | { type: 'rate_limit'; retryAfter: number }
  | { type: 'invalid_credentials' }
  | { type: 'unsupported_language'; language: string };
```

**Alternatives Considered**:
- **Abstract classes**: Rejected because they carry implementation, which violates port purity.
- **Generic Command/Query pattern**: Rejected due to added complexity for straightforward TTS operations.
- **Exception-based errors**: Rejected because Result type makes error cases explicit in type signature.

**Sources**:
- [How to Ports and Adapter with TypeScript - Medium](https://betterprogramming.pub/how-to-ports-and-adapter-with-typescript-32a50a0fc9eb)
- [TypeScript Error Handling - neverthrow library patterns](https://github.com/supermacro/neverthrow)

---

### 5. Testing Strategy for Hexagonal Architecture

**Decision**: Three-tier testing approach: Domain unit tests, Adapter contract tests, Integration tests

**Rationale**:
- Domain services tested with mock ports (fast, isolated)
- Adapters tested against port interface contract (ensures interchangeability)
- Integration tests verify wiring is correct
- Enables the <500ms test execution goal for unit tests

**Test Structure**:
```
tests/
├── unit/
│   └── core/                    # Pure domain logic - mock all ports
│       └── playback-service.test.ts
├── contract/
│   └── adapter-contracts.test.ts # Verifies adapters satisfy port interface
└── integration/
    └── composition.test.ts       # Verifies wiring works end-to-end
```

**Adapter Contract Test Pattern**:
```typescript
// Run same tests against all ICacheStore implementations
describe.each([
  ['IndexedDBCacheAdapter', () => new IndexedDBCacheAdapter()],
  ['InMemoryCacheAdapter', () => new InMemoryCacheAdapter()],
])('%s implements ICacheStore', (name, createAdapter) => {
  let adapter: ICacheStore;

  beforeEach(() => { adapter = createAdapter(); });

  it('stores and retrieves entries', async () => {
    await adapter.set('key', testData);
    expect(await adapter.get('key')).toEqual(testData);
  });

  // ... all ICacheStore contract tests
});
```

**Alternatives Considered**:
- **E2E only**: Rejected because slow and doesn't isolate bugs.
- **Unit tests with real adapters**: Rejected because requires IndexedDB mock setup.

**Sources**:
- [The Best Way to Test Hexagonal Architecture - Medium](https://medium.com/@TonyBologni/the-best-way-to-test-a-hexagonal-architecture-style-application-466606ebca7)
- [Testing Hexagonal Architecture - TSH.io](https://tsh.io/blog/hexagonal-architecture)

---

### 6. Handling Browser Extension Constraints

**Decision**: Adapters for browser APIs, ports for cross-context communication

**Rationale**:
- Service worker lifecycle requires stateless adapters or state restoration
- Content script isolation requires messaging adapter for highlight sync
- WXT entry points must remain in entrypoints/ directory

**Browser-Specific Considerations**:

| Constraint | Solution |
|------------|----------|
| Service worker may restart | Adapters are stateless; state in storage or service |
| Content scripts can't access storage | HighlightSyncAdapter uses browser.tabs.sendMessage |
| WXT requires entrypoints/ | background.ts is thin composition root only |
| API keys must not reach content scripts | Credentials injected into adapters at composition root |

**Example: Highlight Sync Adapter**:
```typescript
// adapters/messaging/highlight-sync.adapter.ts
export class HighlightSyncAdapter implements IHighlightSynchronizer {
  async highlightParagraph(tabId: number, index: number): Promise<void> {
    await browser.tabs.sendMessage(tabId, {
      type: 'highlight.paragraph',
      paragraphIndex: index,
    });
  }
}
```

**Sources**:
- [Chrome Extension Clean Architecture PoC](https://github.com/lucas-dev/chrome-extension-clean-architecture-poc)
- WXT documentation on entry points

---

### 7. Preserving Existing ITTSProvider Interface

**Decision**: Keep ITTSProvider as foundation, create IAudioGenerator port that wraps it

**Rationale**:
- ITTSProvider already well-designed with 5 implementations
- Creating new port avoids breaking existing provider code
- Adapter can delegate to existing provider implementations
- Gradual consolidation of duplicate providers

**Relationship**:
```
IAudioGenerator (Port)
    ↓ implemented by
AudioGeneratorAdapter
    ↓ delegates to
ITTSProvider (existing interface)
    ↓ implemented by
OpenAIProvider, ElevenLabsProvider, etc.
```

This maintains backward compatibility while establishing the hexagonal boundary.

**Alternatives Considered**:
- **Replace ITTSProvider entirely**: Rejected due to 5 existing implementations that work correctly.
- **Use ITTSProvider as the port directly**: Rejected because ITTSProvider has provider-specific concerns (validateApiKey) that shouldn't be in domain layer.

---

### 8. Existing Architecture Patterns to Preserve

**Decision**: Preserve config SSOT, Zod-first types, existing cache layering

**Components to Keep Unchanged**:
- `src/utils/config/` - Configuration SSOT pattern works well
- `src/utils/messaging/protocol.ts` - VoxPageProtocol type definitions
- `src/utils/cache/` - 7-layer cache architecture is already well-separated
- `src/utils/audio/` - Audio playback sync utilities

**Components to Migrate**:
- `src/utils/providers/` → `src/adapters/audio/` (wrap with adapter pattern)
- `src/background/providers/` → consolidate into `src/adapters/audio/`
- `src/utils/content/extractor.ts` → `src/adapters/content/` (wrap with adapter)

**Components to Create**:
- `src/core/` - New domain layer
- `src/ports/` - New port interfaces
- `src/adapters/` - New adapter implementations
- `src/composition/` - New DI container
- `src/handlers/` - New handler delegation layer

---

---

## Phase 2 Research: Activation & Migration (2026-01-07)

The following TBDs from the Phase 2 spec have been resolved:

### TBD-1: Service Worker Suspension Behavior in Firefox

**Decision**: Firefox MV3 uses persistent background pages (NOT service workers).

**Evidence** (manifest.json:35-38):
```json
"background": { "scripts": ["background/index.js"], "type": "module" }
```

**Implications**:
- Firefox background scripts don't suspend like Chrome
- Lazy init (`ensureContainerInitialized()`) still needed for Chrome/Edge support
- Container singleton is safe in Firefox; must handle wake-up for Chrome

---

### TBD-2: IndexedDB Initialization Timing

**Decision**: Use async initialization barrier with in-memory fallback (current pattern).

**Timing**: Dexie uses lazy initialization; first access takes 50-150ms cold start.

**Current implementation is adequate** - container.ts:48-54 already catches IndexedDB failures and falls back to InMemoryCacheAdapter.

---

### TBD-3: Feature Flag Storage Location

**Decision**: Use `browser.storage.local` for all feature flags.

**Keys**: `USE_LEGACY_PLAYBACK`, `USE_LEGACY_AUDIO`, `USE_LEGACY_SETTINGS`, `USE_LEGACY_FOOTER`, `USE_LEGACY_CACHE`, `USE_LEGACY_PDF`, `USE_LEGACY_QUEUE`

---

### TBD-4: Contract Test for IHighlightSynchronizer

**Decision**: Create contract test using shared test factory pattern.

**Implementation**:
```typescript
// tests/contract/highlight-sync.contract.test.ts
runHighlightSyncContractTests('MockHighlightSync', () => new MockHighlightSync());
runHighlightSyncContractTests('TabMessagingAdapter', () => new TabMessagingHighlightSyncAdapter());
```

---

### TBD-5: PlaybackService State Persistence

**Decision**: Option A - No persistence. Playback stops on suspension.

**Rationale**: Simplicity; Chrome users expect this; Firefox doesn't suspend; future enhancement post-migration.

---

### Best Practices Established

1. **Handler Registration**: Domain-based barrel exports with explicit registration functions
2. **Telemetry**: In-memory circular buffer (1000 entries) with aggregation
3. **Error Handling**: Result<T,E> at handler boundary; convert to JSON response

---

## Summary

All research tasks complete. Key decisions:

1. **Layer-first directory structure** with core/, ports/, adapters/
2. **Manual constructor injection** via composition root factory
3. **Strangler Fig migration** with 7 incremental phases
4. **TypeScript interfaces with Result<T, E>** for ports
5. **Three-tier testing** (unit, contract, integration)
6. **Browser-aware adapters** for messaging and storage
7. **Wrap ITTSProvider** rather than replace
8. **Preserve existing patterns** where they work well
9. **Firefox persistent background** (no suspension); Chrome needs lazy init
10. **Feature flags in browser.storage.local** for rollback capability

No NEEDS CLARIFICATION items remain. Proceed to Phase 1 design.
