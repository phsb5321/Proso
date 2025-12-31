# Quickstart: Premium UI Overhaul

**Feature Branch**: `002-ui-overhaul`
**Created**: 2025-12-30

## Prerequisites

- Firefox 112+ (Manifest V3 support)
- Node.js 18+ (for development tools)
- web-ext CLI (`npm install -g web-ext`)

## Development Setup

```bash
# Clone and checkout feature branch
git checkout 002-ui-overhaul

# Install dev dependencies
npm install

# Run extension in Firefox with auto-reload
web-ext run --source-dir=. --browser=firefox-developer

# Run linter
npm run lint

# Run tests
npm test
```

## File Structure for This Feature

```
popup/
├── popup.html          # Update: Add ARIA attributes, visualizer canvas
├── popup.css           # Major: Refactor to CSS custom properties + theming
├── popup.js            # Update: Add visualizer, accessibility handlers
└── components/         # New: Modular UI components
    ├── visualizer.js   # Audio visualizer using Canvas
    ├── theme.js        # Theme detection and management
    └── accessibility.js # ARIA helpers and keyboard navigation

options/
├── options.html        # Update: Add ARIA attributes
├── options.css         # Major: Align with popup theming
└── options.js          # Minor: Accessibility improvements

background/
└── audio-visualizer.js # New: AnalyserNode integration

styles/
└── tokens.css          # New: Shared CSS custom properties
```

## Implementation Order

### Phase 1: Foundation (P1 Requirements)

1. **CSS Custom Properties & Theming**
   - Create `styles/tokens.css` with color, spacing, typography tokens
   - Refactor `popup.css` to use tokens
   - Add light/dark theme via `prefers-color-scheme`

2. **Accessibility Core**
   - Add ARIA labels to all interactive elements
   - Implement keyboard navigation for provider tabs
   - Add screen reader live region for status

3. **Audio Visualizer**
   - Add `AnalyserNode` to background audio pipeline
   - Create Canvas-based visualizer in popup
   - Connect via message passing

### Phase 2: Polish (P2 Requirements)

4. **Enhanced Theming**
   - Refine color palettes for both themes
   - Ensure WCAG 2.1 AA contrast compliance
   - Add high-contrast mode support

5. **Options Page Alignment**
   - Apply same theming system
   - Add ARIA attributes
   - Improve keyboard navigation

6. **Onboarding**
   - Add first-time user tooltip
   - Implement API key guidance flow

### Phase 3: Refinement (P3 Requirements)

7. **Micro-interactions**
   - Add button hover/active states
   - Implement loading spinners
   - Add `prefers-reduced-motion` support

8. **Testing & Verification**
   - Run accessibility audit
   - Test with screen readers
   - Performance profiling

## Key Implementation Details

### Adding CSS Custom Properties

```css
/* styles/tokens.css */
:root {
  /* Light theme colors */
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f5f5f7;
  --color-text-primary: #1d1d1f;
  --color-accent: #7c3aed;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg-primary: #1a1a2e;
    --color-bg-secondary: #16213e;
    --color-text-primary: #ffffff;
    --color-accent: #a855f7;
  }
}
```

### Adding Audio Visualizer

```javascript
// background/audio-visualizer.js
export class AudioVisualizer {
  constructor(audioContext) {
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 128;
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
  }

  getFrequencyData() {
    this.analyser.getByteFrequencyData(this.frequencyData);
    return Array.from(this.frequencyData);
  }
}
```

```javascript
// popup/components/visualizer.js
export class VisualizerCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.isRunning = false;
  }

  start() {
    this.isRunning = true;
    this.render();
  }

  stop() {
    this.isRunning = false;
  }

  async render() {
    if (!this.isRunning) return;

    const response = await browser.runtime.sendMessage({ action: 'getVisualizerData' });
    if (response?.data?.frequencyData) {
      this.drawBars(response.data.frequencyData);
    }

    requestAnimationFrame(() => this.render());
  }

  drawBars(data) {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    const barWidth = width / data.length;
    data.forEach((value, i) => {
      const barHeight = (value / 255) * height;
      const x = i * barWidth;
      const y = height - barHeight;

      this.ctx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-accent');
      this.ctx.fillRect(x, y, barWidth - 1, barHeight);
    });
  }
}
```

### Adding ARIA Support

```html
<!-- popup.html additions -->
<div id="srAnnouncer" aria-live="polite" class="sr-only"></div>

<button id="playBtn"
        class="play-btn"
        aria-pressed="false"
        aria-label="Play">
  <!-- icons -->
</button>

<div role="tablist" aria-label="TTS Provider" class="provider-tabs">
  <button role="tab"
          tabindex="0"
          aria-selected="true"
          data-provider="openai">
    OpenAI
  </button>
  <!-- more tabs -->
</div>
```

```javascript
// popup/components/accessibility.js
export function announce(message) {
  const announcer = document.getElementById('srAnnouncer');
  announcer.textContent = message;
}

export function setupTabList(container) {
  const tabs = container.querySelectorAll('[role="tab"]');

  container.addEventListener('keydown', (e) => {
    const current = document.activeElement;
    const index = Array.from(tabs).indexOf(current);

    if (e.key === 'ArrowRight') {
      const next = tabs[(index + 1) % tabs.length];
      next.focus();
      next.click();
    } else if (e.key === 'ArrowLeft') {
      const prev = tabs[(index - 1 + tabs.length) % tabs.length];
      prev.focus();
      prev.click();
    }
  });
}
```

## Testing

### Manual Accessibility Testing

1. **Keyboard Navigation**
   ```
   - Open popup
   - Press Tab repeatedly - should cycle through all controls
   - On provider tabs, use Arrow keys to switch
   - Verify focus ring is visible on all elements
   ```

2. **Screen Reader Testing**
   ```
   - Enable NVDA (Windows) or VoiceOver (macOS)
   - Navigate popup with screen reader
   - Verify all controls are announced properly
   - Verify state changes are announced
   ```

3. **Theme Testing**
   ```
   - Change system to light mode - verify popup uses light theme
   - Change system to dark mode - verify popup uses dark theme
   - Test contrast with browser DevTools
   ```

### Automated Testing

```bash
# Run accessibility audit
npx axe-cli popup/popup.html

# Run contrast checker
npx @alxshelepenok/color-contrast-checker popup.css
```

## Troubleshooting

### Visualizer not showing
- Check if `AnalyserNode` is connected in audio pipeline
- Verify message passing is working
- Check Canvas context initialization

### Theme not updating
- Verify `prefers-color-scheme` media query syntax
- Check if CSS custom properties are defined in `:root`
- Test with Firefox DevTools Responsive Design Mode

### Screen reader not announcing
- Verify ARIA live region exists in DOM
- Check that text is being set (not innerHTML)
- Test `aria-live="polite"` vs `aria-live="assertive"`

## References

- [MDN: Web Audio API Visualizations](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API)
- [MDN: ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions)
- [MDN: prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme)
- [Chrome: Extension Accessibility](https://developer.chrome.com/docs/extensions/how-to/ui/a11y)
