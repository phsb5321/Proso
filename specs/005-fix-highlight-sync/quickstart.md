# Quickstart: Fix Highlight Synchronization

**Feature**: 005-fix-highlight-sync
**Date**: 2025-12-31

## Prerequisites

- Firefox 112+ (Manifest V3 baseline)
- Firefox 119+ for CSS Custom Highlight API (word-level highlighting)
- Node.js 18+ for running tests
- web-ext CLI for extension development

## Development Setup

```bash
# Clone and navigate to project
cd /home/notroot/Documents/Code/Firefox/VoxPage

# Ensure on correct branch
git checkout 005-fix-highlight-sync

# Install dependencies
npm install

# Run tests to verify baseline
npm test
```

## Key Files to Modify

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `background/playback-sync.js` | Sync state management | Add rebuildTimelineWithDuration(), fix start() initial callback |
| `content/content.js` | DOM highlighting | Separate paragraph/word clearing, add smart scroll |
| `background/background.js` | Integration | Connect audio.loadedmetadata to timeline rebuild |
| `styles/content.css` | Visual styling | Ensure dual highlight styles are distinct |
| `tests/unit/playback-sync.test.js` | Unit tests | Add tests for new behaviors |

## Implementation Order

### Step 1: Fix Dual Highlighting (US2)

1. In `content/content.js`, create `clearParagraphHighlights()`:
   ```javascript
   function clearParagraphHighlights() {
     highlightElements.forEach(el => {
       el.classList.remove('voxpage-highlight');
     });
     highlightElements = [];
     document.querySelectorAll('.voxpage-highlight').forEach(el => {
       el.classList.remove('voxpage-highlight');
     });
   }
   ```

2. Modify `highlightParagraph()` to use `clearParagraphHighlights()` instead of `clearHighlights()`

3. Keep `clearHighlights()` for full clear on stop

### Step 2: Fix Initial Paragraph Highlight (US1)

1. In `PlaybackSyncState.start()`, add initial callback:
   ```javascript
   start(audioElement = null) {
     this._audioElement = audioElement;
     this._isRunning = true;

     // Force initial paragraph highlight
     if (this._onParagraphChange && this.paragraphTimeline.length > 0) {
       this._onParagraphChange(this._currentParagraphIndex, Date.now());
     }

     this._syncLoop();
   }
   ```

### Step 3: Fix Skipped Paragraphs (US1)

1. Add `rebuildTimelineWithDuration()` method to `PlaybackSyncState`

2. In `background/background.js`, add listener:
   ```javascript
   audio.addEventListener('loadedmetadata', () => {
     syncState.rebuildTimelineWithDuration(audio.duration * 1000);
   });
   ```

### Step 4: Add Smart Scroll (Clarification)

1. In `content/content.js`, add scroll tracking:
   ```javascript
   let lastManualScrollTime = 0;
   let isProgrammaticScrolling = false;
   const SCROLL_COOLDOWN_MS = 4000;

   document.addEventListener('scroll', () => {
     if (!isProgrammaticScrolling) {
       lastManualScrollTime = Date.now();
     }
   }, { passive: true });
   ```

2. Modify `highlightParagraph()` scroll logic

### Step 5: Update Tests

1. Add test for initial paragraph callback
2. Add test for timeline rebuild
3. Add test for dual highlighting (paragraph + word visible)
4. Add test for smart scroll cooldown

## Testing

```bash
# Run unit tests
npm test

# Run with coverage
npm run test:coverage

# Lint extension
npm run lint

# Test in Firefox
web-ext run --firefox-profile=dev-profile
```

## Manual Verification Checklist

- [ ] Start playback on multi-paragraph article
- [ ] Verify first paragraph highlighted immediately
- [ ] Verify all paragraphs highlighted in sequence (no skips)
- [ ] With ElevenLabs: verify word AND paragraph highlighted simultaneously
- [ ] Manually scroll during playback; verify auto-scroll pauses for ~4s
- [ ] Seek to different position; verify highlight updates
- [ ] Stop playback; verify all highlights cleared

## Common Issues

### CSS Highlight API not working

Firefox 119+ required. Check:
```javascript
console.log('CSS.highlights supported:', typeof CSS !== 'undefined' && CSS.highlights !== undefined);
```

### Highlights flashing

If highlights flicker, ensure `highlightParagraph()` is NOT calling `clearWordHighlight()`.

### Paragraphs still skipping

Check audio.loadedmetadata event is firing and `rebuildTimelineWithDuration()` is called.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Background Script                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────────────────┐   │
│  │  Audio Element  │───▶│   PlaybackSyncState         │   │
│  │  timeupdate     │    │   - syncToParagraph()       │   │
│  │  loadedmetadata │    │   - syncToWord()            │   │
│  └─────────────────┘    │   - rebuildTimeline()       │   │
│                          └──────────┬──────────────────┘   │
│                                     │                       │
│                          onParagraphChange / onWordChange   │
│                                     │                       │
│                                     ▼                       │
│                          browser.tabs.sendMessage()         │
└─────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────┐
│                      Content Script                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐  ┌─────────────────────────────┐  │
│  │  highlightParagraph │  │  highlightWord              │  │
│  │  - CSS class        │  │  - CSS Highlight API        │  │
│  │  - smart scroll     │  │  - additive (not replace)   │  │
│  └─────────────────────┘  └─────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────┐  ┌─────────────────────────────┐  │
│  │  ScrollState        │  │  HighlightState             │  │
│  │  - lastManualScroll │  │  - paragraphIndex           │  │
│  │  - cooldown 4s      │  │  - wordIndex                │  │
│  └─────────────────────┘  └─────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```
