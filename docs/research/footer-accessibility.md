# Footer Accessibility Research

**Last Updated**: 2026-01-20
**Feature Branch**: `047-architecture-ui-polish`

## Decision

Implement WCAG 2.1 AA compliance for the sticky footer: 4.5:1 text contrast, 3:1 UI component contrast, 44x44px touch targets, visible focus rings, and `prefers-reduced-motion` support.

---

## Rationale

- WCAG 2.1 AA is the industry standard for web accessibility
- 44x44px aligns with Apple HIG, Google Material, and Microsoft Fluent guidelines
- VoxPage's tokens.css already has `prefers-reduced-motion` support
- Extensions should be usable by all users, including those with disabilities

---

## WCAG 2.1 AA Requirements

### Color Contrast

| Element | Minimum Ratio | WCAG Criterion |
|---------|---------------|----------------|
| Normal text (< 18pt) | 4.5:1 | 1.4.3 (AA) |
| Large text (≥ 18pt or 14pt bold) | 3:1 | 1.4.3 (AA) |
| UI components | 3:1 | 1.4.11 (AA) |
| Graphical objects | 3:1 | 1.4.11 (AA) |

### VoxPage Footer Colors

| Element | Dark Theme | Light Theme | Contrast |
|---------|------------|-------------|----------|
| Text on background | `#FFFFFF` on `#1a1a2e` | `#1e293b` on `#FFFFFF` | > 14:1 |
| Muted text | `#b8c5d6` on `#1a1a2e` | `#475569` on `#FFFFFF` | > 7:1 |
| Accent on background | `#0d9488` on `#1a1a2e` | `#0f766e` on `#FFFFFF` | > 4:1 |

---

## Touch Targets

### Size Requirements

| Standard | Minimum Size | Notes |
|----------|--------------|-------|
| WCAG 2.1 AA (2.5.5) | 44x44 CSS px | Recommended |
| WCAG 2.2 AA (2.5.8) | 24x24 CSS px | Minimum |
| Apple HIG | 44x44 points | iOS guideline |
| Material Design | 48x48 dp | Android guideline |

**VoxPage Implementation**: 44x44px minimum via `--min-touch-target: 44px`

### Button Sizing

```css
.btn {
  min-width: var(--min-touch-target);  /* 44px */
  min-height: var(--min-touch-target); /* 44px */
  /* Visible button can be smaller, but touch area is 44px */
}
```

---

## Focus Indicators

### Implementation Pattern

```css
/* Modern approach - keyboard-only focus rings */
.btn:focus-visible {
  outline: 2px solid var(--color-accent-primary);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px var(--color-focus-ring);
}

/* Remove default outline for mouse users */
.btn:focus:not(:focus-visible) {
  outline: none;
}
```

### Focus Requirements (WCAG 2.4.7)

- Focus indicator must be **visible**
- Must have **adequate contrast** (3:1 minimum)
- Should **not rely on color alone**

---

## Reduced Motion

### Media Query Support

VoxPage's `tokens.css` implements this correctly:

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --transition-fast: 0ms;
    --transition-normal: 0ms;
    --transition-slow: 0ms;
    --transition: none;
    --transition-colors: none;
  }

  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### What Gets Disabled

- Progress bar animation
- Button hover transitions
- Loading pulse animation
- Expand/minimize transitions

---

## ARIA for Audio Player Controls

### Button Attributes

| Control | ARIA Attributes |
|---------|-----------------|
| Play/Pause | `role="button"`, `aria-pressed`, `aria-label` |
| Previous | `role="button"`, `aria-label="Previous paragraph"` |
| Next | `role="button"`, `aria-label="Next paragraph"` |
| Speed | `role="button"`, `aria-label="Speed: 1.0x"` |
| Close | `role="button"`, `aria-label="Close player"` |

### Progress Bar

```html
<div role="progressbar"
     aria-valuenow="45"
     aria-valuemin="0"
     aria-valuemax="100"
     aria-label="Playback progress">
</div>
```

### Live Regions

```html
<!-- Screen reader announcements -->
<div role="status" aria-live="polite" class="sr-only">
  Now playing paragraph 3 of 10
</div>
```

---

## Keyboard Navigation

### Required Support (WCAG 2.1.1)

| Key | Action |
|-----|--------|
| `Tab` | Move focus between controls |
| `Shift+Tab` | Move focus backward |
| `Enter` / `Space` | Activate focused control |
| `Escape` | Close dropdowns / minimize player |

### Focus Order

Focus should follow visual order (left to right):
1. Previous button
2. Play/Pause button
3. Next button
4. Progress bar
5. Speed control
6. Minimize button
7. Close button

---

## Testing Checklist

### Automated Testing

- [ ] Run axe DevTools on footer
- [ ] Verify color contrast with WebAIM checker
- [ ] Check focus order with keyboard

### Manual Testing

- [ ] Navigate with keyboard only
- [ ] Test with screen reader (NVDA/VoiceOver)
- [ ] Verify at 400% zoom (WCAG 1.4.10)
- [ ] Test with `prefers-reduced-motion` enabled

### Browser Testing

- [ ] Firefox (primary target)
- [ ] Chrome (secondary)
- [ ] Safari (macOS)

---

## Sources

- [W3C WAI - Understanding SC 1.4.3: Contrast (Minimum)](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [W3C WAI - Understanding SC 2.5.5: Target Size](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)
- [W3C WAI ARIA APG - Slider Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/)
- [MDN - :focus-visible](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible)
- [MDN - prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
