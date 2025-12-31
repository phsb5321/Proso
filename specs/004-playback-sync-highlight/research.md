# Research: Playback Sync & Highlight

**Feature**: 004-playback-sync-highlight
**Date**: 2025-12-31
**Status**: Complete

## Research Questions

### RQ1: How do TTS providers expose word-level timing data?

**Finding**: Provider capabilities vary significantly:

| Provider | Word Timing Support | API Method |
|----------|---------------------|------------|
| ElevenLabs | ✅ Yes | `with_timestamps` parameter returns character-level alignment |
| OpenAI TTS | ❌ No | No timing data in standard API |
| Browser SpeechSynthesis | ⚠️ Partial | `boundary` event fires on word boundaries, but timing is unreliable |
| Cartesia | ❌ No | No timing data exposed |
| Groq | ❌ No | Whisper-based, no TTS timing |

**Decision**: Implement word-level highlighting only for ElevenLabs; fall back to paragraph-only for other providers.

**References**:
- [ElevenLabs Timestamps API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps)

### RQ2: What synchronization approach provides <200ms latency?

**Finding**: Three viable approaches:

1. **Pre-computed timeline** (RECOMMENDED)
   - Build word/paragraph timestamps before playback
   - Use `requestAnimationFrame` + `audio.currentTime` for sync
   - Latency: ~16ms (one frame)
   - Complexity: Low

2. **Event-driven with WebAudio**
   - Use AudioContext for precise timing
   - Schedule highlights as audio events
   - Latency: <10ms
   - Complexity: High (requires AudioWorklet)

3. **Polling-based**
   - Poll `audio.currentTime` on interval
   - Update highlights when crossing boundaries
   - Latency: poll interval (typically 50-100ms)
   - Complexity: Low

**Decision**: Use pre-computed timeline with requestAnimationFrame. Provides sub-frame accuracy without AudioWorklet complexity.

### RQ3: How should the floating controller be injected?

**Finding**: Content script injection options:

1. **Shadow DOM** (RECOMMENDED)
   - Isolates styles completely from host page
   - Prevents CSS conflicts
   - Supported in Firefox 63+

2. **iframe injection**
   - Complete isolation
   - Complex messaging
   - May be blocked by CSP

3. **Direct DOM injection**
   - Simplest approach
   - Style conflicts likely
   - Z-index wars with host page

**Decision**: Use Shadow DOM with `:host` styling. Inject container div, attach closed shadow root, render controller inside.

### RQ4: How to handle dynamic DOM changes?

**Finding**: MutationObserver for re-sync:

```javascript
// Watch for content changes
const observer = new MutationObserver((mutations) => {
  if (shouldResync(mutations)) {
    rebuildTextSegmentMap();
  }
});
observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true
});
```

**Decision**: Use MutationObserver to detect significant DOM changes. Rebuild text-segment mapping when article content changes. Debounce to avoid excessive recalculation.

### RQ5: CSS Highlight API vs class-based highlighting?

**Finding**: Two approaches for word highlighting:

1. **CSS Custom Highlight API** (RECOMMENDED for modern browsers)
   - Native browser support for range-based highlights
   - No DOM modification required
   - Performance: O(1) highlight updates
   - Firefox support: 119+

2. **Class-based with span wrapping**
   - Wrap each word in `<span>` elements
   - Apply class to highlight
   - Performance: Requires DOM modification
   - Universal browser support

**Decision**: Use CSS Highlight API as primary (Firefox 119+), fall back to paragraph-only highlighting for older Firefox versions. Word-span wrapping rejected due to DOM modification overhead.

**References**:
- [CSS Custom Highlight API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API)

## Technical Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Word timing source | ElevenLabs only | Only provider with timestamp API |
| Sync mechanism | Pre-computed timeline + rAF | Sub-frame accuracy, low complexity |
| Controller injection | Shadow DOM | Style isolation, CSP-safe |
| DOM change handling | MutationObserver | Standard pattern, debounced |
| Word highlighting | CSS Highlight API | Native performance, no DOM mutation |
| Fallback strategy | Paragraph-only | Graceful degradation for unsupported providers |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ElevenLabs API changes | Low | High | Version-lock API, add adapter layer |
| CSS Highlight API browser compat | Medium | Medium | Feature detection, paragraph fallback |
| High-latency on slow devices | Medium | Medium | Increase sync threshold, use less frequent updates |
| Shadow DOM CSP issues | Low | Medium | Test on major sites, document known issues |

## Open Questions for Implementation

1. Should the floating controller position be per-site or global?
   - **Decision**: Global position, stored in browser.storage.local

2. Should word clicking jump to exact position or sentence start?
   - **Decision**: Exact word position (better UX for language learners)

3. How to handle overlapping highlights (paragraph + word)?
   - **Decision**: Layer with different z-index; word highlight on top of paragraph background
