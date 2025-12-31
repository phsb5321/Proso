# Research: Fix Highlight Synchronization

**Feature**: 005-fix-highlight-sync
**Date**: 2025-12-31

## Bug Analysis

After analyzing the existing codebase, three root causes have been identified:

### Bug 1: highlightParagraph() calls clearHighlights() which clears word highlights

**Location**: `content/content.js:375-400`

**Problem**: The `highlightParagraph()` function calls `clearHighlights()` at the start, which in turn calls `clearWordHighlight()`. This means every time the paragraph highlight is updated, the word highlight is also cleared.

**Current Code Flow**:
```
highlightParagraph(index)
  → clearHighlights()
    → clearWordHighlight()  // ❌ This removes word highlight
  → add .voxpage-highlight class
```

**Expected Behavior**: Paragraph and word highlights should be independent. Word highlight should only be cleared when:
- Playback stops
- User explicitly requests clear
- Moving to a different paragraph (at which point new word timeline is set)

**Decision**: Separate paragraph clearing from word clearing
**Rationale**: The CSS Custom Highlight API (word) and CSS class (paragraph) are independent systems; they should not interfere with each other
**Alternatives considered**:
- Keep single clearHighlights() but re-apply word highlight after paragraph update → Rejected (causes flicker)
- Use CSS Custom Highlight API for both paragraph and word → Rejected (more complex, less browser support)

---

### Bug 2: Missing initial paragraph highlight trigger

**Location**: `background/background.js` + `background/playback-sync.js`

**Problem**: The sync loop in `PlaybackSyncState` only fires `onParagraphChange` when the paragraph index **changes**. At playback start, if `_currentParagraphIndex` is already 0 and the first paragraph timing starts at 0, no callback is triggered because `newIndex !== this._currentParagraphIndex` is false (both are 0).

**Current Code** (`playback-sync.js:216-241`):
```javascript
syncToParagraph() {
  // ... find newIndex ...
  if (newIndex !== this._currentParagraphIndex) {  // ❌ false at start when both are 0
    this._currentParagraphIndex = newIndex;
    if (this._onParagraphChange) {
      this._onParagraphChange(newIndex, this._lastSyncTimestamp);
    }
  }
}
```

**Decision**: Force initial paragraph callback on start()
**Rationale**: The first paragraph should always be highlighted when playback begins, regardless of index comparison
**Alternatives considered**:
- Initialize `_currentParagraphIndex` to -1 → Rejected (breaks other logic that assumes valid index)
- Add a flag for "first sync" → Accepted as part of solution

---

### Bug 3: Sections skipped due to timing calculation inaccuracy

**Location**: `background/playback-sync.js:121-169`

**Problem**: The `buildParagraphTimeline()` method uses estimated total duration and word-count proportions to calculate paragraph timings. However, the actual audio duration often differs from estimates, especially after the audio loads. The timeline is never recalculated with the actual audio duration.

Additionally, in `syncToParagraph()`, if the current time falls exactly at a paragraph boundary or in a gap due to rounding errors, paragraphs can be skipped.

**Current Issues**:
1. Timeline built with estimated duration, never updated with actual audio.duration
2. Timing gaps can occur due to floating-point math
3. Binary search could be more efficient for large documents

**Decision**:
1. Add `rebuildTimeline()` method called when audio.loadedmetadata fires
2. Ensure timeline has no gaps (each paragraph ends exactly when next begins)
3. Add fallback logic: if time doesn't match any paragraph, use the closest one

**Rationale**: Accurate timing requires actual audio duration; gaps cause skips
**Alternatives considered**:
- Use speech marks from TTS provider for exact paragraph timing → Rejected (not all providers support this)
- Use heuristic adjustment factor → Rejected (too fragile)

---

### Bug 4: No smart scroll detection

**Location**: `content/content.js:393-397`

**Problem**: Auto-scroll always triggers on paragraph change, even when user has manually scrolled away to read ahead or review earlier content. This is disruptive.

**Current Code**:
```javascript
element.scrollIntoView({
  behavior: 'smooth',
  block: 'center'
});  // ❌ Always scrolls, ignoring user intent
```

**Decision**: Track last manual scroll time; skip auto-scroll if within 3-5 seconds
**Rationale**: Respects user intent while still providing auto-scroll when user is passively following
**Alternatives considered**:
- Add toggle setting for auto-scroll → Could add later, but smart detection is better UX
- Detect if element is already in viewport → Partial solution (doesn't detect intentional scroll away)

---

## Technical Solutions

### Solution 1: Separate highlight clearing

```javascript
// New: clearParagraphHighlights() - only clears paragraph class
function clearParagraphHighlights() {
  highlightElements.forEach(el => {
    el.classList.remove('voxpage-highlight');
  });
  highlightElements = [];
  document.querySelectorAll('.voxpage-highlight').forEach(el => {
    el.classList.remove('voxpage-highlight');
  });
}

// Modified: highlightParagraph() uses paragraph-only clearing
function highlightParagraph(index, timestamp) {
  clearParagraphHighlights();  // ✅ Only clears paragraph, not word
  // ... rest of function
}

// Existing: clearHighlights() for full clear (on stop/completion)
function clearHighlights() {
  clearParagraphHighlights();
  clearWordHighlight();
}
```

### Solution 2: Force initial highlight

```javascript
// In PlaybackSyncState.start()
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

### Solution 3: Accurate timeline with recalculation

```javascript
// Add method to rebuild timeline with actual duration
rebuildTimelineWithDuration(actualDurationMs) {
  if (this.paragraphTimeline.length === 0) return;

  const ratio = actualDurationMs / this._totalDurationMs;
  this._totalDurationMs = actualDurationMs;

  for (const timing of this.paragraphTimeline) {
    timing.startTimeMs *= ratio;
    timing.endTimeMs *= ratio;
    timing.durationMs *= ratio;
  }

  // Ensure no gaps: each end = next start
  for (let i = 0; i < this.paragraphTimeline.length - 1; i++) {
    this.paragraphTimeline[i].endTimeMs = this.paragraphTimeline[i + 1].startTimeMs;
  }
}

// In background.js, on audio loadedmetadata:
audio.addEventListener('loadedmetadata', () => {
  syncState.rebuildTimelineWithDuration(audio.duration * 1000);
});
```

### Solution 4: Smart scroll detection

```javascript
// Track manual scroll
let lastManualScrollTime = 0;
const SCROLL_COOLDOWN_MS = 4000; // 4 seconds

document.addEventListener('scroll', () => {
  // Detect if this is a user-initiated scroll (not programmatic)
  // Simple heuristic: if scrollIntoView is not currently running
  if (!isProgrammaticScrolling) {
    lastManualScrollTime = Date.now();
  }
}, { passive: true });

// In highlightParagraph:
function highlightParagraph(index, timestamp) {
  // ... existing code ...

  // Smart scroll: only auto-scroll if user hasn't manually scrolled recently
  const timeSinceManualScroll = Date.now() - lastManualScrollTime;
  if (timeSinceManualScroll > SCROLL_COOLDOWN_MS) {
    isProgrammaticScrolling = true;
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
    // Reset flag after scroll completes
    setTimeout(() => { isProgrammaticScrolling = false; }, 500);
  }
}
```

---

## CSS Highlight API Best Practices

Based on MDN and community research:

1. **Use CSS.highlights.set() with named highlights**
   - Allows multiple concurrent highlights
   - `CSS.highlights.set('voxpage-word', new Highlight(range))`

2. **Feature detection required**
   - Not all browsers support it (Firefox 119+)
   - `if (!CSS.highlights) { /* fallback */ }`

3. **Performance considerations**
   - 5x faster than DOM-based highlighting
   - Debounce rapid updates (already using requestAnimationFrame)

4. **Styling limitations**
   - Firefox doesn't support text-decoration or text-shadow in ::highlight()
   - Stick to background-color for compatibility

---

## Dual Highlighting Visual Design

For FR-010 (visual distinction between paragraph and word highlights):

```css
/* Paragraph highlight: subtle background */
.voxpage-highlight {
  background-color: rgba(var(--voxpage-accent-rgb), 0.15);
  border-radius: 2px;
}

/* Word highlight: stronger emphasis */
::highlight(voxpage-word) {
  background-color: rgba(var(--voxpage-accent-rgb), 0.4);
}
```

The word highlight (40% opacity) is visually distinct from paragraph (15% opacity) while both remain visible simultaneously.

---

## Summary of Decisions

| Issue | Decision | Impact |
|-------|----------|--------|
| Dual highlight broken | Separate clearParagraphHighlights() from clearWordHighlight() | Enables simultaneous paragraph + word highlighting |
| First paragraph not highlighted | Force initial callback in start() | First paragraph always visible at playback start |
| Paragraphs skipped | Rebuild timeline on audio load; ensure no timing gaps | Accurate sync throughout playback |
| Scroll interrupts user | Track manual scroll; 4s cooldown before auto-scroll | Respects user intent |

All solutions maintain backward compatibility and follow existing patterns in the codebase.
