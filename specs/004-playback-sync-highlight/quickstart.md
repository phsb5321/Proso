# Quickstart: Playback Sync & Highlight

**Feature**: 004-playback-sync-highlight
**Date**: 2025-12-31

## Prerequisites

- Firefox Developer Edition 112+
- Node.js 18+
- VoxPage extension loaded in Firefox
- (Optional) ElevenLabs API key for word-level highlighting

## Development Setup

```bash
# Install dependencies
npm install

# Run tests
npm test

# Start Firefox with extension loaded
npm run start:firefox
```

## Key Files to Modify

### 1. Background Script (`background/background.js`)

Add word timing support to `playCurrentParagraph()`:

```javascript
// After generating audio, check for word timing
if (playbackState.currentProvider === ProviderId.ELEVENLABS) {
  const wordTiming = await fetchWordTiming(text);
  if (wordTiming) {
    notifyWordTimeline(playbackState.currentIndex, wordTiming);
  }
}
```

### 2. Content Script (`content/content.js`)

Add floating controller injection:

```javascript
import { FloatingController } from './floating-controller.js';

const floatingController = new FloatingController();

browser.runtime.onMessage.addListener((message) => {
  switch (message.action) {
    case 'showFloatingController':
      floatingController.show(message.position);
      break;
    case 'hideFloatingController':
      floatingController.hide();
      break;
    case 'updatePlaybackState':
      floatingController.updateState(message);
      break;
  }
});
```

### 3. New File: `content/floating-controller.js`

```javascript
export class FloatingController {
  constructor() {
    this.container = null;
    this.shadowRoot = null;
  }

  show(position) {
    if (this.container) return;

    this.container = document.createElement('div');
    this.container.id = 'voxpage-floating-controller';
    this.shadowRoot = this.container.attachShadow({ mode: 'closed' });

    this.shadowRoot.innerHTML = `
      <style>${this.getStyles()}</style>
      ${this.getTemplate()}
    `;

    document.body.appendChild(this.container);
    this.setupEventListeners();
    this.setPosition(position || this.getStoredPosition());
  }

  hide() {
    if (this.container) {
      this.container.remove();
      this.container = null;
      this.shadowRoot = null;
    }
  }

  // ... implement remaining methods
}
```

### 4. Add Message Types (`background/constants.js`)

```javascript
export const MessageType = Object.freeze({
  // ... existing types

  // Floating controller
  SHOW_FLOATING_CONTROLLER: 'showFloatingController',
  HIDE_FLOATING_CONTROLLER: 'hideFloatingController',
  UPDATE_PLAYBACK_STATE: 'updatePlaybackState',

  // Word-level sync
  HIGHLIGHT_WORD: 'highlightWord',
  SET_WORD_TIMELINE: 'setWordTimeline',
  JUMP_TO_WORD: 'jumpToWord',
});
```

## Testing

### Unit Tests

```bash
# Run specific test file
npm test -- tests/unit/floating-controller.test.js

# Run with coverage
npm test -- --coverage
```

### Manual Testing

1. **Floating Controller**:
   - Start playback on any webpage
   - Close the popup
   - Verify controller appears
   - Test play/pause, next/prev buttons
   - Drag controller to new position
   - Stop playback, verify controller disappears

2. **Paragraph Sync**:
   - Start playback on multi-paragraph article
   - Verify highlighted paragraph matches spoken content
   - Skip forward/backward, verify highlight updates

3. **Word-Level Sync** (ElevenLabs only):
   - Configure ElevenLabs API key
   - Start playback
   - Verify individual words highlight as spoken
   - Click on a word, verify playback jumps to that position

## Common Issues

### Controller not appearing

1. Check content script is loaded: `browser.runtime.sendMessage` in console
2. Verify CSP allows script execution
3. Check for JavaScript errors in page console

### Highlighting out of sync

1. Verify paragraph extraction matches TTS chunking
2. Check timestamp latency in console logs
3. Test with different content (shorter paragraphs)

### Word timing not working

1. Confirm ElevenLabs is selected provider
2. Check API response includes `alignment` data
3. Verify `with_timestamps: true` in API request

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Popup       │     │   Background    │     │ Content Script  │
│                 │     │                 │     │                 │
│  User clicks    │────>│ Generate audio  │     │ Inject floating │
│  "Play"         │     │ Extract timing  │────>│ controller      │
│                 │     │                 │     │                 │
│  Show progress  │<────│ Send updates    │<────│ User actions    │
│                 │     │                 │     │                 │
└─────────────────┘     │ Sync loop:      │     │ Highlight text  │
                        │ - currentTime   │────>│ - paragraph     │
                        │ - timeline      │     │ - word (if avail)│
                        └─────────────────┘     └─────────────────┘
```

## Next Steps

After implementing core functionality:

1. Add visual regression tests for floating controller states
2. Test on major sites (Wikipedia, Medium, news sites)
3. Performance profiling on long articles
4. Accessibility audit (screen reader testing)
