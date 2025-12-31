# Data Model: Module Dependency Architecture

**Feature**: 008-architecture-refactor
**Date**: 2025-12-31

## Overview

This document defines the module structure and dependency relationships for the refactored VoxPage extension. Since this is a refactoring feature (no new data entities), the "data model" focuses on module interfaces and message contracts.

## Module Hierarchy

### Layer 1: Entry Points (manifest-registered)

| Module | Responsibility | Depends On |
|--------|---------------|------------|
| `background/index.js` | Service worker entry, listener registration | message-router, playback-controller |
| `content/index.js` | Content script entry, DOM initialization | content-extractor, highlight-manager |
| `popup/index.js` | Popup entry, UI initialization | popup-controller |

### Layer 2: Core Services

| Module | Responsibility | Depends On |
|--------|---------------|------------|
| `background/message-router.js` | Route messages to handlers | constants |
| `background/playback-controller.js` | Orchestrate playback lifecycle | audio-generator, playback-sync, ui-coordinator |
| `background/audio-generator.js` | TTS API calls, audio queue | provider-registry, audio-cache, groq-timestamp-provider |
| `background/ui-coordinator.js` | Sync state to popup/controller | constants |
| `content/content-extractor.js` | Extract readable text | content-scorer |
| `content/highlight-manager.js` | Apply/clear highlights | text-segment |

### Layer 3: Support Modules (unchanged)

| Module | Responsibility | Depends On |
|--------|---------------|------------|
| `background/playback-sync.js` | Audio-text sync state | constants |
| `background/audio-cache.js` | LRU audio cache | audio-segment |
| `background/audio-visualizer.js` | Web Audio analysis | (none) |
| `background/provider-registry.js` | Provider management | providers/* |
| `background/constants.js` | Message types, storage keys | (none) |
| `content/text-segment.js` | Text-to-DOM mapping | (none) |
| `content/floating-controller.js` | On-page UI widget | (none) |

### Layer 4: Shared Utilities

| Module | Responsibility | Depends On |
|--------|---------------|------------|
| `shared/message-types.js` | Typed message definitions | (none) |
| `shared/dom-utils.js` | Common DOM helpers | (none) |

## Dependency Graph

```
                    ┌─────────────────┐
                    │ background/     │
                    │ index.js        │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
     │ message-       │ │ playback-      │ │ ui-            │
     │ router.js      │ │ controller.js  │ │ coordinator.js │
     └───────┬────────┘ └───────┬────────┘ └───────┬────────┘
             │                  │                   │
             ▼                  ▼                   ▼
     ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
     │ constants.js   │ │ audio-         │ │ constants.js   │
     └────────────────┘ │ generator.js   │ └────────────────┘
                        └───────┬────────┘
                 ┌──────────────┼──────────────┐
                 ▼              ▼              ▼
        ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
        │ provider-      │ │ audio-cache.js │ │ playback-      │
        │ registry.js    │ └────────────────┘ │ sync.js        │
        └───────┬────────┘                    └────────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
   [providers/*]   [pricing-model]
```

## Module Interfaces

### MessageRouter

```javascript
interface MessageRouter {
  register(type: string, handler: MessageHandler): MessageRouter;
  route(message: Message, sender: Sender): Promise<Response>;
}

type MessageHandler = (payload: any, sender: Sender) => Promise<any>;
type Message = { type: string; payload?: any };
```

### PlaybackController

```javascript
interface PlaybackController {
  start(tabId: number, text: string[], mode: string): Promise<void>;
  pause(tabId: number): Promise<void>;
  resume(tabId: number): Promise<void>;
  stop(tabId: number): Promise<void>;
  next(tabId: number): Promise<void>;
  prev(tabId: number): Promise<void>;
  seek(tabId: number, progress: number): Promise<void>;
  getState(tabId: number): PlaybackState;
}
```

### AudioGenerator

```javascript
interface AudioGenerator {
  generate(text: string, provider: string, voice: string): Promise<AudioData>;
  pregenerate(texts: string[], provider: string, voice: string): void;
  cancel(): void;
}

type AudioData = {
  audioUrl: string;
  wordTimings?: WordTiming[];
  duration: number;
};
```

### ContentExtractor

```javascript
interface ContentExtractor {
  extractSelection(): string[];
  extractArticle(): string[];
  extractFullPage(): string[];
  getMode(): 'selection' | 'article' | 'full';
}
```

### HighlightManager

```javascript
interface HighlightManager {
  highlightParagraph(index: number, paragraphText: string): void;
  highlightWord(wordData: WordHighlight): void;
  clearParagraphHighlight(): void;
  clearWordHighlight(): void;
  clearAll(): void;
}
```

## State Management

### Background State (per-tab isolation)

```javascript
// Managed by playback-controller.js
const tabStates = new Map<number, PlaybackState>();

interface PlaybackState {
  status: 'idle' | 'playing' | 'paused';
  paragraphs: string[];
  currentIndex: number;
  currentAudio: HTMLAudioElement | null;
  provider: string;
  voice: string;
  speed: number;
  mode: 'selection' | 'article' | 'full';
}
```

### Content State (per-page isolation)

```javascript
// Managed by content/index.js
const pageState = {
  floatingController: FloatingController | null,
  highlightManager: HighlightManager,
  textSegments: TextSegment[],
  isActive: boolean
};
```

## Message Protocol

See `contracts/message-protocol.md` for full message type definitions.

### Key Message Flows

**Play Request**:
```
popup → background: { type: 'PLAY', payload: { mode } }
background → content: { type: 'EXTRACT_TEXT', payload: { mode } }
content → background: { type: 'TEXT_CONTENT', payload: { paragraphs } }
background → content: { type: 'HIGHLIGHT_PARAGRAPH', payload: { index } }
```

**Sync Update**:
```
background → content: { type: 'SYNC_UPDATE', payload: { progress, wordIndex } }
background → popup: { type: 'PLAYBACK_STATUS', payload: { status, progress } }
```

## Validation Rules

1. **No circular dependencies**: Enforced by `npm run deps:check`
2. **Single responsibility**: Each module ≤300 lines
3. **Explicit dependencies**: All imports at module top
4. **Layer isolation**: Lower layers don't import from higher layers
