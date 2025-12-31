# Data Model: Playback Sync & Highlight

**Feature**: 004-playback-sync-highlight
**Date**: 2025-12-31

## Core Entities

### PlaybackPosition

Represents the current position within the content being read.

```typescript
interface PlaybackPosition {
  /** Index of current paragraph (0-based) */
  paragraphIndex: number;

  /** Index of current word within paragraph (0-based, null if word-level unavailable) */
  wordIndex: number | null;

  /** Current audio time in milliseconds */
  currentTimeMs: number;

  /** Total duration in milliseconds (estimated or actual) */
  totalDurationMs: number;

  /** Whether word-level timing is available */
  hasWordTiming: boolean;
}
```

### TextSegment

Maps extracted text to DOM elements for highlighting.

```typescript
interface TextSegment {
  /** Unique identifier for this segment */
  id: string;

  /** The text content of this segment */
  text: string;

  /** Reference to the DOM element containing this segment */
  element: Element;

  /** Character offset range within the full text */
  charRange: {
    start: number;
    end: number;
  };

  /** Word boundaries within this segment (for word-level highlighting) */
  words: WordBoundary[];

  /** Segment type */
  type: 'paragraph' | 'heading' | 'listItem';
}
```

### WordBoundary

Timing and position data for a single word.

```typescript
interface WordBoundary {
  /** The word text */
  word: string;

  /** Character offset within the segment */
  charOffset: number;

  /** Character length */
  charLength: number;

  /** Start time in milliseconds (from TTS timestamps) */
  startTimeMs: number;

  /** End time in milliseconds */
  endTimeMs: number;
}
```

### WordTiming

Raw timing data from TTS provider (ElevenLabs format).

```typescript
interface WordTiming {
  /** Array of characters with timing */
  characters: string[];

  /** Start times for each character (seconds) */
  character_start_times_seconds: number[];

  /** End times for each character (seconds) */
  character_end_times_seconds: number[];
}
```

### FloatingControllerState

State of the floating playback controller.

```typescript
interface FloatingControllerState {
  /** Whether controller is visible */
  visible: boolean;

  /** Position on screen */
  position: {
    x: number;
    y: number;
  };

  /** Current playback status */
  playbackStatus: 'playing' | 'paused' | 'loading' | 'stopped';

  /** Progress as percentage (0-100) */
  progressPercent: number;

  /** Formatted time remaining (e.g., "2:34") */
  timeRemaining: string;

  /** Whether user is currently dragging */
  isDragging: boolean;
}
```

### SyncState

Synchronization state between audio and text.

```typescript
interface SyncState {
  /** Currently highlighted paragraph index */
  activeParagraphIndex: number;

  /** Currently highlighted word index (null if paragraph-only) */
  activeWordIndex: number | null;

  /** Pre-computed paragraph timestamps */
  paragraphTimeline: ParagraphTiming[];

  /** Pre-computed word timestamps (null if unavailable) */
  wordTimeline: WordBoundary[] | null;

  /** Last sync timestamp for latency tracking */
  lastSyncTimestamp: number;
}
```

### ParagraphTiming

Timing data for paragraph-level synchronization.

```typescript
interface ParagraphTiming {
  /** Paragraph index */
  index: number;

  /** Start time in milliseconds */
  startTimeMs: number;

  /** End time in milliseconds */
  endTimeMs: number;

  /** Duration in milliseconds */
  durationMs: number;
}
```

## Storage Schema

### browser.storage.local

```typescript
interface StoredState {
  /** Floating controller position preference */
  floatingControllerPosition: {
    x: number;
    y: number;
  };

  /** User preference for floating controller */
  floatingControllerEnabled: boolean;
}
```

## State Transitions

### Playback Lifecycle

```
IDLE → LOADING → PLAYING ⟷ PAUSED → STOPPED → IDLE
                    ↓
                  ERROR → IDLE
```

### Controller Visibility

```
Hidden → Visible (when playback starts)
Visible → Hidden (when playback stops or user closes)
Visible → Dragging → Visible (during drag)
```

### Sync State

```
NoSync → ParagraphSync (always available)
ParagraphSync → WordSync (when ElevenLabs with timestamps)
*Any* → Resync (on DOM mutation)
```

## Relationships

```
PlaybackPosition 1──────* TextSegment
     │                       │
     │                       * WordBoundary
     │                           │
     └───────────────────────────┘
              uses

FloatingControllerState ←─── SyncState
         │                        │
         │    reflects            │ drives
         ▼                        ▼
    [UI Component]          [Highlighting]
```

## Validation Rules

1. **PlaybackPosition**
   - `paragraphIndex` must be >= 0 and < total paragraphs
   - `wordIndex` must be null OR (>= 0 and < words in current paragraph)
   - `currentTimeMs` must be >= 0 and <= `totalDurationMs`

2. **TextSegment**
   - `charRange.end` must be > `charRange.start`
   - `element` must be a valid DOM reference
   - `words` array must cover entire segment text (no gaps)

3. **WordBoundary**
   - `endTimeMs` must be >= `startTimeMs`
   - `charOffset + charLength` must not exceed segment length

4. **FloatingControllerState**
   - `progressPercent` must be 0-100
   - `position.x` and `position.y` must be within viewport bounds
