# Floating Controller Contract

**Feature**: 004-playback-sync-highlight
**Date**: 2025-12-31

## Overview

Defines the interface and behavior contract for the floating playback controller injected into web pages.

## Component Interface

### FloatingController

```typescript
interface FloatingController {
  /**
   * Initialize and inject the controller into the page.
   * @param position - Initial position (uses stored preference if null)
   */
  show(position?: { x: number; y: number }): void;

  /**
   * Remove the controller from the page.
   */
  hide(): void;

  /**
   * Update the playback state display.
   */
  updateState(state: {
    status: 'playing' | 'paused' | 'loading' | 'stopped';
    progress: number;
    timeRemaining: string;
  }): void;

  /**
   * Check if controller is currently visible.
   */
  isVisible(): boolean;

  /**
   * Get current position.
   */
  getPosition(): { x: number; y: number };

  /**
   * Set position (for restoring from storage).
   */
  setPosition(position: { x: number; y: number }): void;

  /**
   * Register callback for user actions.
   */
  onAction(callback: (action: ControllerAction) => void): void;

  /**
   * Register callback for position changes.
   */
  onPositionChange(callback: (position: { x: number; y: number }) => void): void;
}

type ControllerAction = 'play' | 'pause' | 'stop' | 'prev' | 'next' | 'close';
```

## DOM Structure

The controller uses Shadow DOM for style isolation:

```html
<!-- Host element injected into page -->
<div id="voxpage-floating-controller">
  #shadow-root (closed)
    <style>/* scoped styles */</style>
    <div class="controller">
      <div class="drag-handle"></div>
      <div class="controls">
        <button class="btn-prev" aria-label="Previous paragraph">⏮</button>
        <button class="btn-play-pause" aria-label="Play/Pause">▶/⏸</button>
        <button class="btn-next" aria-label="Next paragraph">⏭</button>
        <button class="btn-stop" aria-label="Stop">⏹</button>
      </div>
      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill"></div>
        </div>
        <span class="time-remaining">0:00</span>
      </div>
      <button class="btn-close" aria-label="Close controller">✕</button>
    </div>
</div>
```

## Styling Contract

### CSS Custom Properties

The controller exposes these CSS custom properties for theming (set on `:host`):

```css
:host {
  /* Colors - default to VoxPage teal theme */
  --voxpage-bg: #1a1a2e;
  --voxpage-bg-hover: #252540;
  --voxpage-accent: #0D9488;
  --voxpage-accent-hover: #14B8A6;
  --voxpage-text: #ffffff;
  --voxpage-text-muted: #a0a0a0;

  /* Dimensions */
  --voxpage-controller-width: 280px;
  --voxpage-controller-height: 64px;
  --voxpage-border-radius: 12px;
  --voxpage-button-size: 36px;

  /* Shadows */
  --voxpage-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);

  /* Z-index - must be higher than most page content */
  --voxpage-z-index: 2147483647;
}
```

### Positioning

```css
.controller {
  position: fixed;
  z-index: var(--voxpage-z-index);
  /* Position set via JavaScript */
}
```

### Minimum Distance from Edges

The controller should maintain minimum distance from viewport edges:

```typescript
const EDGE_MARGIN = 16; // pixels
const MIN_X = EDGE_MARGIN;
const MAX_X = window.innerWidth - CONTROLLER_WIDTH - EDGE_MARGIN;
const MIN_Y = EDGE_MARGIN;
const MAX_Y = window.innerHeight - CONTROLLER_HEIGHT - EDGE_MARGIN;
```

## Behavior Contract

### Dragging

1. Dragging initiates on `mousedown`/`touchstart` on `.drag-handle`
2. Position updates on `mousemove`/`touchmove`
3. Dragging ends on `mouseup`/`touchend`
4. Position is constrained to viewport bounds
5. Final position is persisted to `browser.storage.local`

### Button Actions

| Button | Click Action | Message Sent |
|--------|--------------|--------------|
| Play/Pause | Toggle playback | `controllerAction: 'play'` or `'pause'` |
| Previous | Go to previous paragraph | `controllerAction: 'prev'` |
| Next | Go to next paragraph | `controllerAction: 'next'` |
| Stop | Stop playback | `controllerAction: 'stop'` |
| Close | Hide controller | `controllerAction: 'close'` |

### Progress Bar

1. Clicking on progress bar seeks to that position
2. Sends `seekToPosition` message with `progressPercent`
3. Visual feedback on hover (cursor: pointer)
4. Fill animates smoothly during playback

### State Updates

The controller must update these elements when `updateState()` is called:

| State Property | UI Update |
|----------------|-----------|
| `status: 'playing'` | Show pause icon, animate progress |
| `status: 'paused'` | Show play icon, pause animation |
| `status: 'loading'` | Show spinner/loading state |
| `status: 'stopped'` | Show play icon, reset progress |
| `progress` | Update progress bar fill width |
| `timeRemaining` | Update time display text |

## Accessibility Requirements

### ARIA Attributes

```html
<div class="controller" role="toolbar" aria-label="VoxPage playback controls">
  <button aria-label="Previous paragraph" aria-keyshortcuts="Alt+ArrowLeft">
  <button aria-label="Play" aria-pressed="false" aria-keyshortcuts="Space">
  <button aria-label="Next paragraph" aria-keyshortcuts="Alt+ArrowRight">
  <button aria-label="Stop playback" aria-keyshortcuts="Escape">
  <div role="slider" aria-label="Playback progress" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
  <button aria-label="Close controller">
</div>
```

### Keyboard Navigation

| Key | Action |
|-----|--------|
| Tab | Move focus between controls |
| Space/Enter | Activate focused button |
| Arrow Left/Right | Adjust progress (when progress bar focused) |
| Escape | Close controller |

### Focus Management

1. Controller should be focusable (`tabindex="0"` on container)
2. First interactive element receives focus when shown
3. Focus trap: Tab cycles within controller while visible
4. Focus returns to previous element when closed

## Performance Requirements

1. **Render Performance**: Controller updates must not cause layout thrashing
2. **Animation**: Use CSS transforms for drag (GPU accelerated)
3. **Event Handling**: Debounce position change persistence (300ms)
4. **Memory**: Single instance only; cleanup on hide

## Error States

### Content Script Not Ready

If controller cannot be injected:
- Log warning to console
- Retry once after 500ms
- Notify background script of failure

### Invalid State Update

If `updateState()` receives invalid data:
- Log warning
- Ignore invalid update
- Maintain previous valid state
