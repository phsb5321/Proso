# Research: 062-hexagonal-wiring-recovery

**Date**: 2026-02-08 | **Status**: Complete

## RQ-1: Missing Dependency Injection — Exact Signatures

### Decision
Wire all 6 `set*()` calls in `initHexagonalArchitecture()` after `setSettingsStore()`.

### Findings

| Function | Signature | Source of Dependency | In Container? |
|----------|-----------|---------------------|---------------|
| `setHighlightSync(sync)` | `IHighlightSynchronizer` | `container.adapters.highlightSync` | YES |
| `setActiveTabId(tabId)` | `number \| null` | Dynamic — from `browser.tabs.onActivated` | N/A (event) |
| `setLanguageDependencies(deps)` | `{ detectLanguage: (text: string) => string }` | `franc-min` via `src/utils/language/detector.ts` | NO — wire manually |
| `setHighlightRepository(repo)` | `IHighlightRepository` | Lazy-init in handler, but can pre-wire from `createHighlightRepository()` | NO — but auto-creates |
| `setExportDependencies(deps)` | `{ generateAudio, downloadFile, encodeToMp3, createAudioUrl, revokeAudioUrl, saveExportHistory }` | Composite from container services + browser APIs + `src/utils/audio/encoder.ts` | NO — composite |
| `setLoggingDependencies(deps)` | `{ addToBuffer, flushBuffer, getBufferSize, isEnabled, getLastFlushAttempt, getConsecutiveFailures, isCircuitBreakerOpen }` | `LogBuffer` + `RemoteLogger` from `src/utils/logging/` | NO — composite |

### Initialization Order
1. `createContainer(config, apiKeys)` — creates adapters + services
2. `setSettingsStore(container.adapters.settingsStore)` — already done
3. `setHighlightSync(container.adapters.highlightSync)` — simple, from container
4. `setLanguageDependencies(...)` — requires importing `detectLanguageFromText` from utils
5. `setHighlightRepository(...)` — optional (lazy-inits on first use), but pre-wiring is safer
6. `setExportDependencies(...)` — complex composite, requires PlaybackService to exist
7. `setLoggingDependencies(...)` — requires `LogBuffer` and `RemoteLogger` instances
8. `browser.tabs.onActivated.addListener(...)` — calls `setActiveTabId()` dynamically

### Alternatives Considered
- **Inject via constructor**: Would require refactoring all handler files to accept deps at registration time. Rejected: too invasive for a recovery task.
- **Service locator**: Have handlers call `getContainer()` directly. Rejected: violates hexagonal principle, creates circular dependencies.

---

## RQ-2: Stale Reference in PlaybackService

### Decision
Add `setAudioGenerator(generator)` method to PlaybackService. Call it from `reconfigureAudioGenerator()`.

### Findings
- `PlaybackService.deps` is `private readonly PlaybackServiceDependencies`
- All fields in `PlaybackServiceDependencies` are `readonly`
- **No** `setAudioGenerator()` method exists — must be added
- `reconfigureAudioGenerator()` in `container.ts` creates a new container object via spread, but PlaybackService holds the OLD `deps` reference captured at construction
- `subscribeToSettings()` exists in PlaybackService (lines 317-330) — subscribes to `settingsStore.subscribe()` for reactive settings changes. **Never called.**

### Fix Strategy
1. Add `setAudioGenerator(generator: IAudioGenerator)` to PlaybackService
2. In `reconfigureAudioGenerator()`, after creating new adapter, call `playbackService.setAudioGenerator(newGenerator)`
3. Call `playbackService.subscribeToSettings()` once during init in `init-hexagonal.ts`

### Provider Default Mismatch
- `initialPlaybackState` in `src/core/playback/playback-state.ts:45` hardcodes `provider: 'elevenlabs'`
- Container defaults to `provider: 'browser'` (from `loadAppConfig()`)
- Fix: Change default to `'browser'` or accept config provider at construction time

### Alternatives Considered
- **Recreate PlaybackService on provider change**: Would lose in-flight state (paragraph position, progress). Rejected.
- **Reactive deps via Proxy**: Over-engineered for this recovery. Rejected.

---

## RQ-3: Browser TTS Timing Bug

### Decision
Two-pronged fix: (A) Don't await speech completion in `generateAudio()`, return immediately. (B) Don't cache 0-byte blobs.

### Findings

**Current flow:**
1. `generateAudio()` calls `synth.speak(utterance)` and `await`s `utterance.onend` — blocks until speech finishes
2. Returns `{ playedDirectly: true, audioBlob: new Blob([]) }` — 0-byte blob
3. PlaybackService receives response AFTER speech is done
4. Calls `trackDirectPlayback(estimatedDurationMs)` — starts timer for already-finished speech
5. Timer creates silent gap while it "plays" to estimated duration

**Timing estimation:**
- Uses `(wordCount * 300) / speed` — imprecise heuristic
- No access to actual speech duration from Web Speech API
- Minimum: 100ms

**Cache issue:**
- 0-byte blob is stored in IndexedDB with `compressedSize: 0`
- On cache hit, `CacheEntry` does NOT contain `playedDirectly` flag
- PlaybackService falls into blob playback path → tries to play 0-byte audio → silent

### Fix Strategy A: Non-blocking Browser TTS
- `generateAudio()` should NOT await speech completion
- Instead, call `synth.speak()` and return immediately with `playedDirectly: true`
- Provide an `onEnd` callback mechanism (or store utterance reference) so PlaybackService can detect actual completion
- `trackDirectPlayback()` should use `utterance.onend` for paragraph advance, not estimated duration

### Fix Strategy B: Skip caching for Browser TTS
- Check `audioBlob.size > 0` before caching
- OR check `playedDirectly === true` and skip cache entirely
- On cache hit, add `provider` to `CacheEntry` so PlaybackService knows to use direct playback

### Cache Key Format
Provider IS included in the cache key: `urlHash:paragraphIndex:provider:voice:contentHash`. So Browser TTS entries won't collide with other providers.

### Alternatives Considered
- **Encode Browser TTS to WAV/MP3**: Would require AudioWorklet to capture speech output. Complex, platform-dependent. Rejected for recovery scope.
- **Remove Browser TTS caching entirely**: Simplest fix. Browser TTS is free anyway. **Recommended.**

---

## RQ-4: Message Format Mismatches

### Decision
Fix adapter to match content script expectations. Don't change content script (it's the established consumer).

### Findings

**Highlight message:**
| Field | Adapter sends | Content expects |
|-------|--------------|-----------------|
| paragraph ID | `paragraphIndex` | `index` |
| paragraph text | (omitted) | `text` |
| timestamp | (omitted) | `timestamp` |
| scroll | `scroll` | `scroll` (unused in handler but passed) |

**Footer state update:**
| Field | Adapter sends | Content expects |
|-------|--------------|-----------------|
| current time display | `currentText` | `currentTime` |
| total time display | (omitted) | `totalTime` |
| status | `status` | `status` |
| progress | `progress` | `progress` |
| current paragraph | `currentParagraph` | `currentParagraph` |
| total paragraphs | `totalParagraphs` | `totalParagraphs` |
| speed | `speed` | `speed` |

### Fix Strategy
1. Change `HighlightSyncAdapter.highlightParagraph()` to send `{ type: 'highlight', index, text, timestamp, scroll }`
2. Change `HighlightSyncAdapter.updateFooterState()` to send `currentTime` (not `currentText`) and include `totalTime`
3. Update `IHighlightSynchronizer` port and `FooterState` type if needed to carry these fields

---

## RQ-5: Language Detection Disconnection

### Decision
Register `languageDetected` as a legacy action alias in background dispatcher (bridge to hexagonal `language.detect`).

### Findings
- Content script sends `{ action: 'languageDetected', metadata, textSample, url }` (line 621)
- Background checks both `type` and `action` fields
- **No handler exists** for `languageDetected` in either hexagonal or legacy registries
- The hexagonal `language.detect` handler exists but is never reached
- `tabLanguageStates` map in language.handlers.ts is never populated (`.set()` never called)
- `setLanguageDependencies()` never called → always returns hardcoded `{ code: 'en', confidence: 0.5 }`
- `sender.tab.id` is NOT forwarded to handlers — per-tab state impossible

### Fix Strategy
1. In background message listener, map `action: 'languageDetected'` → dispatch as `language.detect`
2. Pass `sender.tab.id` into handler data so language state can be per-tab
3. Wire `setLanguageDependencies()` (RQ-1) so franc-min is actually used

### Alternatives Considered
- **Change content script to send `type: 'language.detect'`**: Would work but breaks the pattern where content uses `action` field. Risk of breaking other content-to-background messages. Rejected for recovery scope.

---

## RQ-6: Popup Message Types

### Decision
Add `provider.select` and `playback.setSpeed` sends alongside `settings.update` persistence.

### Findings
- Popup `sendMessage()` wrapper (line 349) spreads data as top-level fields: `{ type: 'settings.update', speed: 1.5 }`
- Settings handler `settings.update` only persists to storage — does NOT trigger runtime reconfiguration
- Provider handler `provider.select` would call `reconfigureAudioGenerator()` — exists in hexagonal handlers
- Playback handler `playback.setSpeed` would update active playback speed — exists in hexagonal handlers

### Fix Strategy
1. For provider change: Send BOTH `settings.update` (persist) AND `provider.select` (reconfigure)
2. For speed change: Send BOTH `settings.update` (persist) AND `playback.setSpeed` (runtime)
3. For `playback.start` response: Check response, show error in popup if failed

### Alternatives Considered
- **Make `settings.update` trigger reconfiguration**: Would couple persistence with runtime, violating separation. Rejected.
- **Only send `provider.select`/`playback.setSpeed`**: Would lose persistence. Rejected.

---

## RQ-7: Error Propagation in dispatchToHexagonal

### Decision
Return a discriminated union: `null` (not found) vs `{ _hexError: true, error: string }` (handler failed).

### Findings
- `dispatchToHexagonal()` returns `null` for BOTH "handler not found" AND "handler returned Err"
- Callers (background.ts dispatcher) treat `null` as "try legacy handler" — but legacy handlers don't exist for hex messages
- This means handler failures silently fall through to "unknown message" logging

### Fix Strategy
- Return `null` ONLY for "handler not found"
- For handler errors, return `{ _hexError: true, error: string, code: string }`
- Background dispatcher checks for `_hexError` flag before trying legacy fallback
- Forward `sender.tab.id` as `data.__tabId` for handlers that need it

### Alternatives Considered
- **Throw on handler error**: Would break the non-throwing dispatch contract. Rejected.
- **Use Result type in dispatcher**: Good long-term but too invasive for recovery. Rejected.
