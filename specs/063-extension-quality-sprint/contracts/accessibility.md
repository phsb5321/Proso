# Contract: Accessibility

**Feature**: 063-extension-quality-sprint
**Covers**: FR-010, FR-011, FR-012, FR-013

## ARIA Live Regions (FR-010)

Dynamic content areas MUST have appropriate `aria-live` attributes:

| UI Surface | Element | Live Region Type | Trigger |
|-----------|---------|-----------------|---------|
| Popup | Playback status | `aria-live="polite"` | State change (playing/paused/error) |
| Popup | Export progress | `aria-live="polite"` | Progress update |
| Popup | Queue list | `aria-live="polite"` | Item added/removed |
| Popup | Error display | `aria-live="assertive"` | Error shown |
| Footer | Time display | `aria-live="off"` | Continuous (too frequent for announcements) |
| Footer | State indicator | `aria-live="polite"` | Play/pause toggle |
| Options | Save confirmation | `aria-live="polite"` | Settings saved |

## Reduced Motion (FR-011)

All CSS files with animations/transitions MUST include `prefers-reduced-motion` guards:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Files requiring this guard:
- `src/entrypoints/popup/` (popup CSS)
- `src/entrypoints/options/` (options CSS — `save-pulse` animation)
- `src/styles/components.css` (existing partial coverage at line 1020 — verify completeness)

## Keyboard Shortcuts (FR-012)

All keyboard shortcuts MUST require a modifier key:

| Action | Current | Required |
|--------|---------|----------|
| Play/Pause | (check) | Ctrl+Shift+P or configurable |
| Next paragraph | (check) | Ctrl+Shift+N or configurable |
| Previous paragraph | (check) | Ctrl+Shift+B or configurable |
| Stop | (check) | Ctrl+Shift+S or configurable |

Shortcuts MUST be remappable through the options page OR use the browser's built-in extension shortcut management.

## Touch Targets (FR-013)

All interactive elements MUST meet minimum 44x44px touch targets:

```css
.interactive-element {
  min-width: 44px;
  min-height: 44px;
}
```

Elements to audit:
- Popup buttons (play, pause, next, prev, settings)
- Footer controls (play, prev, next, minimize, close, speed)
- Options page toggles and buttons
- Queue item action buttons
