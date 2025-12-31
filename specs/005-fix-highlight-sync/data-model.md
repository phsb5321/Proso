# Data Model: Fix Highlight Synchronization

**Feature**: 005-fix-highlight-sync
**Date**: 2025-12-31

## Entities

### ParagraphTiming

Represents timing information for a single paragraph in the sync timeline.

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| index | number | Paragraph index (0-based) | >= 0, unique |
| startTimeMs | number | Start time in milliseconds | >= 0 |
| endTimeMs | number | End time in milliseconds | > startTimeMs |
| durationMs | number | Duration in milliseconds | endTimeMs - startTimeMs |

**Validation Rules**:
- `endTimeMs` must equal `paragraphTimeline[index + 1].startTimeMs` (no gaps)
- Last paragraph's `endTimeMs` equals total duration
- All timings recalculate when actual audio duration is known

---

### WordBoundary

Represents timing information for a single word (when TTS provider supports word timing).

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| word | string | The word text | Non-empty |
| charOffset | number | Character offset within paragraph | >= 0 |
| charLength | number | Character length of word | > 0 |
| startTimeMs | number | Start time in milliseconds | >= 0 |
| endTimeMs | number | End time in milliseconds | > startTimeMs |

**Validation Rules**:
- `charOffset + charLength` must not exceed paragraph text length
- Word timings should be sequential (no overlaps)

---

### HighlightState (new)

Represents the current visual highlighting state in the content script.

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| currentParagraphIndex | number | Currently highlighted paragraph | >= 0 or -1 if none |
| currentWordIndex | number \| null | Currently highlighted word | >= 0 or null if none |
| isParagraphHighlighted | boolean | Whether paragraph highlight is active | - |
| isWordHighlighted | boolean | Whether word highlight is active | - |

**State Transitions**:
```
idle → paragraphHighlighted (on playback start)
paragraphHighlighted → paragraphHighlighted (on paragraph change)
paragraphHighlighted → paragraphAndWordHighlighted (when word timing available)
paragraphAndWordHighlighted → paragraphHighlighted (when word timing cleared)
paragraphHighlighted → idle (on stop/completion)
paragraphAndWordHighlighted → idle (on stop/completion)
```

---

### ScrollState (new)

Manages smart scroll detection to avoid interrupting user navigation.

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| lastManualScrollTime | number | Timestamp of last user-initiated scroll | Unix timestamp (ms) |
| isProgrammaticScrolling | boolean | Flag during auto-scroll execution | - |
| scrollCooldownMs | number | Time to wait after manual scroll before auto-scrolling | Default: 4000 |

**Behavior**:
- `lastManualScrollTime` updated on user scroll events (not programmatic)
- Auto-scroll disabled if `Date.now() - lastManualScrollTime < scrollCooldownMs`
- `isProgrammaticScrolling` set true during `scrollIntoView()`, reset after 500ms

---

### SyncState (existing, enhanced)

Enhanced with additional tracking for initial sync and timeline recalculation.

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| paragraphTimeline | ParagraphTiming[] | Timeline of all paragraphs | - |
| wordTimeline | WordBoundary[] \| null | Word timing if available | - |
| currentTimeMs | number | Current playback position | >= 0 |
| totalDurationMs | number | Total audio duration | > 0 |
| currentParagraphIndex | number | Current paragraph | >= 0 |
| currentWordIndex | number \| null | Current word | >= 0 or null |
| isRunning | boolean | Whether sync loop is active | - |
| **hasInitialSyncFired** (new) | boolean | Whether initial paragraph callback has fired | Default: false |
| **isTimelineAccurate** (new) | boolean | Whether timeline uses actual audio duration | Default: false |

---

## Entity Relationships

```
PlaybackSyncState (background)
├── paragraphTimeline: ParagraphTiming[]
├── wordTimeline: WordBoundary[] (optional)
└── callbacks → Content Script

Content Script
├── HighlightState
├── ScrollState
└── extractedParagraphs: Element[]
```

---

## Message Flow

### Paragraph Highlight Update

```
Background (PlaybackSyncState)
  │
  │ onParagraphChange callback
  ▼
  browser.tabs.sendMessage({
    action: 'highlight',
    index: number,
    timestamp: number
  })
  │
  ▼
Content Script
  │
  │ highlightParagraph(index, timestamp)
  ▼
  HighlightState updated
```

### Word Highlight Update

```
Background (PlaybackSyncState)
  │
  │ onWordChange callback
  ▼
  browser.tabs.sendMessage({
    action: 'highlightWord',
    paragraphIndex: number,
    wordIndex: number,
    timestamp: number
  })
  │
  ▼
Content Script
  │
  │ highlightWord(paragraphIndex, wordIndex, timestamp)
  │  (paragraph highlight remains active)
  ▼
  HighlightState updated (both flags true)
```

---

## Storage Impact

No changes to `browser.storage.local` schema. All state is transient (lives only during playback session).
