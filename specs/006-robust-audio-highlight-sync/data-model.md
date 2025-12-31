# Data Model: Robust Audio-Text Highlight Synchronization

**Feature**: 006-robust-audio-highlight-sync
**Date**: 2025-12-31

## Entities

### WordTiming

Represents timing data for a single word from Groq Whisper transcription.

| Field | Type | Description |
|-------|------|-------------|
| word | string | The transcribed word text |
| startMs | number | Start time in milliseconds (converted from Groq's seconds) |
| endMs | number | End time in milliseconds |
| charOffset | number | Character offset within source paragraph (computed via alignment) |
| charLength | number | Character length in source text |

**Validation Rules**:
- `startMs` must be >= 0
- `endMs` must be > `startMs`
- `charOffset` must be >= 0
- `charLength` must be > 0

### WordTimeline

Collection of word timings for a single paragraph/audio segment.

| Field | Type | Description |
|-------|------|-------------|
| paragraphIndex | number | Index of the paragraph this timeline belongs to |
| words | WordTiming[] | Array of word timing data |
| audioDurationMs | number | Total audio duration in milliseconds |
| sourceText | string | Original source text (for alignment verification) |
| transcribedText | string | Full transcription from Groq (for debugging) |
| alignmentConfidence | number | 0-1 score indicating alignment quality |

**State Transitions**:
- `empty` → `loading` (Groq API called)
- `loading` → `ready` (timestamps received and aligned)
- `loading` → `failed` (API error or alignment failure)
- `ready` → `empty` (paragraph changes or playback stops)

### SyncState

Current synchronization state managed by PlaybackSyncState class.

| Field | Type | Description |
|-------|------|-------------|
| currentTimeMs | number | Current playback time from `audio.currentTime * 1000` |
| currentParagraphIndex | number | Active paragraph index |
| currentWordIndex | number \| null | Active word index (null if word sync unavailable) |
| totalDurationMs | number | Total audio duration |
| isRunning | boolean | Whether sync loop is active |
| lastSyncTimestamp | number | `Date.now()` of last sync operation |
| driftMs | number | Detected drift between expected and actual time |
| wordTimeline | WordTimeline \| null | Current paragraph's word timing data |

**Computed Properties**:
- `progressPercent`: `(currentTimeMs / totalDurationMs) * 100`
- `hasWordTiming`: `wordTimeline !== null && wordTimeline.words.length > 0`
- `isDrifting`: `Math.abs(driftMs) > 200`

### GroqTimestampSettings

User settings for Groq timestamp feature.

| Field | Type | Description |
|-------|------|-------------|
| groqApiKey | string | API key for Groq services (shared with TTS) |
| wordSyncEnabled | boolean | Whether to attempt word-level sync |
| whisperModel | string | Model ID (`whisper-large-v3-turbo` default) |

**Storage Location**: `browser.storage.local` under key `groqTimestampSettings`

## Relationships

```
┌─────────────────┐      ┌─────────────────┐
│  SyncState      │──────│  WordTimeline   │
│                 │ 0..1 │                 │
│ currentTimeMs   │      │ paragraphIndex  │
│ currentWordIndex│      │ words[]         │
└─────────────────┘      └────────┬────────┘
                                  │ 1..*
                         ┌────────▼────────┐
                         │  WordTiming     │
                         │                 │
                         │ word            │
                         │ startMs/endMs   │
                         │ charOffset      │
                         └─────────────────┘
```

## Cache Integration

Word timings are cached alongside audio data in the existing audio cache.

| Cache Key | Value |
|-----------|-------|
| `{provider}-{voice}-{textHash}` | `{ audioData: ArrayBuffer, wordTiming: WordTimeline \| null }` |

**Cache Behavior**:
- Word timing is computed once per unique text/audio combination
- If cached entry has `wordTiming: null`, indicates previous alignment failure
- Cache TTL follows existing audio cache policy

## Message Types

New message types for content script communication:

| Type | Direction | Payload |
|------|-----------|---------|
| `SET_WORD_TIMELINE` | background → content | `{ wordTimeline: WordTiming[], paragraphIndex: number }` |
| `HIGHLIGHT_WORD` | background → content | `{ paragraphIndex: number, wordIndex: number, timestamp: number }` |
| `WORD_SYNC_STATUS` | background → popup | `{ available: boolean, reason?: string }` |

## Storage Schema Changes

### Before

```javascript
{
  groqTtsApiKey: string,  // Existing
  // ...other settings
}
```

### After

```javascript
{
  groqApiKey: string,     // Renamed from groqTtsApiKey (migration needed)
  wordSyncEnabled: true,  // New setting
  // ...other settings
}
```

**Migration**: On extension update, if `groqTtsApiKey` exists, copy to `groqApiKey` and delete old key.
