# Data Model: Audio-Text Sync & Content Extraction Overhaul

**Feature**: 007-audio-sync-extraction-overhaul
**Created**: 2025-12-31
**Source**: [spec.md](./spec.md) Key Entities section

## Entities

### WordTiming

Represents timing data for a single word within a paragraph's audio.

```typescript
interface WordTiming {
  /** The word text as spoken/transcribed */
  word: string;

  /** Start time in milliseconds from paragraph audio start */
  startTimeMs: number;

  /** End time in milliseconds from paragraph audio start */
  endTimeMs: number;

  /** Character offset within the paragraph text */
  charOffset: number;

  /** Character length of the word */
  charLength: number;

  /** Confidence score from transcription (0-1, optional) */
  confidence?: number;
}
```

**Validation Rules**:
- `startTimeMs` >= 0
- `endTimeMs` > `startTimeMs`
- `charOffset` >= 0
- `charLength` > 0
- `word.length` > 0

**Storage**: Cached in `browser.storage.local` alongside audio blob, keyed by paragraph text hash.

---

### ParagraphTiming

Represents timing data for a paragraph within the overall content timeline.

```typescript
interface ParagraphTiming {
  /** Index in the paragraphs array */
  index: number;

  /** Start time in milliseconds from session start (cumulative) */
  startTimeMs: number;

  /** End time in milliseconds from session start (cumulative) */
  endTimeMs: number;

  /** Duration of this paragraph's audio in milliseconds */
  durationMs: number;

  /** The paragraph text content */
  text: string;

  /** Word count used for proportional time distribution */
  wordCount: number;
}
```

**Validation Rules**:
- `index` >= 0
- `startTimeMs` >= 0
- `endTimeMs` > `startTimeMs`
- `durationMs` === `endTimeMs - startTimeMs`
- `text.length` > 0
- `wordCount` > 0

**State Transitions**:
- `estimated` -> `accurate`: When actual audio duration is known via `loadedmetadata`
- Proportional recalculation occurs on timeline rebuild

---

### ContentBlock

Represents a block of extracted content mapped to a DOM element.

```typescript
interface ContentBlock {
  /** Reference to the DOM element */
  element: HTMLElement;

  /** Extracted and cleaned text content */
  text: string;

  /** Content quality score (higher = more likely main content) */
  score: number;

  /** Element type for styling/behavior hints */
  type: 'paragraph' | 'heading' | 'list-item' | 'blockquote';

  /** Link density ratio (0-1, links text length / total text length) */
  linkDensity: number;

  /** Whether this block passed content filtering */
  isContent: boolean;
}
```

**Validation Rules**:
- `text.length` >= 30 (minimum content threshold per FR-015)
- `linkDensity` < 0.7 (per FR-016)
- `element` must be visible and not inside filtered selectors

**Scoring Factors** (from FR-013):
- +10 per meaningful paragraph (>50 chars)
- +5 per heading (h1-h6)
- -100 * linkDensity
- -50 if matches navigation class patterns

---

### SyncState

Represents the current synchronization state of the playback system.

```typescript
interface SyncState {
  /** Current playback time in milliseconds */
  currentTimeMs: number;

  /** Index of currently highlighted word (-1 if none) */
  currentWordIndex: number;

  /** Index of currently highlighted paragraph */
  currentParagraphIndex: number;

  /** Detected drift from expected time in milliseconds */
  driftMs: number;

  /** Whether word-level timing is available */
  hasWordTiming: boolean;

  /** Whether sync loop is running */
  isRunning: boolean;

  /** Whether timeline has been calibrated to actual audio duration */
  isTimelineAccurate: boolean;

  /** Last sync update timestamp (performance.now) */
  lastSyncTimestamp: number;
}
```

**State Transitions**:
- `idle` -> `running`: On playback start
- `running` -> `paused`: On user pause
- `paused` -> `running`: On user resume
- `running` -> `idle`: On playback complete or stop
- `driftMs` triggers auto-correction when > 200ms (FR-006)

---

### HighlightState

Represents the current highlighting state in the content script.

```typescript
interface HighlightState {
  /** Currently highlighted paragraph element */
  activeParagraph: HTMLElement | null;

  /** Currently highlighted word Range */
  activeWordRange: Range | null;

  /** CSS Custom Highlight instance for word highlighting */
  wordHighlight: Highlight | null;

  /** Whether CSS Custom Highlight API is supported */
  supportsCustomHighlight: boolean;

  /** Timestamp of last highlight update */
  lastUpdateTimestamp: number;
}
```

**Validation Rules**:
- Only one paragraph active at a time
- Only one word range active at a time
- Clear previous highlight before applying new (FR-022)

---

## Relationships

```
ContentBlock 1 ----* WordTiming
    │                    │
    │                    │ (linked via charOffset)
    │                    │
    └──── text ────────────

ParagraphTiming 1 ----1 ContentBlock
    │
    │ (linked via index and text)
    │
SyncState ────────────┘
    │
    │ (currentParagraphIndex, currentWordIndex)
    │
    └────── HighlightState
            (applies visual state)
```

## Storage Schema

### Word Timing Cache (browser.storage.local)

```typescript
interface WordTimingCache {
  /** Key: hash of paragraph text */
  [paragraphHash: string]: {
    /** Cached word timings */
    timings: WordTiming[];
    /** Audio duration this was calibrated to */
    audioDurationMs: number;
    /** Timestamp when cached */
    cachedAt: number;
    /** Size in bytes (for LRU eviction) */
    sizeBytes: number;
  };
}
```

**Eviction Policy**: LRU when total size > 5MB (SC-008)

### Settings (browser.storage.local)

```typescript
interface SyncSettings {
  /** Enable word-level highlighting (requires Groq API) */
  enableWordHighlight: boolean;
  /** Sync update interval in milliseconds */
  syncIntervalMs: number;
  /** Auto-scroll behavior */
  autoScroll: 'smooth' | 'instant' | 'none';
  /** Drift threshold for auto-correction */
  driftThresholdMs: number;
}
```

Default values:
- `enableWordHighlight`: true
- `syncIntervalMs`: 250 (FR-002)
- `autoScroll`: 'smooth'
- `driftThresholdMs`: 200 (FR-006)
