# Data Model: Complete Architecture Migration

**Feature**: 061-complete-architecture-migration
**Date**: 2026-02-08

## Overview

This migration does not introduce new data models. It fixes wiring between existing models. The key entities and their relationships are documented below for reference during implementation.

## Core Entities

### PlaybackState (src/core/playback/playback-state.ts)

```typescript
interface PlaybackState {
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error';
  activeTabId: number | null;
  paragraphs: string[];
  currentParagraphIndex: number;
  totalParagraphs: number;
  progress: number;          // 0-100
  speed: number;             // 0.5-3.0
  provider: string;          // 'browser' | 'elevenlabs'
  voice: string | null;
  language: string | null;   // BCP-47 code (currently hardcoded to null — must wire)
  error: PlaybackError | null;
}
```

### AudioRequest / AudioResponse (src/ports/audio-generator.port.ts)

```typescript
interface AudioRequest {
  text: string;
  provider: string;
  voice: string | null;
  speed: number;
  language: string | null;   // Must be populated from language detection
}

interface AudioResponse {
  audioBlob: Blob;           // Must contain valid audio data (NOT empty for browser TTS)
  durationMs: number;
  wordTimings: WordTiming[] | null;
}
```

### FooterState (sent from background → content script)

```typescript
interface FooterState {
  status: PlaybackState['status'];
  currentIndex: number;
  totalParagraphs: number;
  progress: number;
  currentText: string;
  speed: number;
}
```

### Message Types (background ↔ popup ↔ content)

```typescript
// Popup → Background (must use dot-notation)
type PopupMessages = {
  'playback.start': { tabId: number };
  'playback.pause': void;
  'playback.resume': void;
  'playback.stop': void;
  'playback.next': void;
  'playback.prev': void;
  'playback.seek': { position: number };
  'playback.getState': void;
  'settings.update': { key: string; value: unknown };
};

// Background → Content Script (must use SCREAMING_SNAKE_CASE)
type BackgroundToContentMessages = {
  'FOOTER_SHOW': { initialState?: FooterState };
  'FOOTER_HIDE': void;
  'FOOTER_STATE_UPDATE': FooterState;
  'highlight': { index: number; elements: unknown[] };
  'highlightWord': { wordIndex: number };
  'clearHighlight': void;
};
```

## Key Relationships

```
Popup ──(dot-notation messages)──► Background (Handler Registry)
                                       │
                                       ├── PlaybackService
                                       │     ├── IAudioGenerator (port)
                                       │     │     ├── BrowserTtsAudioAdapter (dual-path needed)
                                       │     │     └── ElevenLabsAudioAdapter (working)
                                       │     ├── ICacheStore (port) → IndexedDB adapter
                                       │     ├── IHighlightSynchronizer (port)
                                       │     │     └── HighlightSyncAdapter
                                       │     │           └──(SCREAMING_SNAKE_CASE)──► Content Script
                                       │     └── ISettingsStore (port) → browser.storage adapter
                                       │
                                       └── Language Detection → franc-min
```

## Migration Impact on Data

No storage schema changes. No IndexedDB migrations. No browser.storage format changes. This is purely a wiring and code cleanup migration.
