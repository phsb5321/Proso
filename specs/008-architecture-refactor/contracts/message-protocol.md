# Message Protocol Contract

**Feature**: 008-architecture-refactor
**Date**: 2025-12-31
**Source**: `background/constants.js` MessageType enum

## Overview

This document defines all message types used for communication between VoxPage extension components. Messages flow between:
- **Popup** ↔ **Background**: User actions, state queries
- **Background** ↔ **Content**: Text extraction, highlighting
- **Content** → **Background**: User interactions on floating controller

## Message Format

All messages follow this structure:

```javascript
{
  type: string,      // MessageType enum value
  payload?: object   // Optional data specific to message type
}
```

## Message Categories

### 1. Playback Control

| Type | Direction | Payload | Response | Handler Module |
|------|-----------|---------|----------|----------------|
| `play` | popup → background | `{ mode: 'selection' \| 'article' \| 'full' }` | `{ success: boolean }` | playback-controller |
| `pause` | popup → background | none | `{ success: boolean }` | playback-controller |
| `stop` | popup → background | none | `{ success: boolean }` | playback-controller |
| `prev` | popup → background | none | `{ success: boolean }` | playback-controller |
| `next` | popup → background | none | `{ success: boolean }` | playback-controller |

### 2. State Queries

| Type | Direction | Payload | Response | Handler Module |
|------|-----------|---------|----------|----------------|
| `getState` | popup → background | none | `PlaybackState` | playback-controller |
| `textContent` | content → background | `{ paragraphs: string[], mode: string }` | none (fire-and-forget) | playback-controller |

### 3. Settings

| Type | Direction | Payload | Response | Handler Module |
|------|-----------|---------|----------|----------------|
| `setProvider` | popup → background | `{ provider: ProviderId }` | `{ success: boolean }` | playback-controller |
| `setVoice` | popup → background | `{ voice: string }` | `{ success: boolean }` | playback-controller |
| `setSpeed` | popup → background | `{ speed: number }` | `{ success: boolean }` | playback-controller |

### 4. Content Script Actions

| Type | Direction | Payload | Response | Handler Module |
|------|-----------|---------|----------|----------------|
| `extractText` | background → content | `{ mode: string }` | `{ paragraphs: string[] }` | content-extractor |
| `highlight` | background → content | `{ index: number, text: string }` | none | highlight-manager |
| `clearHighlight` | background → content | none | none | highlight-manager |

### 5. Events (Background → UI)

| Type | Direction | Payload | Response | Handler Module |
|------|-----------|---------|----------|----------------|
| `playbackState` | background → popup | `PlaybackState` | none | ui-coordinator |
| `progress` | background → popup | `{ current: number, total: number, percent: number }` | none | ui-coordinator |
| `error` | background → popup | `{ message: string, code?: string }` | none | ui-coordinator |
| `paragraphChanged` | background → popup | `{ index: number, total: number }` | none | ui-coordinator |
| `cacheHit` | background → popup | `{ paragraphIndex: number }` | none | ui-coordinator |
| `preGenerating` | background → popup | `{ index: number }` | none | ui-coordinator |

### 6. Floating Controller

| Type | Direction | Payload | Response | Handler Module |
|------|-----------|---------|----------|----------------|
| `showFloatingController` | background → content | `{ position?: {x, y} }` | none | floating-controller |
| `hideFloatingController` | background → content | none | none | floating-controller |
| `updatePlaybackState` | background → content | `PlaybackState` | none | floating-controller |
| `controllerAction` | content → background | `{ action: string }` | none | playback-controller |
| `controllerPositionChanged` | content → background | `{ x: number, y: number }` | none | ui-coordinator |
| `seekToPosition` | content → background | `{ progress: number }` | none | playback-controller |

### 7. Word-Level Highlighting

| Type | Direction | Payload | Response | Handler Module |
|------|-----------|---------|----------|----------------|
| `highlightWord` | background → content | `WordHighlight` | none | highlight-manager |
| `setWordTimeline` | background → content | `{ timeline: WordTiming[] }` | none | highlight-manager |
| `jumpToWord` | content → background | `{ wordIndex: number }` | none | playback-controller |
| `syncStatus` | background → content | `{ driftMs: number, correcting: boolean }` | none | highlight-manager |

### 8. Audio-Text Sync (007)

| Type | Direction | Payload | Response | Handler Module |
|------|-----------|---------|----------|----------------|
| `requestExtractContent` | background → content | `{ mode: string }` | none | content-extractor |
| `contentExtracted` | content → background | `{ paragraphs: string[], elements: ElementInfo[] }` | none | playback-controller |
| `highlightParagraph` | background → content | `{ index: number, text: string }` | none | highlight-manager |
| `clearHighlights` | background → content | none | none | highlight-manager |
| `syncStateUpdate` | background → content | `SyncState` | none | highlight-manager |
| `requestResync` | content → background | `{ reason: string }` | none | playback-controller |
| `syncError` | background → content | `{ error: string, recoverable: boolean }` | none | highlight-manager |

## Type Definitions

### PlaybackState

```javascript
{
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error',
  currentIndex: number,
  totalParagraphs: number,
  progress: number,        // 0-100
  currentText: string,
  provider: string,
  voice: string,
  speed: number,
  mode: 'selection' | 'article' | 'full',
  error?: string
}
```

### WordHighlight

```javascript
{
  wordIndex: number,
  word: string,
  startMs: number,
  endMs: number,
  paragraphIndex: number
}
```

### WordTiming

```javascript
{
  word: string,
  startMs: number,      // or startTimeMs (normalized)
  endMs: number,        // or endTimeMs (normalized)
  confidence?: number
}
```

### SyncState

```javascript
{
  currentTimeMs: number,
  currentParagraphIndex: number,
  currentWordIndex: number,
  driftMs: number,
  isDrifting: boolean
}
```

### ElementInfo

```javascript
{
  text: string,
  tagName: string,
  xpath?: string
}
```

## Handler Registration Pattern

```javascript
// message-router.js
const router = new MessageRouter();

// Playback control handlers
router.register(MessageType.PLAY, playbackController.handlePlay);
router.register(MessageType.PAUSE, playbackController.handlePause);
router.register(MessageType.STOP, playbackController.handleStop);
router.register(MessageType.PREV, playbackController.handlePrev);
router.register(MessageType.NEXT, playbackController.handleNext);

// State queries
router.register(MessageType.GET_STATE, playbackController.getState);
router.register(MessageType.TEXT_CONTENT, playbackController.handleTextContent);

// Settings
router.register(MessageType.SET_PROVIDER, playbackController.setProvider);
router.register(MessageType.SET_VOICE, playbackController.setVoice);
router.register(MessageType.SET_SPEED, playbackController.setSpeed);

// Controller actions
router.register(MessageType.CONTROLLER_ACTION, playbackController.handleControllerAction);
router.register(MessageType.SEEK_TO_POSITION, playbackController.handleSeek);
router.register(MessageType.CONTROLLER_POSITION_CHANGED, uiCoordinator.savePosition);

// Sync
router.register(MessageType.CONTENT_EXTRACTED, playbackController.handleContentExtracted);
router.register(MessageType.REQUEST_RESYNC, playbackController.handleResync);
router.register(MessageType.JUMP_TO_WORD, playbackController.handleJumpToWord);
```

## Error Handling

All handlers should return errors in a consistent format:

```javascript
{
  success: false,
  error: {
    code: 'ERROR_CODE',
    message: 'Human-readable message'
  }
}
```

Common error codes:
- `NO_CONTENT`: No text extracted from page
- `PROVIDER_ERROR`: TTS provider API failure
- `NO_API_KEY`: API key not configured
- `INVALID_STATE`: Action not valid in current state
- `SYNC_FAILED`: Audio-text synchronization failed
