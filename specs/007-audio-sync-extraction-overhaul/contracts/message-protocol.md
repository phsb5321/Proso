# Message Protocol: Background <-> Content Script Communication

**Feature**: 007-audio-sync-extraction-overhaul
**Created**: 2025-12-31
**Transport**: browser.runtime.sendMessage / browser.tabs.sendMessage

## Overview

All communication between the background service worker and content scripts uses structured messages with explicit type discriminators. This document defines the contracts for sync-related and extraction-related messages.

## Message Envelope

```typescript
interface Message<T extends string, P = unknown> {
  type: T;
  payload: P;
  timestamp?: number; // Optional: performance.now() for latency measurement
}
```

---

## Content Extraction Messages

### REQUEST_EXTRACT_CONTENT

**Direction**: Background -> Content
**Purpose**: Request content extraction from page

```typescript
interface RequestExtractContent {
  type: 'REQUEST_EXTRACT_CONTENT';
  payload: {
    /** Optional selector hints for this specific site */
    selectorHints?: string[];
    /** Minimum text length for paragraphs */
    minTextLength?: number; // Default: 30
  };
}
```

### CONTENT_EXTRACTED

**Direction**: Content -> Background
**Purpose**: Return extracted content

```typescript
interface ContentExtracted {
  type: 'CONTENT_EXTRACTED';
  payload: {
    /** Array of paragraph texts in reading order */
    paragraphs: string[];
    /** Page title */
    title: string;
    /** Total word count */
    wordCount: number;
    /** Extraction method used */
    extractionMethod: 'wiki-selector' | 'article-tag' | 'content-score' | 'fallback';
    /** Extraction duration in ms */
    extractionDurationMs: number;
  };
}
```

---

## Highlighting Messages

### HIGHLIGHT_PARAGRAPH

**Direction**: Background -> Content
**Purpose**: Highlight a paragraph by text matching

```typescript
interface HighlightParagraph {
  type: 'HIGHLIGHT_PARAGRAPH';
  payload: {
    /** Paragraph index in extracted content */
    paragraphIndex: number;
    /** Paragraph text for matching (FR-018) */
    paragraphText: string;
    /** Timestamp for latency measurement */
    timestamp: number;
  };
}
```

**Response**: None (fire-and-forget)

### HIGHLIGHT_WORD

**Direction**: Background -> Content
**Purpose**: Highlight a specific word within current paragraph

```typescript
interface HighlightWord {
  type: 'HIGHLIGHT_WORD';
  payload: {
    /** Paragraph index containing the word */
    paragraphIndex: number;
    /** Word index within paragraph's word timeline */
    wordIndex: number;
    /** Character offset within paragraph text */
    charOffset: number;
    /** Character length of word */
    charLength: number;
    /** Timestamp for latency measurement */
    timestamp: number;
  };
}
```

**Response**: None (fire-and-forget)

### CLEAR_HIGHLIGHTS

**Direction**: Background -> Content
**Purpose**: Clear all current highlights

```typescript
interface ClearHighlights {
  type: 'CLEAR_HIGHLIGHTS';
  payload: {
    /** Clear only word highlight, keep paragraph */
    wordOnly?: boolean;
  };
}
```

---

## Sync State Messages

### SYNC_STATE_UPDATE

**Direction**: Background -> Content
**Purpose**: Periodic sync state broadcast

```typescript
interface SyncStateUpdate {
  type: 'SYNC_STATE_UPDATE';
  payload: {
    /** Current time in milliseconds */
    currentTimeMs: number;
    /** Current paragraph index */
    paragraphIndex: number;
    /** Current word index (null if no word timing) */
    wordIndex: number | null;
    /** Progress percentage (0-100) */
    progressPercent: number;
    /** Time remaining formatted string */
    timeRemaining: string;
    /** Whether sync is running */
    isRunning: boolean;
  };
}
```

### REQUEST_RESYNC

**Direction**: Content -> Background
**Purpose**: Request sync recalibration (e.g., after tab visibility change)

```typescript
interface RequestResync {
  type: 'REQUEST_RESYNC';
  payload: {
    /** Reason for resync request */
    reason: 'tab-visible' | 'user-seek' | 'drift-detected';
    /** Current audio time if known */
    currentTimeMs?: number;
  };
}
```

---

## Playback Control Messages

### SEEK_TO_PARAGRAPH

**Direction**: Content -> Background
**Purpose**: User clicked on a paragraph to seek

```typescript
interface SeekToParagraph {
  type: 'SEEK_TO_PARAGRAPH';
  payload: {
    /** Target paragraph index */
    paragraphIndex: number;
    /** Paragraph text for verification */
    paragraphText: string;
  };
}
```

### SEEK_TO_TIME

**Direction**: Content -> Background
**Purpose**: Seek to specific time (from progress bar)

```typescript
interface SeekToTime {
  type: 'SEEK_TO_TIME';
  payload: {
    /** Target time in milliseconds */
    targetTimeMs: number;
  };
}
```

---

## Error Messages

### SYNC_ERROR

**Direction**: Background -> Content
**Purpose**: Report sync-related errors

```typescript
interface SyncError {
  type: 'SYNC_ERROR';
  payload: {
    /** Error code for programmatic handling */
    code: 'WORD_TIMING_FAILED' | 'EXTRACTION_FAILED' | 'AUDIO_LOAD_FAILED';
    /** Human-readable message */
    message: string;
    /** Whether playback can continue */
    recoverable: boolean;
    /** Fallback mode activated */
    fallbackMode?: 'paragraph-only' | 'none';
  };
}
```

---

## Type Union

```typescript
type SyncMessage =
  | RequestExtractContent
  | ContentExtracted
  | HighlightParagraph
  | HighlightWord
  | ClearHighlights
  | SyncStateUpdate
  | RequestResync
  | SeekToParagraph
  | SeekToTime
  | SyncError;

// Type guard helper
function isSyncMessage(msg: unknown): msg is SyncMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    typeof (msg as SyncMessage).type === 'string'
  );
}
```

---

## Latency Requirements

| Message | Max Latency | Measurement Point |
|---------|-------------|-------------------|
| HIGHLIGHT_PARAGRAPH | 200ms | timestamp -> highlight applied |
| HIGHLIGHT_WORD | 100ms | timestamp -> highlight applied |
| CONTENT_EXTRACTED | 500ms | request -> response |
| SYNC_STATE_UPDATE | 250ms | audio event -> message sent |

## Security Notes

Per constitution II. Security by Default:
- Messages do NOT contain API keys or credentials
- Content script cannot request API operations directly
- All messages validated before processing
- DOM manipulation uses safe methods (textContent, classList)
