# Quickstart: 062-hexagonal-wiring-recovery

**Branch**: `062-hexagonal-wiring-recovery`

## Overview

This feature fixes 18+ runtime bugs in the hexagonal architecture wiring that make the extension non-functional despite passing builds and 2,393 unit tests.

## Files to Modify (by phase)

### Phase 1: Dependency Injection Wiring
- `src/background/init-hexagonal.ts` — Add 5 missing `set*()` calls + tab activation listener

### Phase 2: Message Format Alignment
- `src/adapters/messaging/highlight-sync.adapter.ts` — Fix field names in `highlightParagraph()` and `updateFooterState()`
- `src/ports/highlight-sync.port.ts` — Add `currentTime` / `totalTime` to `FooterState` type
- `src/entrypoints/background.ts` — Bridge `languageDetected` action to `language.detect` handler

### Phase 3: Stale Reference Fix
- `src/core/playback/playback-service.ts` — Add `setAudioGenerator()` method
- `src/core/playback/playback-state.ts` — Change default provider to `'browser'`
- `src/composition/container.ts` — Call `playbackService.setAudioGenerator()` in `reconfigureAudioGenerator()`

### Phase 4: Browser TTS Timing Fix
- `src/adapters/audio/browser-tts-audio.adapter.ts` — Don't await speech completion; return immediately
- `src/core/playback/playback-service.ts` — Skip caching for `playedDirectly` responses; use `onEnd` callback for paragraph advance

### Phase 5: Popup Message Routing
- `src/entrypoints/popup/main.ts` — Send `provider.select` and `playback.setSpeed` alongside `settings.update`; check `playback.start` response

### Phase 6: Error Propagation
- `src/background/init-hexagonal.ts` — Return structured error objects from `dispatchToHexagonal()`
- `src/entrypoints/background.ts` — Forward `sender.tab.id` as `__tabId` in dispatch data

## Development Workflow

```bash
# Build and verify
pnpm run build:firefox

# Run tests (should remain 2,393 passing)
pnpm run test:unit

# Quality checks
pnpm run deps:check      # 0 circular deps
pnpm run duplication     # < 2%
pnpm run lint:manifest   # 0 warnings

# Manual testing with Firefox Nightly
pnpm run dev             # Opens Firefox Nightly with extension loaded
```

## Testing Strategy

Each phase has specific test points:

| Phase | Automated Test | Manual Test |
|-------|---------------|-------------|
| 1 | Unit test: `initHexagonalArchitecture()` calls all `set*()` | Footer shows on playback start |
| 2 | Contract test: adapter message fields match content expectations | Paragraphs highlight correctly |
| 3 | Unit test: `setAudioGenerator()` propagates to service | Provider switch works from popup |
| 4 | Unit test: Browser TTS `generateAudio()` returns before speech ends | No silent gaps between paragraphs |
| 5 | Unit test: popup sends correct message types | Speed slider changes active playback |
| 6 | Unit test: dispatch returns error vs null | Error shown in popup on failure |

## Key Constraints

- **No new dependencies** — all fixes use existing code
- **No breaking changes** — existing tests must pass
- **Build size < 1MB** — currently 899 KB
- **Firefox Nightly** for dev testing: `pnpm run dev`
