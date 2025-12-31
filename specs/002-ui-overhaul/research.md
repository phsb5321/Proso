# Research: Premium UI Overhaul

**Feature Branch**: `002-ui-overhaul`
**Created**: 2025-12-30

## Research Tasks

### 1. Audio Visualization in Browser Extensions

**Question**: How to implement real-time audio visualization synced with TTS playback in a browser extension popup?

**Decision**: Use Web Audio API's AnalyserNode with Canvas-based visualization

**Rationale**:
- The Web Audio API provides `AnalyserNode` which can capture real-time frequency and time-domain data using Fast Fourier Transform (FFT)
- `getByteFrequencyData()` and `getByteTimeDomainData()` methods allow capturing audio data for visualization
- Canvas provides performant rendering with `requestAnimationFrame` for smooth 60fps animations
- Since audio playback occurs in the background script, need to communicate audio analysis data to popup via message passing

**Technical Approach**:
1. Create `AnalyserNode` in background script connected to audio output
2. Set `fftSize` to 128 (64 frequency bins) - sufficient for a simple bar or waveform visualization
3. Use `requestAnimationFrame` loop in popup to request frequency data
4. Background sends frequency array via `browser.runtime.sendMessage()`
5. Popup renders bars/waveform using Canvas 2D context

**Alternatives Considered**:
- **CSS animations synced to timing**: Rejected - not synced to actual audio, feels fake
- **Third-party library (wavesurfer.js)**: Rejected - adds 50KB+ bundle size, overkill for simple visualization
- **SVG-based visualization**: Rejected - less performant than Canvas for real-time updates

**Sources**:
- [MDN: Visualizations with Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API)
- [MDN: AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode)

---

### 2. Theme System (Light/Dark Mode)

**Question**: How to implement system-aware light/dark theming in a Firefox extension?

**Decision**: Use CSS custom properties with `prefers-color-scheme` media query

**Rationale**:
- `prefers-color-scheme` is fully supported in Firefox 67+ and works in extension contexts
- CSS custom properties (variables) allow defining color tokens once and swapping them via media query
- No JavaScript required for basic theme switching - pure CSS solution
- Automatically responds to system theme changes without requiring popup restart

**Technical Approach**:
```css
:root {
  /* Light theme (default) */
  --bg-primary: #ffffff;
  --text-primary: #1a1a2e;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #1a1a2e;
    --text-primary: #ffffff;
  }
}
```

**Alternatives Considered**:
- **JavaScript theme detection with class toggle**: Rejected - adds complexity, CSS-only solution is simpler
- **Separate CSS files for each theme**: Rejected - code duplication, harder to maintain
- **User preference stored in extension storage**: Future enhancement - would override system preference

**Sources**:
- [MDN: prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme)

---

### 3. Reduced Motion Support

**Question**: How to respect user's motion preferences for animations?

**Decision**: Use `prefers-reduced-motion` media query to disable/reduce animations

**Rationale**:
- Essential for accessibility - vestibular disorders, motion sickness, cognitive considerations
- Supported in Firefox 63+ via `prefers-reduced-motion` CSS media query
- Can test locally via Firefox `about:config` setting `ui.prefersReducedMotion`

**Technical Approach**:
```css
/* Default: animations enabled */
.animated-element {
  transition: transform 0.2s ease;
}

@media (prefers-reduced-motion: reduce) {
  .animated-element {
    transition: none;
  }

  /* Keep essential feedback, just instant */
  .button:active {
    transform: scale(0.98);
    transition: none;
  }
}
```

**Sources**:
- [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [web.dev: prefers-reduced-motion](https://web.dev/articles/prefers-reduced-motion)

---

### 4. Accessibility: ARIA Live Regions for State Changes

**Question**: How to announce playback state changes to screen reader users?

**Decision**: Use `aria-live="polite"` for status updates, `aria-pressed` for toggle buttons

**Rationale**:
- ARIA live regions programmatically announce dynamic content changes
- `aria-live="polite"` waits for screen reader to finish current announcement
- `aria-pressed` on play/pause button automatically announces toggle state
- Button state announcement is built-in - no live region needed for toggle itself

**Technical Approach**:
```html
<!-- Status announcements -->
<div id="statusAnnouncer" aria-live="polite" class="sr-only"></div>

<!-- Toggle button with state -->
<button id="playBtn" aria-pressed="false" aria-label="Play">
  <!-- icons -->
</button>
```

**JavaScript**:
```javascript
function announceStatus(message) {
  document.getElementById('statusAnnouncer').textContent = message;
}

function updatePlayState(isPlaying) {
  playBtn.setAttribute('aria-pressed', isPlaying);
  playBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
}
```

**Sources**:
- [MDN: ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions)
- [Sara Soueidan: Accessible notifications with ARIA Live Regions](https://www.sarasoueidan.com/blog/accessible-notifications-with-aria-live-regions-part-1/)

---

### 5. Keyboard Navigation Patterns

**Question**: How to implement proper keyboard navigation in extension popup?

**Decision**: Follow WAI-ARIA patterns with roving tabindex for grouped controls

**Rationale**:
- Standard HTML controls (buttons, selects, inputs) are keyboard accessible by default
- Provider tabs should use roving tabindex (arrow keys within group, Tab to next component)
- Focus indicators must be visible - use outline with sufficient contrast

**Technical Approach**:
- Tab order: Settings → Play → Nav controls → Speed → Provider tabs → Voice → Mode
- Provider tabs: role="tablist", role="tab", arrow key navigation
- Focus ring: 2px outline with accent color, visible in both light/dark themes

**Patterns**:
```html
<div role="tablist" aria-label="TTS Provider">
  <button role="tab" tabindex="0" aria-selected="true">OpenAI</button>
  <button role="tab" tabindex="-1" aria-selected="false">ElevenLabs</button>
</div>
```

**Sources**:
- [Chrome: Support accessibility in extensions](https://developer.chrome.com/docs/extensions/how-to/ui/a11y)
- [FreeCodeCamp: How to Design Accessible Browser Extensions](https://www.freecodecamp.org/news/how-to-design-accessible-browser-extensions/)

---

### 6. Design System Alignment

**Question**: Should we use Firefox's Acorn/Photon design system directly?

**Decision**: Follow Acorn/Photon design principles but implement custom CSS (no external dependencies)

**Rationale**:
- Acorn is Firefox's internal design system - components built for Firefox UI, not extensions
- No npm package available for direct use in extensions
- Can adopt design tokens (colors, spacing, typography) without adding dependencies
- Keep bundle size minimal (extension popup should be < 50KB total)

**Technical Approach**:
- Use Photon color palette as inspiration for light/dark themes
- Follow 4px/8px spacing grid
- Use system font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', ...`)
- Border radius: 4px small, 8px medium, 12px large

**Sources**:
- [Firefox Acorn Design System](https://acorn.firefox.com/latest)
- [Firefox Photon Design System (legacy)](https://firefoxux.github.io/photon/)

---

### 7. Performance: Popup Load Time

**Question**: How to ensure popup loads and becomes interactive within 200ms?

**Decision**: Minimize DOM complexity, defer non-critical initialization, avoid blocking operations

**Rationale**:
- Popup must be fast - users expect instant response when clicking extension icon
- Current popup is ~150 lines of HTML, ~500 lines CSS, ~500 lines JS - already lightweight
- Storage reads are async and should not block initial render

**Technical Approach**:
1. Cache DOM elements on first call, not on every access
2. Render initial UI state immediately with defaults
3. Load saved settings asynchronously and update UI after
4. Initialize audio visualization only when playback starts
5. Use `DOMContentLoaded` event, not `load`

**Metrics**:
- Target: DOMContentLoaded to interactive < 100ms
- Target: Settings loaded and UI updated < 200ms total

---

### 8. Color Contrast Requirements

**Question**: What specific contrast ratios are needed for WCAG 2.1 AA compliance?

**Decision**: Minimum 4.5:1 for normal text, 3:1 for large text and UI components

**Rationale**:
- WCAG 2.1 AA is the industry standard for accessibility
- Current dark theme uses low-contrast gray text that may not meet requirements
- All interactive elements need sufficient contrast in both themes

**Required Changes**:
- Audit current color palette with contrast checker
- Ensure `--text-secondary` and `--text-muted` colors meet 4.5:1 against background
- Focus indicators must have 3:1 contrast against adjacent colors
- Light theme needs careful design to maintain premium feel with sufficient contrast

---

## Summary of Technical Decisions

| Area | Decision | Dependency Added |
|------|----------|-----------------|
| Audio Visualization | Web Audio API + Canvas | None |
| Theming | CSS custom properties + media queries | None |
| Accessibility | ARIA attributes + semantic HTML | None |
| Design System | Custom CSS inspired by Photon | None |
| Performance | Async initialization, minimal DOM | None |

**Total New Dependencies**: 0

This approach keeps the extension lightweight, maintainable, and follows web platform standards without adding external libraries.
