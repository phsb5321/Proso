# Implementation Plan: Background.ts Migration to Hexagonal Architecture

**Branch**: `057-background-migration` | **Date**: 2026-02-07 | **Spec**: specs/057-background-migration/
**Input**: Analysis of src/entrypoints/background.ts (2,459 LOC) and existing hexagonal handler architecture

## Summary

Migrate the last legacy domain (`USE_LEGACY_PLAYBACK: true`) from the monolithic background.ts to the hexagonal handler architecture. The PlaybackService already exists in `src/core/playback/playback-service.ts` with full orchestration capabilities (start, pause, resume, stop, next, previous, seek, speed). The hexagonal handlers in `src/handlers/playback.handlers.ts` already delegate to PlaybackService. The migration consists of: (1) ensuring the container initializes with correct config so PlaybackService is actually functional, (2) flipping `USE_LEGACY_PLAYBACK` to `false`, (3) deleting pure stub files, (4) removing dead legacy code from background.ts, and (5) verifying all migration flags are false.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (strict mode)
**Primary Dependencies**: WXT 0.20.13, Zod 3.25.76, Dexie 4.2.1
**Storage**: IndexedDB via Dexie (audio cache), browser.storage.local (settings)
**Testing**: Jest 29 (ESM mode with --experimental-vm-modules), Playwright (E2E)
**Target Platform**: Firefox 112+ (event pages with DOM access)
**Constraints**: Must not break existing playback functionality; must be rollback-safe via migration flags

## Architecture

### Current State (Strangler Fig Pattern)

```
browser.runtime.onMessage
  → dispatchMessage()
    → shouldUseLegacy(type)?
      YES → messageHandlers[type] (background.ts monolith)
      NO  → dispatchToHexagonal() → HandlerRegistry → PlaybackService
```

### Target State

```
browser.runtime.onMessage
  → dispatchMessage()
    → shouldUseLegacy(type) → always false
    → dispatchToHexagonal() → HandlerRegistry → PlaybackService
    → background.ts is <500 LOC composition root
```

### Key Files

| File | Role | Current State |
|------|------|--------------|
| `src/entrypoints/background.ts` | Entry point, composition root | 2,459 LOC monolith |
| `src/handlers/playback.handlers.ts` | Hexagonal playback handlers | 531 LOC, delegates to PlaybackService |
| `src/core/playback/playback-service.ts` | Domain service | 498 LOC, fully implemented |
| `src/composition/container.ts` | DI container | Creates PlaybackService with all adapters |
| `src/utils/messaging/handlers/playback.ts` | Legacy stubs | Pure stubs, all TODO Phase 4 |
| `src/utils/messaging/handlers/audio.ts` | Legacy stubs | Pure stubs |
| `src/utils/messaging/handlers/content.ts` | Legacy stubs | Pure stubs |
| `src/utils/messaging/handlers/provider.ts` | Legacy stubs | Pure stubs |
| `src/utils/messaging/handlers/footer.ts` | Legacy stubs | Pure stubs |
| `src/utils/messaging/handlers/queue.ts` | Legacy real impl | Used by queue.handlers.ts |
| `src/utils/messaging/handlers/export.ts` | Legacy real impl | Used by background.ts |
| `src/utils/messaging/handlers/summarize.ts` | Legacy real impl | Used by background.ts |
| `src/utils/messaging/handlers/settings.ts` | Mixed stubs/real | Partial overlap with hex settings |

### Migration Flags (Current)

```typescript
MIGRATION_FLAGS = {
  USE_LEGACY_PLAYBACK: true,   // ← target of this migration
  USE_LEGACY_AUDIO: false,     // ✅ done
  USE_LEGACY_SETTINGS: false,  // ✅ done
  USE_LEGACY_CACHE: false,     // ✅ done
  USE_LEGACY_QUEUE: false,     // ✅ done
};
```

## Project Structure

```text
src/
├── core/playback/playback-service.ts    # Domain service (keep)
├── composition/container.ts             # DI container (modify)
├── entrypoints/background.ts            # Monolith → composition root (major refactor)
├── handlers/
│   ├── playback.handlers.ts             # Hexagonal handlers (minor fixes)
│   ├── index.ts                         # Handler registration (keep)
│   └── registry.ts                      # Handler registry (keep)
└── utils/messaging/handlers/            # Legacy stubs (delete pure stubs)
    ├── playback.ts                      # DELETE (pure stub)
    ├── audio.ts                         # DELETE (pure stub)
    ├── content.ts                       # DELETE (pure stub)
    ├── provider.ts                      # DELETE (pure stub)
    ├── footer.ts                        # DELETE (pure stub)
    ├── queue.ts                         # KEEP (used by queue.handlers.ts)
    ├── export.ts                        # KEEP (real impl)
    ├── summarize.ts                     # KEEP (real impl)
    ├── settings.ts                      # KEEP (has real theme/apikey handlers)
    ├── cache-handlers.ts                # EVALUATE
    ├── highlight.ts                     # EVALUATE
    ├── language.ts                      # EVALUATE
    ├── logging.ts                       # EVALUATE
    └── index.ts                         # UPDATE (remove deleted re-exports)

tests/
├── unit/handlers/playback.handlers.test.ts  # Update mocks
└── unit/background/                         # New: composition root tests
```

## Risk Mitigation

1. **Rollback path**: Migration flags remain in code; if issues found, flip USE_LEGACY_PLAYBACK back to true
2. **Incremental validation**: Test with flag flip before deleting dead code
3. **Local testing first**: Verify full playback flow (start → play → pause → resume → next → stop) before committing flag flip
4. **Keep real implementations**: Only delete pure stubs (hardcoded return values, TODO comments)
