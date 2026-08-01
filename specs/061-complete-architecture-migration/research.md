# Research: Complete Architecture Migration

**Feature**: 061-complete-architecture-migration
**Date**: 2026-02-08
**Spec**: [spec.md](./spec.md)

## Research Questions

### RQ-1: Why does the core playback chain produce "Invalid URI" errors?

**Finding**: The `BrowserTtsAudioAdapter` violates the `IAudioGenerator` port contract.

The Web Speech API (`speechSynthesis.speak()`) is a system-level audio output — it plays directly through the OS speakers and does **not** generate downloadable audio blobs. The adapter returns an empty blob (`new Blob([], { type: 'audio/wav' })`) to satisfy the interface, but `PlaybackService.playAudio()` then tries to create a URL from this empty blob and assign it to an `HTMLAudioElement.src`. The browser rejects it: "Invalid URI. Load of media resource failed."

**Flow**:
```
BrowserTtsAudioAdapter.generateAudio()
  → speechSynthesis.speak() (plays to OS speaker directly)
  → returns AudioResponse { audioBlob: new Blob([], {type:'audio/wav'}) }  ← EMPTY!

PlaybackService.playAudio(audioBlob)
  → audioUrlProvider.createUrl(emptyBlob)
  → audioElement.src = emptyDataUrl
  → audioElement.play()  ← FAILS: "Invalid URI"
```

**ElevenLabs works correctly** because it returns real MP3 blobs from its HTTP API.

**Resolution approach**: Browser TTS needs a fundamentally different playback path. Instead of trying to generate a blob, it should play directly via `speechSynthesis.speak()` and only report timing/progress back to `PlaybackService`. Two strategies:
1. **Dual-path playback**: `PlaybackService` detects browser TTS and delegates to `speechSynthesis` directly (bypassing `HTMLAudioElement`)
2. **Adapter-level playback**: `BrowserTtsAudioAdapter` implements both generation AND playback, returning a sentinel blob that `PlaybackService` recognizes

**Key files**:
- `src/adapters/audio/browser-tts-audio.adapter.ts` (lines 56-106)
- `src/core/playback/playback-service.ts` (lines 394-410, playAudio method)
- `src/adapters/audio/audio-url.adapter.ts`
- `src/composition/factories.ts` (lines 44-61, createAudioGeneratorAdapter)

---

### RQ-2: Why don't the sticky footer and paragraph highlights appear during playback?

**Finding**: Critical message type mismatch between the adapter and content script.

The `HighlightSyncAdapter` sends messages using **dot-notation** types:
- `type: 'footer.show'`
- `type: 'footer.hide'`
- `type: 'footer.updateState'`

The content script's message listener extracts `messageKey = message.action || message.type` and routes via a switch statement that expects **SCREAMING_SNAKE_CASE**:
- `case 'FOOTER_SHOW':`
- `case 'FOOTER_HIDE':`
- `case 'FOOTER_STATE_UPDATE':`

These never match. Every footer/highlight message falls through to the default case and is silently ignored.

**Same issue for highlights**:
- Adapter sends: `type: 'highlight.paragraph'`, `type: 'highlight.word'`, `type: 'highlight.clear'`
- Content script expects: `case 'highlight':`, `case 'highlightWord':`, `case 'clearHighlight':`

**Resolution approach**: Align message types. Either:
1. Update `HighlightSyncAdapter` to send SCREAMING_SNAKE_CASE (matches existing content script)
2. Update content script switch cases to accept dot-notation (matches hexagonal convention)
3. Add a mapping layer in the content script listener

Option 1 is safest (minimal changes, preserves working content script logic).

**Key files**:
- `src/adapters/messaging/highlight-sync.adapter.ts` (lines 91, 102, 116)
- `src/entrypoints/content.ts` (lines 865-1145)
- `src/core/playback/playback-service.ts` (lines 483-496, updateFooterState)

---

### RQ-3: Why do popup controls fail with "Unknown message type"?

**Finding**: Popup sends legacy camelCase message names; background expects dot-notation names.

**Broken mappings**:
| Popup sends (legacy) | Background expects (hexagonal) |
|---|---|
| `getPlaybackState` | `playback.getState` |
| `startPlayback` | `playback.start` |
| `pausePlayback` | `playback.pause` |
| `resumePlayback` | `playback.resume` |
| `stopPlayback` | `playback.stop` |
| `previousParagraph` | `playback.prev` |
| `nextParagraph` | `playback.next` |
| `seekToPosition` | `playback.seek` |
| `updateSettings` | `settings.update` |

The dispatcher tries `dispatchToHexagonal()` first (fails — name not registered), then falls back to legacy handlers (also fails — legacy playback handlers were deleted in 057).

**Resolution**: Update all message names in `popup/main.ts` to use dot-notation.

**Key files**:
- `src/entrypoints/popup/main.ts` (lines 367, 415, 421, 429, 448, 460, 472, 495, 518, 534)

---

### RQ-4: What dead code and unreachable features exist?

**Finding**: ~800+ LOC of dead/unreachable code across multiple categories.

#### Completely Dead (safe to delete):
| Component | LOC | Reason |
|---|---|---|
| `src/handlers/summarize.handlers.ts` | 314 | AI providers removed in 056, UI hidden |
| `src/utils/messaging/handlers/summarize.ts` | 87 | Legacy duplicate of above |
| `src/utils/ai/` directory | ~50 | Removed feature (summarization) |
| Summarize UI in popup | ~50 | Hidden, dead event handlers |
| AI contract tests | ~100 | Tests for removed feature |

#### Broken (dependencies never injected):
| Component | LOC | Issue |
|---|---|---|
| `src/handlers/export.handlers.ts` | 389 | `setExportDependencies()` never called |
| `src/utils/messaging/handlers/export.ts` | 127 | Legacy duplicate |

#### Architecturally Redundant:
| Component | LOC | Issue |
|---|---|---|
| Queue dual-implementation | 758 combined | Hexagonal wraps legacy; both registered |

#### Stale Specs:
57 spec directories exist but most were squash-merged. Only ~5-10 represent current features.

**Total deletable**: ~600-700 LOC immediately, ~800+ with refactoring.

---

### RQ-5: What is the state of handler registration and wiring?

**Finding**: 16 handler domains registered in `registerAllHandlers()`:

| Handler | Status | Issue |
|---|---|---|
| playback | Registered, wired | Works if popup sends correct names |
| cache | Registered, wired | Working |
| content | Registered, wired | Working |
| debug | Registered, wired | Working |
| audio | Registered, wired | Working |
| provider | Registered, wired | Working |
| settings | Registered, wired | Working |
| footer | Registered, wired | Message type mismatch with content script |
| prefetch | Registered, wired | Working |
| queue | Registered, wired | Dual-implementation (redundant) |
| reader | Registered, wired | Clean, working |
| highlight | Registered, wired | Message type mismatch with content script |
| export | Registered, **broken** | Dependencies never initialized |
| summarize | Registered, **dead** | AI providers removed |
| language | Registered, wired | Hardcoded to null in PlaybackService |
| logging | Registered, wired | Working |

---

### RQ-6: What is the audio playback architecture in the background context?

**Finding**: Firefox MV2 background pages have full DOM access.

- `PlaybackService` creates `new Audio()` in the background context (line ~400)
- This works because Firefox MV2 background pages are real DOM pages, not service workers
- `AudioUrlAdapter` detects context: uses data URLs in background (no `URL.createObjectURL`), blob URLs in DOM contexts
- The architecture has separate ports: `IAudioGenerator` (generation) and `IAudioPlayer` (playback)
- `PlaybackService` implements its own playback logic via `HTMLAudioElement` instead of using `IAudioPlayer` adapters
- `DirectAudioAdapter` and `OffscreenAudioAdapter` exist but are unused by `PlaybackService`

**Container wiring** (`src/composition/container.ts`):
- `createContainer()` creates adapters via factories
- Provider selection: `'browser'` → `BrowserTtsAudioAdapter`, `'elevenlabs'` → `ElevenLabsAudioAdapter`
- All adapters wired to `PlaybackService` via dependency injection

---

### RQ-7: What is the language detection state?

**Finding**: Language handlers exist and are registered, but `PlaybackService` hardcodes language to `null` at line 347. The language detection infrastructure (franc-min, language mappings, extractor) is present but never consulted during audio generation.

**Resolution**: Wire language detection result into the audio generation request.

## Summary of Critical Fixes (Priority Order)

1. **Fix Browser TTS playback** — Dual-path: use `speechSynthesis` directly for browser TTS, `HTMLAudioElement` for API providers
2. **Fix message type mismatch** — Align adapter → content script message types (SCREAMING_SNAKE_CASE)
3. **Fix popup message names** — Update popup to use dot-notation (`playback.start` etc.)
4. **Wire language detection** — Pass detected language to audio generation requests
5. **Initialize export dependencies** — Call `setExportDependencies()` during init or remove hexagonal wrapper
6. **Delete dead code** — Remove summarize handlers, AI utils, stale specs
7. **Consolidate queue handlers** — Remove redundant wrapper layer
