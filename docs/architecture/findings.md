# Architecture Findings

**Last Updated**: 2026-01-20
**Feature Branch**: `047-architecture-ui-polish`

This document catalogs architecture smells identified during the 047-architecture-ui-polish analysis. Each smell includes symptom, example location, impact, and proposed direction.

---

## Summary

| ID | Smell | Impact | File |
|----|-------|--------|------|
| SMELL-001 | God-File (background.ts) | High | `src/entrypoints/background.ts` |
| SMELL-002 | State Duplication | Medium | Multiple files |
| SMELL-003 | Inconsistent Cache Key Derivation | Low | `src/utils/cache/cache-key.ts` |
| SMELL-004 | Hidden Coupling via Strings | Medium | Message handlers |
| SMELL-005 | Side Effects Mixed with Pure Logic | Medium | Background handlers |
| SMELL-006 | Duplicate PlaybackState Definitions | Medium | `background.ts`, `playback-state.ts` |

---

## SMELL-001: God-File (background.ts)

### Symptom

`src/entrypoints/background.ts` is 2,371 lines and contains:
- State management
- Message routing
- Audio generation
- Prefetch logic
- Blob URL lifecycle
- Multiple handler implementations

### Example Location

```typescript
// src/entrypoints/background.ts:258-284
interface PlaybackState {
  status: 'stopped' | 'loading' | 'playing' | 'paused';
  currentParagraph: number;
  totalParagraphs: number;
  progress: number;
  speed: number;
  provider: string;
  voice: string | null;
  currentTime: number;
  totalTime: number;
}

const playbackState: PlaybackState = {
  status: 'stopped',
  currentParagraph: 0,
  // ... 15+ state variables at module scope
};
```

### Impact

**High**:
- Difficult to understand and navigate
- Changes risk unintended side effects
- Testing requires mocking the entire file
- New developers struggle to trace flows

### Proposed Direction

1. Extract state management to `src/core/playback/playback-state.ts` (already exists, but not used)
2. Extract prefetch logic to `src/services/prefetch-service.ts`
3. Move TTS generation to adapter layer
4. Keep only message routing and initialization in background.ts
5. Target: <500 LOC in background.ts

---

## SMELL-002: State Duplication

### Symptom

Playback state is tracked in multiple places:
1. `playbackState` object in `background.ts` (module scope)
2. `PlaybackState` entity in `src/core/playback/playback-state.ts`
3. `PlaybackService.state` in `src/core/playback/playback-service.ts`
4. `FooterState` derived from playback in content script

### Example Location

```typescript
// src/entrypoints/background.ts:274-284
const playbackState: PlaybackState = {
  status: 'stopped',
  currentParagraph: 0,
  // ...
};

// src/core/playback/playback-state.ts:27-40
export interface PlaybackState {
  readonly status: PlaybackStatus;
  readonly currentParagraphIndex: number;
  // ...
}
```

### Impact

**Medium**:
- State can drift between definitions
- Confusion about which is the source of truth
- Risk of inconsistent behavior during migration

### Proposed Direction

1. Establish `src/core/playback/playback-state.ts` as single source of truth
2. Update `background.ts` to use imported type
3. Remove duplicate interface definitions
4. Document state ownership clearly

---

## SMELL-003: Inconsistent Cache Key Derivation

### Symptom

Cache key generation is centralized in `src/utils/cache/cache-key.ts` (good!), but some callers may still construct keys manually.

### Example Location

```typescript
// src/utils/cache/cache-key.ts - Centralized (good)
export function generateCacheKey(
  normalizedUrl: string,
  paragraphIndex: number,
  provider: string,
  voice: string | null,
  contentHash: string
): string

// src/core/playback/playback-service.ts:440-451 - Local implementation
private createCacheKey(index: number, text: string): CacheKey {
  const contentHash = this.hashString(text);  // Different hash algorithm!
  const urlHash = this.hashString(this.state.currentPageUrl ?? '');
  // ...
}
```

### Impact

**Low**:
- Current centralized module is well-implemented
- PlaybackService uses a different hash algorithm (djb2 vs SHA-256)
- Could cause cache misses if algorithms aren't aligned

### Proposed Direction

1. Ensure all callers use `src/utils/cache/cache-key.ts`
2. Document the canonical key format
3. Add unit tests for edge cases (trailing slashes, query params)
4. Consider removing local implementations in services

---

## SMELL-004: Hidden Coupling via Strings

### Symptom

Message types are stringly-typed and mapped in multiple places:
- `LEGACY_TO_HEXAGONAL_MAP` in background.ts
- Individual handler registrations
- Content script message listeners

### Example Location

```typescript
// src/entrypoints/background.ts:56-131
const LEGACY_TO_HEXAGONAL_MAP: Record<string, string> = {
  startPlayback: 'playback.start',
  pausePlayback: 'playback.pause',
  // ... 50+ mappings
  'FOOTER_ACTION': 'footer.action',
};
```

### Impact

**Medium**:
- Typos cause silent failures
- No compile-time checking
- Mapping maintenance burden
- Difficult to find all usages of a message type

### Proposed Direction

1. Define message types as TypeScript const enum or const object
2. Use type-safe messaging library features more fully
3. Generate handler registrations from type definitions
4. Add exhaustiveness checking for message handlers

---

## SMELL-005: Side Effects Mixed with Pure Logic

### Symptom

Background handlers mix business logic with side effects (storage, messaging, audio):

### Example Location

```typescript
// In message handlers
async function handleStartPlayback(request) {
  // Side effect: storage read
  const settings = await browser.storage.local.get('provider');

  // Business logic
  const paragraph = paragraphs[request.index];

  // Side effect: audio generation
  const audio = await generateAudio(paragraph);

  // Side effect: messaging
  await sendMessage(tabId, { type: 'HIGHLIGHT' });

  // Side effect: state mutation
  playbackState.status = 'playing';
}
```

### Impact

**Medium**:
- Hard to unit test (requires mocking everything)
- Business logic buried in side effects
- No clear boundaries between layers

### Proposed Direction

1. Extract pure business logic to domain services
2. Use dependency injection for side-effectful operations
3. Handlers become thin orchestrators
4. Tests can use mock adapters

---

## SMELL-006: Duplicate PlaybackState Definitions

### Symptom

There are two different `PlaybackState` interfaces with overlapping but different fields:

### Example Location

```typescript
// src/entrypoints/background.ts:258-268 (Legacy)
interface PlaybackState {
  status: 'stopped' | 'loading' | 'playing' | 'paused';
  currentParagraph: number;
  totalParagraphs: number;
  progress: number;
  speed: number;
  provider: string;
  voice: string | null;
  currentTime: number;  // <-- Not in core
  totalTime: number;    // <-- Not in core
}

// src/core/playback/playback-state.ts:27-49 (Hexagonal)
export interface PlaybackState {
  readonly status: PlaybackStatus;
  readonly currentParagraphIndex: number;  // Different name!
  readonly totalParagraphs: number;
  readonly progress: number;
  readonly speed: number;
  readonly provider: ProviderId;
  readonly voice: string | null;
  readonly mode: ExtractionMode;  // <-- Not in legacy
  readonly paragraphs: readonly string[];  // <-- Not in legacy
  // ... more fields
}
```

### Impact

**Medium**:
- Confusion about which type to use
- Field name mismatches (`currentParagraph` vs `currentParagraphIndex`)
- Missing fields in one or the other
- Migration complexity

### Proposed Direction

1. Adopt `src/core/playback/playback-state.ts` as the canonical type
2. Update background.ts to import and use it
3. Add `currentTime` and `totalTime` to core type if needed
4. Remove legacy interface from background.ts

---

## Migration Priority

| Smell | Priority | Effort | Dependencies |
|-------|----------|--------|--------------|
| SMELL-001 | P1 | High | SMELL-002, SMELL-005, SMELL-006 |
| SMELL-006 | P1 | Low | None |
| SMELL-002 | P2 | Medium | SMELL-006 |
| SMELL-005 | P2 | High | SMELL-001 |
| SMELL-004 | P3 | Medium | None |
| SMELL-003 | P3 | Low | None |

---

## Notes

- All smells are documented, not blocking current work
- Hexagonal migration is ~90% complete
- Strangler Fig pattern allows incremental fixes
- Test coverage should increase before refactoring
