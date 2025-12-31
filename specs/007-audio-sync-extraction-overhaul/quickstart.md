# Quickstart: Audio-Text Sync & Content Extraction Overhaul

**Feature**: 007-audio-sync-extraction-overhaul
**Created**: 2025-12-31

## Overview

This feature overhauls VoxPage's audio-text synchronization and content extraction systems. After implementation, words will highlight within 100ms of being spoken, and navigation/boilerplate will be automatically filtered from extracted content.

## Prerequisites

- Firefox 119+ (for CSS Custom Highlight API; 109+ works with paragraph-only fallback)
- Node.js 18+ for development
- Groq API key (optional, enables word-level highlighting)

## Quick Test

### 1. Load Extension

```bash
# Install dependencies
npm install

# Start Firefox with extension loaded
npx web-ext run --start-url="https://eldenring.wiki.fextralife.com/Elden+Ring+Wiki"
```

### 2. Test Content Extraction

1. Navigate to any wiki page (Fextralife, Wikipedia, Fandom)
2. Open browser console: `F12` -> Console
3. Click play button in VoxPage popup
4. Verify console shows:
   ```
   VoxPage: Found wiki content via selector: #wiki-content-block
   VoxPage: Extracted N paragraphs (X words)
   ```
5. Verify NO navigation text ("Home", "Menu", "Sign In") in extracted content

### 3. Test Highlight Sync

1. Start playback on any article
2. Watch paragraph highlighting:
   - Active paragraph should have background highlight
   - Highlight should appear within 200ms of audio starting
3. If Groq API configured, watch word highlighting:
   - Current word should be highlighted within word
   - Highlight should track audio within 100ms

### 4. Test Tab Switch Recovery

1. Start playback
2. Switch to another tab for 10+ seconds
3. Switch back
4. Verify highlight resynchronizes within 500ms

## Key Files to Modify

| File | Purpose |
|------|---------|
| `content/content.js` | Content extraction algorithm |
| `background/playback-sync.js` | Sync state machine |
| `background/background.js` | Message coordination |
| `styles/content.css` | Highlight styling |

## Implementation Checklist

### Content Extraction (FR-012 to FR-018)

- [ ] Add wiki-specific selectors (Fextralife, Wikipedia, Fandom)
- [ ] Implement content scoring algorithm
- [ ] Add navigation/boilerplate filtering
- [ ] Add text-based DOM element matching

### Sync System (FR-001 to FR-007)

- [ ] Use audio.currentTime as time source
- [ ] Add timeupdate event listener (4Hz baseline)
- [ ] Add requestAnimationFrame for smooth updates
- [ ] Implement drift detection and auto-correction
- [ ] Add tab visibility change handling

### Word Timing (FR-008 to FR-011)

- [ ] Integrate Groq Whisper API
- [ ] Implement word alignment with fuzzy matching
- [ ] Add word timing cache
- [ ] Implement timing scale adjustment

### Highlighting (FR-019 to FR-023)

- [ ] Implement CSS Custom Highlight API
- [ ] Add paragraph-only fallback
- [ ] Implement dual-layer highlighting
- [ ] Add smooth scroll behavior

## Common Issues

### "Navigation text being read"

**Cause**: Content extraction not filtering boilerplate.

**Fix**: Check `extractArticle()` in `content/content.js`:
1. Wiki selectors should be checked first
2. Content score should penalize high link density
3. Navigation class patterns should be filtered

### "Highlight lags behind audio"

**Cause**: Sync not using audio.currentTime, or timeupdate not wired.

**Fix**: Verify in `background/background.js`:
1. `timeupdate` event listener is attached to audio element
2. `syncWordFromTime()` uses audio.currentTime * 1000
3. Word lookup handles both `startMs` and `startTimeMs` property names

### "Word highlight not appearing"

**Cause**: CSS Custom Highlight API not supported or not registered.

**Fix**: Check in `content/content.js`:
1. `CSS.highlights` exists (Firefox 119+)
2. Highlight registered: `CSS.highlights.set('voxpage-word', highlight)`
3. CSS rule exists: `::highlight(voxpage-word) { background: ... }`

### "Sync lost after tab switch"

**Cause**: requestAnimationFrame paused in background tab.

**Fix**: Ensure timeupdate event continues processing (not rAF-only), and resync on `visibilitychange` event.

## Running Tests

```bash
# Unit tests
npm test

# Specific sync tests
npm test -- --grep "PlaybackSyncState"

# Content extraction tests
npm test -- --grep "content-extraction"

# All tests with coverage
npm run test:coverage
```

## Performance Verification

### Measure Highlight Latency

Add to `content/content.js`:

```javascript
// In message handler for HIGHLIGHT_WORD
const latency = performance.now() - message.payload.timestamp;
console.log(`Word highlight latency: ${latency.toFixed(1)}ms`);
if (latency > 100) {
  console.warn('Word highlight exceeded 100ms target');
}
```

### Measure Extraction Time

Add to `content/content.js`:

```javascript
// In extractArticle()
const startTime = performance.now();
// ... extraction logic ...
const duration = performance.now() - startTime;
console.log(`Content extraction: ${duration.toFixed(1)}ms`);
if (duration > 500) {
  console.warn('Extraction exceeded 500ms target');
}
```

## Next Steps

After quickstart validation:
1. Run `/speckit.tasks` to generate implementation task list
2. Implement tasks in dependency order
3. Run test suite after each task group
4. Verify success criteria (SC-001 through SC-008)
