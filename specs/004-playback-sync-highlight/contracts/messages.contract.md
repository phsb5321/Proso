# Message Contract: Playback Sync & Highlight

**Feature**: 004-playback-sync-highlight
**Date**: 2025-12-31

## Overview

Defines message types exchanged between background script, content script, and popup for playback synchronization and floating controller coordination.

## Message Types

### Background → Content Script

#### SHOW_FLOATING_CONTROLLER

Inject and display the floating controller.

```typescript
interface ShowFloatingControllerMessage {
  action: 'showFloatingController';
  position?: { x: number; y: number };
}
```

#### HIDE_FLOATING_CONTROLLER

Remove the floating controller from the page.

```typescript
interface HideFloatingControllerMessage {
  action: 'hideFloatingController';
}
```

#### UPDATE_PLAYBACK_STATE

Update controller playback status.

```typescript
interface UpdatePlaybackStateMessage {
  action: 'updatePlaybackState';
  status: 'playing' | 'paused' | 'loading' | 'stopped';
  progress: number; // 0-100
  timeRemaining: string; // formatted, e.g., "2:34"
}
```

#### HIGHLIGHT_PARAGRAPH

Highlight a specific paragraph.

```typescript
interface HighlightParagraphMessage {
  action: 'highlightParagraph';
  index: number;
  timestamp: number; // for sync verification
}
```

#### HIGHLIGHT_WORD

Highlight a specific word within the current paragraph.

```typescript
interface HighlightWordMessage {
  action: 'highlightWord';
  paragraphIndex: number;
  wordIndex: number;
  timestamp: number;
}
```

#### CLEAR_HIGHLIGHTS

Clear all highlights from the page.

```typescript
interface ClearHighlightsMessage {
  action: 'clearHighlights';
}
```

#### SET_WORD_TIMELINE

Provide word timing data for current paragraph.

```typescript
interface SetWordTimelineMessage {
  action: 'setWordTimeline';
  paragraphIndex: number;
  words: Array<{
    word: string;
    startTimeMs: number;
    endTimeMs: number;
    charOffset: number;
    charLength: number;
  }>;
}
```

### Content Script → Background

#### CONTROLLER_ACTION

User action from floating controller.

```typescript
interface ControllerActionMessage {
  action: 'controllerAction';
  controllerAction: 'play' | 'pause' | 'stop' | 'prev' | 'next' | 'close';
}
```

#### CONTROLLER_POSITION_CHANGED

User dragged controller to new position.

```typescript
interface ControllerPositionChangedMessage {
  action: 'controllerPositionChanged';
  position: { x: number; y: number };
}
```

#### SEEK_TO_POSITION

User clicked on progress bar or word.

```typescript
interface SeekToPositionMessage {
  action: 'seekToPosition';
  type: 'paragraph' | 'word' | 'progress';
  paragraphIndex?: number;
  wordIndex?: number;
  progressPercent?: number;
}
```

#### PARAGRAPH_CLICKED

User clicked on a paragraph to jump to it.

```typescript
interface ParagraphClickedMessage {
  action: 'jumpToParagraph';
  index: number;
}
```

#### WORD_CLICKED

User clicked on a word to jump to it.

```typescript
interface WordClickedMessage {
  action: 'jumpToWord';
  paragraphIndex: number;
  wordIndex: number;
}
```

### Background → Popup

#### SYNC_STATUS

Current synchronization status.

```typescript
interface SyncStatusMessage {
  type: 'syncStatus';
  hasWordTiming: boolean;
  currentParagraph: number;
  currentWord: number | null;
  syncLatencyMs: number;
}
```

### Popup → Background

#### TOGGLE_FLOATING_CONTROLLER

User toggled floating controller visibility preference.

```typescript
interface ToggleFloatingControllerMessage {
  action: 'toggleFloatingController';
  enabled: boolean;
}
```

## Message Flow Diagrams

### Playback Start

```
Popup                    Background              Content Script
  │                          │                        │
  │──── play ───────────────>│                        │
  │                          │                        │
  │                          │── showFloatingController ─>│
  │                          │                        │
  │                          │── highlightParagraph ──>│
  │                          │                        │
  │<── playbackState ────────│                        │
  │                          │                        │
  │                          │── setWordTimeline ────>│ (if ElevenLabs)
  │                          │                        │
  │                          │── highlightWord ──────>│ (periodic)
```

### User Interaction with Floating Controller

```
Content Script           Background                Popup
     │                       │                       │
     │── controllerAction ──>│                       │
     │   (pause)             │                       │
     │                       │<── getState ──────────│
     │                       │                       │
     │<── updatePlaybackState│                       │
     │                       │                       │
     │                       │── playbackState ─────>│
```

### Seek via Progress Bar

```
Content Script           Background                Popup
     │                       │                       │
     │── seekToPosition ────>│                       │
     │   (progress: 50)      │                       │
     │                       │  [recalculate position]
     │                       │                       │
     │<── highlightParagraph │                       │
     │<── updatePlaybackState│                       │
     │                       │── progress ──────────>│
```

## Error Handling

### Message Validation

All messages should be validated before processing:

```typescript
function validateMessage(message: unknown): boolean {
  if (!message || typeof message !== 'object') return false;
  if (!('action' in message) && !('type' in message)) return false;
  return true;
}
```

### Error Response

```typescript
interface ErrorResponse {
  success: false;
  error: string;
  code: 'INVALID_MESSAGE' | 'CONTENT_SCRIPT_NOT_READY' | 'SYNC_FAILED';
}
```

## Constants

Add to `background/constants.js`:

```javascript
export const MessageType = Object.freeze({
  // Existing...

  // New for 004-playback-sync-highlight
  SHOW_FLOATING_CONTROLLER: 'showFloatingController',
  HIDE_FLOATING_CONTROLLER: 'hideFloatingController',
  UPDATE_PLAYBACK_STATE: 'updatePlaybackState',
  HIGHLIGHT_WORD: 'highlightWord',
  SET_WORD_TIMELINE: 'setWordTimeline',
  CONTROLLER_ACTION: 'controllerAction',
  CONTROLLER_POSITION_CHANGED: 'controllerPositionChanged',
  SEEK_TO_POSITION: 'seekToPosition',
  JUMP_TO_WORD: 'jumpToWord',
  SYNC_STATUS: 'syncStatus',
  TOGGLE_FLOATING_CONTROLLER: 'toggleFloatingController'
});
```
