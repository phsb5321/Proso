# Footer Design Guide

**Last Updated**: 2026-01-20
**Feature Branch**: `047-architecture-ui-polish`

This document specifies the VoxPage sticky footer component design, including visual hierarchy, accessibility requirements, and responsive behavior.

---

## Overview

The sticky footer is a persistent playback control bar that appears at the bottom of web pages during TTS playback. It provides:

- Play/pause controls
- Navigation (previous/next paragraph)
- Progress visualization
- Speed adjustment
- Minimize/close actions

---

## Visual Hierarchy

### Expanded State (Default)

```
┌─────────────────────────────────────────────────────────────────┐
│   ═══════════ (drag handle)                                     │
│                                                                 │
│  [◀]  [▶▶]  ●──────────────○  0:45 / 2:30  [1.0x▾]  [−] [×]   │
│                                                                 │
│       ↑       ↑              ↑                ↑      ↑   ↑      │
│    prev/next  play    progress bar         speed  min close    │
│    controls   pause                                             │
└─────────────────────────────────────────────────────────────────┘
```

**Dimensions**:
- Height: 64px (`--footer-height`)
- Max width: 600px (`--footer-max-width`)
- Border radius: 12px 12px 0 0 (`--footer-border-radius`)

### Minimized State

```
┌─────────────────┐
│   ═══           │
│   [▶▶]          │
└─────────────────┘
```

**Dimensions**:
- Height: 48px (`--footer-height-minimized`)
- Width: 160px (`--footer-pill-width`)
- Border radius: 24px 24px 0 0 (`--footer-border-radius-minimized`)

---

## Color Tokens

### Dark Theme (Default)

| Token | Value | Usage |
|-------|-------|-------|
| `--footer-bg` | `#1a1a2e` | Footer background |
| `--footer-bg-secondary` | `#16213e` | Dropdown background |
| `--footer-accent` | `#0d9488` | Play button, progress fill |
| `--footer-accent-hover` | `#14b8a6` | Hover state for accent |
| `--footer-text` | `#ffffff` | Primary text, icons |
| `--footer-text-muted` | `#b8c5d6` | Time display, paragraph count |
| `--footer-border` | `rgba(255, 255, 255, 0.1)` | Borders, drag handle |
| `--footer-focus-ring` | `rgba(13, 148, 136, 0.5)` | Focus indicator |
| `--footer-shadow` | `0 -4px 20px rgba(0, 0, 0, 0.3)` | Drop shadow |

### Light Theme

| Token | Value | Usage |
|-------|-------|-------|
| `--footer-bg` | `#ffffff` | Footer background |
| `--footer-bg-secondary` | `#f8fafc` | Dropdown background |
| `--footer-accent` | `#0f766e` | Play button, progress fill |
| `--footer-accent-hover` | `#0d9488` | Hover state |
| `--footer-text` | `#1e293b` | Primary text |
| `--footer-text-muted` | `#475569` | Secondary text |
| `--footer-border` | `rgba(0, 0, 0, 0.1)` | Borders |
| `--footer-shadow` | `0 -4px 20px rgba(0, 0, 0, 0.1)` | Drop shadow |

---

## Component Specifications

### Buttons

**Standard Button (`.btn`)**
- Size: 40x40px (`--footer-button-size`)
- Min touch target: 44x44px (`--min-touch-target`)
- Border radius: 50% (circular)
- Icon size: 20x20px

**Play/Pause Button (`.btn-play-pause`)**
- Size: 48x48px (`--footer-button-size-lg`)
- Background: `--footer-accent`
- Icon size: 24x24px
- Hover: `--footer-accent-hover`

**Small Button (`.btn-sm`)**
- Size: 32x32px (`--footer-button-size-sm`)
- Icon size: 16x16px

### Progress Bar

- Height: 6px (`--footer-progress-height`)
- Background: `rgba(255, 255, 255, 0.1)`
- Fill color: `--footer-accent`
- Border radius: 3px
- Min width: 60px
- Cursor: pointer (seekable)

### Time Display

- Font size: 12px
- Color: `--footer-text-muted`
- Font variant: tabular-nums (monospace digits)
- Format: `M:SS` or `MM:SS`

### Speed Control

- Button: 48px min width
- Font size: 12px, weight 500
- Dropdown: 60px min width
- Options: 0.5x, 0.75x, 1.0x, 1.25x, 1.5x, 1.75x, 2.0x

---

## Accessibility Requirements

### WCAG 2.1 AA Compliance

| Requirement | Implementation |
|-------------|----------------|
| **Touch Target** | All buttons ≥44x44px |
| **Focus Visible** | 2px solid accent outline + 4px shadow ring |
| **Color Contrast** | 4.5:1 for text, 3:1 for UI components |
| **Reduced Motion** | All animations disabled via `prefers-reduced-motion` |
| **Screen Reader** | ARIA labels on all controls |
| **Live Regions** | Status announcements via `aria-live="polite"` |

### ARIA Attributes

```html
<button aria-label="Play" aria-pressed="false">
<button aria-label="Pause" aria-pressed="true">
<button aria-label="Previous paragraph">
<button aria-label="Next paragraph">
<button aria-label="Speed: 1.0x">
<button aria-label="Minimize player">
<button aria-label="Close player">
<div role="progressbar" aria-valuenow="45" aria-valuemin="0" aria-valuemax="100">
```

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `Tab` | Move focus between controls |
| `Enter` / `Space` | Activate focused control |
| `Escape` | Close speed dropdown / minimize player |
| `Arrow Up/Down` | Navigate speed options |

### Screen Reader Announcements

Live region announces:
- Playback started/paused
- Paragraph changes
- Speed changes
- Error messages

---

## Responsive Behavior

### Width Breakpoints

| Viewport Width | Behavior |
|----------------|----------|
| > 600px | Full width (600px max) |
| ≤ 600px | Fills viewport width with 16px margin |
| Minimized | 160px pill, centered or positioned |

### Position States

| Position | CSS |
|----------|-----|
| Center (default) | `left: 50%; transform: translateX(-50%)` |
| Left | `left: 16px; transform: none` |
| Right | `right: 16px; left: auto; transform: none` |

### Drag Behavior

- Drag handle: 40x4px centered at top
- Vertical drag: Adjusts `yOffset` (0 to window.innerHeight/3)
- Horizontal snap: Left / Center / Right
- Position persisted to `browser.storage.local`

---

## Animation Specifications

### Transitions

| Property | Duration | Easing |
|----------|----------|--------|
| Height (expand/minimize) | 200ms | ease-out |
| Width (expand/minimize) | 200ms | ease-out |
| Border radius | 200ms | ease-out |
| Background color (hover) | 150ms | ease |
| Button scale (active) | 100ms | ease |
| Progress fill | 100ms | linear |

### Loading Animation

Play button pulses during loading:
```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### Reduced Motion

When `prefers-reduced-motion: reduce`:
- All transitions: 0ms
- All animations: disabled

---

## Error Notification

Displays above footer when TTS errors occur.

```
┌───────────────────────────────────────┐
│  Error: API key invalid  [Dismiss]    │
└───────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────────┐
│                         Footer                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Specifications**:
- Background: `#dc2626` (error red)
- Text: white, 13px, weight 500
- Position: 48px above footer
- Auto-dismiss: 5 seconds
- Border radius: 8px
- Shadow: `0 4px 12px rgba(220, 38, 38, 0.3)`

---

## Implementation Notes

### Shadow DOM Encapsulation

The footer uses Shadow DOM to:
- Isolate styles from page CSS
- Prevent style leakage
- Maintain consistent appearance across sites

### Z-Index Strategy

- Footer: `2147483647` (max 32-bit signed int)
- Error notification: Footer z-index + 1
- Ensures footer appears above all page content

### Body Padding Adjustment

When footer is visible:
- Original `padding-bottom` is preserved
- Additional padding added equal to footer height
- Padding restored when footer closes

---

## File References

| Purpose | File |
|---------|------|
| Implementation | `src/utils/content/sticky-footer.ts` |
| Global tokens | `src/styles/tokens.css` |
| Content styles | `src/styles/content.css` |

---

## Research References

- [Footer Accessibility](../research/footer-accessibility.md) - WCAG 2.1 AA compliance requirements
- [CSS Design Tokens](../research/css-design-tokens.md) - Token naming conventions and theme support
