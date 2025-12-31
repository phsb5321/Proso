# Message Contracts: Highlight Synchronization

**Feature**: 005-fix-highlight-sync
**Date**: 2025-12-31

## Overview

These contracts define the message format for communication between the background script and content script for highlight synchronization.

---

## Background → Content Script Messages

### highlight

Triggers paragraph highlighting in the content script.

**Action**: `highlight`

**Payload**:
```typescript
{
  action: 'highlight';
  index: number;        // Paragraph index (0-based)
  timestamp: number;    // Unix timestamp (ms) when message was sent
}
```

**Validation**:
- `index` must be >= 0
- `timestamp` must be a valid Unix timestamp (used for latency verification)

**Response**: None (fire-and-forget)

**Example**:
```json
{
  "action": "highlight",
  "index": 3,
  "timestamp": 1735660800000
}
```

---

### highlightWord

Triggers word-level highlighting within the current paragraph.

**Action**: `highlightWord`

**Payload**:
```typescript
{
  action: 'highlightWord';
  paragraphIndex: number;  // Paragraph index (0-based)
  wordIndex: number;       // Word index within paragraph (0-based)
  timestamp: number;       // Unix timestamp (ms) when message was sent
}
```

**Validation**:
- `paragraphIndex` must match the currently highlighted paragraph
- `wordIndex` must be >= 0 and < word timeline length
- `timestamp` must be a valid Unix timestamp

**Response**: None (fire-and-forget)

**Example**:
```json
{
  "action": "highlightWord",
  "paragraphIndex": 3,
  "wordIndex": 7,
  "timestamp": 1735660800100
}
```

---

### setWordTimeline

Sets the word timing data for the current paragraph.

**Action**: `setWordTimeline`

**Payload**:
```typescript
{
  action: 'setWordTimeline';
  paragraphIndex: number;
  wordTimeline: WordBoundary[];  // See data-model.md for structure
}
```

**WordBoundary**:
```typescript
{
  word: string;
  charOffset: number;
  charLength: number;
  startTimeMs: number;
  endTimeMs: number;
}
```

**Response**: None (fire-and-forget)

**Example**:
```json
{
  "action": "setWordTimeline",
  "paragraphIndex": 3,
  "wordTimeline": [
    { "word": "Hello", "charOffset": 0, "charLength": 5, "startTimeMs": 0, "endTimeMs": 400 },
    { "word": "world", "charOffset": 6, "charLength": 5, "startTimeMs": 400, "endTimeMs": 800 }
  ]
}
```

---

### clearHighlight

Clears all highlights (both paragraph and word).

**Action**: `clearHighlight`

**Payload**:
```typescript
{
  action: 'clearHighlight';
}
```

**Response**: None (fire-and-forget)

---

### updatePlaybackState

Updates the floating controller with playback state (existing, unchanged).

**Action**: `updatePlaybackState`

**Payload**:
```typescript
{
  action: 'updatePlaybackState';
  isPlaying: boolean;
  progress: number;        // 0-100
  timeRemaining: string;   // Formatted as "M:SS"
}
```

---

## Content Script → Background Messages

### jumpToParagraph

Requests playback to jump to a specific paragraph (click-to-seek).

**Action**: `jumpToParagraph`

**Payload**:
```typescript
{
  action: 'jumpToParagraph';
  index: number;  // Target paragraph index
}
```

**Response**: None (background handles internally)

---

### jumpToWord

Requests playback to jump to a specific word (click-to-seek).

**Action**: `jumpToWord`

**Payload**:
```typescript
{
  action: 'jumpToWord';
  paragraphIndex: number;
  wordIndex: number;
}
```

**Response**: None (background handles internally)

---

## Latency Requirements

| Message Type | Max Latency | Verification |
|--------------|-------------|--------------|
| highlight | 200ms | Content script logs warning if exceeded |
| highlightWord | 100ms | Content script logs warning if exceeded |

Latency is measured as `Date.now() - message.timestamp` in the content script.

---

## Error Handling

All messages are fire-and-forget. If a message fails:
- Content script logs error to console
- Playback continues (no interruption)
- Next message will attempt to resync

Example error handling in content script:
```javascript
case 'highlight':
  try {
    highlightParagraph(message.index, message.timestamp);
  } catch (err) {
    console.error('VoxPage: Failed to highlight paragraph:', err);
  }
  break;
```
