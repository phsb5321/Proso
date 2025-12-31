# API Contract: PlaybackSyncState

**Feature**: 005-fix-highlight-sync
**Date**: 2025-12-31

## Overview

This contract defines the public API for the `PlaybackSyncState` class in `background/playback-sync.js`.

---

## Class: PlaybackSyncState

### Constructor

```typescript
constructor()
```

Initializes a new sync state with default values:
- `currentParagraphIndex`: 0
- `currentTimeMs`: 0
- `totalDurationMs`: 0
- `hasWordTiming`: false

---

## Properties (Getters)

### currentParagraphIndex
```typescript
get currentParagraphIndex(): number
```
Returns the current paragraph index (0-based).

### currentTimeMs
```typescript
get currentTimeMs(): number
```
Returns the current playback time in milliseconds.

### totalDurationMs
```typescript
get totalDurationMs(): number
```
Returns the total duration in milliseconds.

### currentWordIndex
```typescript
get currentWordIndex(): number | null
```
Returns the current word index, or `null` if word timing unavailable.

### hasWordTiming
```typescript
get hasWordTiming(): boolean
```
Returns `true` if word-level timing data is available.

### progressPercent
```typescript
get progressPercent(): number
```
Returns progress as a percentage (0-100), capped at 100.

---

## Methods

### buildParagraphTimeline

```typescript
buildParagraphTimeline(paragraphs: string[], totalDurationMs: number): void
```

Builds the initial paragraph timeline based on word count distribution.

**Parameters**:
- `paragraphs`: Array of paragraph text strings
- `totalDurationMs`: Estimated total duration in milliseconds

**Behavior**:
- Distributes time proportionally based on word count
- Initializes `currentParagraphIndex` to 0
- Sets `isTimelineAccurate` to false (estimated)

---

### rebuildTimelineWithDuration (new)

```typescript
rebuildTimelineWithDuration(actualDurationMs: number): void
```

Recalculates the timeline with the actual audio duration.

**Parameters**:
- `actualDurationMs`: Actual audio duration from `audio.duration * 1000`

**Behavior**:
- Scales all timing values by `actualDurationMs / totalDurationMs`
- Ensures no gaps between paragraphs (end = next start)
- Sets `isTimelineAccurate` to true

**When to call**: On `audio.loadedmetadata` event.

---

### setWordTimeline

```typescript
setWordTimeline(wordTimeline: WordBoundary[]): void
```

Sets word timing data for word-level highlighting.

**Parameters**:
- `wordTimeline`: Array of `WordBoundary` objects

---

### clearWordTimeline

```typescript
clearWordTimeline(): void
```

Clears word timing data, falling back to paragraph-only sync.

---

### onParagraphChange

```typescript
onParagraphChange(callback: (paragraphIndex: number, timestamp: number) => void): void
```

Registers a callback for paragraph change events.

**Callback Parameters**:
- `paragraphIndex`: New paragraph index
- `timestamp`: Unix timestamp when the change was detected

---

### onWordChange

```typescript
onWordChange(callback: (paragraphIndex: number, wordIndex: number, timestamp: number) => void): void
```

Registers a callback for word change events.

**Callback Parameters**:
- `paragraphIndex`: Current paragraph index
- `wordIndex`: New word index
- `timestamp`: Unix timestamp when the change was detected

---

### onProgress

```typescript
onProgress(callback: (progressPercent: number, timeRemaining: string) => void): void
```

Registers a callback for progress updates (called on each sync loop iteration).

---

### start

```typescript
start(audioElement?: HTMLAudioElement): void
```

Starts the sync loop.

**Parameters**:
- `audioElement`: Optional audio element to track for time updates

**Behavior**:
- Sets `_isRunning` to true
- **NEW**: Fires initial `onParagraphChange` callback with current paragraph
- Starts `requestAnimationFrame` sync loop

---

### stop

```typescript
stop(): void
```

Stops the sync loop completely.

---

### pause

```typescript
pause(): void
```

Pauses the sync loop while maintaining state.

---

### resume

```typescript
resume(): void
```

Resumes a paused sync loop.

---

### seekTo

```typescript
seekTo(timeMs: number): void
```

Seeks to a specific time.

**Parameters**:
- `timeMs`: Target time in milliseconds

**Behavior**:
- Clamps to valid range [0, totalDurationMs]
- Triggers sync to find correct paragraph/word
- Fires callbacks if position changed

---

### seekToParagraph

```typescript
seekToParagraph(paragraphIndex: number): void
```

Seeks to the start of a specific paragraph.

---

### getTimeRemaining

```typescript
getTimeRemaining(): string
```

Returns formatted time remaining as "M:SS".

---

### reset

```typescript
reset(): void
```

Resets all state to initial values.

---

## Sync Loop Behavior

The internal `_syncLoop()` runs via `requestAnimationFrame`:

1. Updates `_currentTimeMs` from audio element if available
2. Calls `syncToParagraph()` to detect paragraph changes
3. Calls `syncToWord()` if word timing available
4. Calls `onProgress` callback
5. Schedules next frame

**Frequency**: ~60 times per second (requestAnimationFrame rate)

---

## Latency Guarantees

| Operation | Target Latency |
|-----------|----------------|
| Paragraph sync detection | < 16ms (one frame) |
| Paragraph callback to content script | < 200ms total |
| Word sync detection | < 16ms (one frame) |
| Word callback to content script | < 100ms total |

Latency measured from audio time change to highlight appearing on screen.
