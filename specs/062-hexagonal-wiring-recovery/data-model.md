# Data Model: 062-hexagonal-wiring-recovery

**Date**: 2026-02-08

## Entities

This feature modifies existing entities rather than creating new ones. Below documents the affected entities and the changes required.

### Container (composition root)

```
Container {
  adapters: ContainerAdapters
  services: ContainerServices
  config: AppConfig
}

ContainerAdapters {
  readonly audioGenerator: IAudioGenerator
  readonly audioUrlProvider: IAudioUrlProvider
  readonly cacheStore: ICacheStore
  readonly highlightSync: IHighlightSynchronizer   ← EXISTS, never wired to handlers
  readonly textExtractor: ITextExtractor
  readonly contentScorer: IContentScorer
  readonly settingsStore: ISettingsStore
}

ContainerServices {
  playback: PlaybackService                         ← Holds stale deps reference
  contentExtraction: ContentExtractionService
}
```

**Changes required:**
- `reconfigureAudioGenerator()` must also update `PlaybackService.deps.audioGenerator`

### PlaybackService Dependencies

```
PlaybackServiceDependencies {
  readonly audioGenerator: IAudioGenerator          ← Must become mutable for reconfiguration
  readonly audioUrlProvider: IAudioUrlProvider
  readonly cacheStore: ICacheStore
  readonly highlightSync: IHighlightSynchronizer
  readonly settingsStore: ISettingsStore
}
```

**Changes required:**
- Add `setAudioGenerator(gen: IAudioGenerator): void` method to PlaybackService
- Remove `readonly` from `audioGenerator` field (or use internal mutable copy)

### PlaybackState

```
PlaybackState {
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'error'
  currentParagraphIndex: number
  totalParagraphs: number
  paragraphs: string[]
  progress: number
  speed: number
  provider: string                                  ← Hardcoded default 'elevenlabs' → change to 'browser'
  voice: string | null
  mode: string
  activeTabId: number | null
  currentPageUrl: string | null
  error: string | null
}
```

**Changes required:**
- `initialPlaybackState.provider` → `'browser'` (matches container default)

### AudioResponse (from IAudioGenerator)

```
AudioResponse {
  audioBlob: Blob                                   ← Browser TTS returns 0-byte blob
  durationMs: number
  wordTimings: WordTiming[] | null
  playedDirectly: boolean                           ← true for Browser TTS
}
```

**Changes required:**
- Browser TTS adapter should return BEFORE speech completes (not after)
- `playedDirectly` must include callback/event for actual completion

### CacheEntry (from ICacheStore)

```
CacheEntry {
  audioBlob: Blob
  durationMs: number
  wordTimings: WordTiming[] | null
  createdAt: number
  lastAccessedAt: number
  accessCount: number
  sizeBytes: number
  // MISSING: playedDirectly flag → lost on cache retrieval
}
```

**Changes required:**
- Either: Don't cache Browser TTS entries (simplest, recommended)
- Or: Add `playedDirectly: boolean` to CacheEntry and persist it

### FooterState (from IHighlightSynchronizer port)

```
FooterState {
  status: string
  currentIndex: number
  totalParagraphs: number
  progress: number
  currentText: string                               ← Adapter sends this
  speed: number
  // MISSING: currentTime, totalTime ← Content script expects these
}
```

**Changes required:**
- Add `currentTime: string` and `totalTime: string` to FooterState interface
- Or rename `currentText` → `currentTime` and add `totalTime`

### HighlightSyncAdapter Message Shape

```
HighlightMessage (sent by adapter → received by content) {
  type: 'highlight'
  paragraphIndex: number                            ← Content expects 'index'
  scroll: boolean
  // MISSING: text, timestamp
}
```

**Changes required:**
- Rename `paragraphIndex` → `index`
- Add `text: string` and `timestamp: number`

## State Transitions

### Handler Dependency Lifecycle

```
UNINITIALIZED → WIRED → ACTIVE

UNINITIALIZED: Handler registered but set*() not called. Calls throw.
WIRED: set*() called with valid dependency. Ready for use.
ACTIVE: Handler successfully processing messages.
```

### Provider Switching

```
CURRENT_PROVIDER → RECONFIGURE → NEW_PROVIDER

1. Popup sends 'provider.select' + 'settings.update'
2. Background: reconfigureAudioGenerator(newProvider, apiKey)
3. Container: new audioGenerator adapter created
4. PlaybackService: setAudioGenerator(newAdapter) called
5. Next paragraph uses new provider
```

## Relationships

```
init-hexagonal.ts --creates→ Container
Container.adapters.highlightSync --wired-to→ footer.handlers (via setHighlightSync)
Container.adapters.settingsStore --wired-to→ settings.handlers (via setSettingsStore) ✓ DONE
Container.services.playback --stale-ref→ Container.adapters.audioGenerator ← BUG
franc-min detector --wired-to→ language.handlers (via setLanguageDependencies)
browser.tabs.onActivated --wired-to→ footer.handlers (via setActiveTabId)

Popup --sends→ 'settings.update' --dispatches→ settings.handlers (persist only)
Popup --sends→ 'provider.select' --dispatches→ provider.handlers (reconfigure)  ← MISSING
Content --sends→ 'languageDetected' --dispatches→ ??? ← NO HANDLER
Background --sends→ 'highlight' --to→ content.ts (field mismatch)
Background --sends→ 'FOOTER_STATE_UPDATE' --to→ content.ts (field mismatch)
```
