# CSS Design Tokens

**Last Updated**: 2026-01-20
**Feature Branch**: `047-architecture-ui-polish`

## Decision

Extend Proso's existing `tokens.css` with component-specific tokens following the established semantic naming pattern. No architectural changes needed.

---

## Rationale

- Proso already has a well-structured token system
- Existing pattern uses semantic naming (`--color-text-primary`)
- Theme switching via `prefers-color-scheme` and `data-theme` already implemented
- Adding tokens is additive, low-risk change

---

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| CSS Custom Properties | Native, no build step, dynamic | IE11 not supported |
| Sass Variables | Mature tooling | Requires build, not dynamic |
| CSS-in-JS | Component scoped | Runtime overhead |
| **Extend existing tokens.css** | Already implemented, low risk | None |

**Choice**: Extend existing tokens.css - already well-structured.

---

## Token Categories

Proso's `tokens.css` defines tokens in these categories:

### Colors

```css
:root {
  /* Background hierarchy */
  --color-bg-primary: #1a1a2e;
  --color-bg-secondary: #16213e;
  --color-bg-tertiary: #0f0f1a;

  /* Text hierarchy */
  --color-text-primary: #ffffff;
  --color-text-secondary: #b8c5d6;
  --color-text-muted: #8899a8;

  /* Accent colors */
  --color-accent-primary: #0d9488;
  --color-accent-secondary: #14b8a6;
  --color-accent-gradient: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);

  /* Semantic colors */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;
}
```

### Spacing

```css
:root {
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --spacing-xl: 20px;
  --spacing-2xl: 24px;
  --spacing-3xl: 32px;
}
```

### Typography

```css
:root {
  --font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  --font-size-xs: 0.625rem;  /* 10px */
  --font-size-sm: 0.75rem;   /* 12px */
  --font-size-md: 0.875rem;  /* 14px */
  --font-size-lg: 1rem;      /* 16px */
  --font-size-xl: 1.25rem;   /* 20px */

  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
}
```

### Sizes

```css
:root {
  /* Border radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  /* Touch targets */
  --min-touch-target: 44px;

  /* Component sizes */
  --popup-width: 360px;
  --popup-min-height: 580px;
}
```

### Animation

```css
:root {
  --transition-fast: 100ms;
  --transition-normal: 200ms;
  --transition-slow: 300ms;

  --ease-default: ease;
  --ease-in-out: ease-in-out;
  --ease-out: ease-out;
}
```

### Shadows

```css
:root {
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
  --shadow-accent: 0 4px 15px rgba(13, 148, 136, 0.4);
}
```

---

## Naming Convention

**Pattern**: `--category-property-variant-state`

| Example | Breakdown |
|---------|-----------|
| `--color-text-primary` | category-property-variant |
| `--color-button-bg-hover` | category-component-property-state |
| `--footer-height-minimized` | component-property-variant |
| `--spacing-sm` | category-variant |

### Naming Rules

1. **Use lowercase** with hyphens
2. **Start with category** (color, spacing, font, etc.)
3. **Be specific** but not overly verbose
4. **Use consistent variants** (primary/secondary, sm/md/lg)

---

## Footer-Specific Tokens

Added in 047-architecture-ui-polish:

```css
:root {
  /* Dimensions */
  --footer-height: 64px;
  --footer-height-minimized: 48px;
  --footer-pill-width: 160px;
  --footer-max-width: 600px;
  --footer-z-index: 2147483647;

  /* Controls */
  --footer-button-size: 40px;
  --footer-button-size-sm: 32px;
  --footer-button-size-lg: 48px;
  --footer-progress-height: 6px;
  --footer-control-gap: 12px;
  --footer-title-max-width: 200px;
  --footer-border-radius: 12px;
  --footer-border-radius-minimized: 24px;
}
```

---

## Theme Support

### System Preference

```css
@media (prefers-color-scheme: light) {
  :root {
    --color-bg-primary: #ffffff;
    --color-text-primary: #1e293b;
    /* ... light theme overrides */
  }
}
```

### Manual Override

```css
:root[data-theme="dark"] {
  /* Force dark theme */
}

:root[data-theme="light"] {
  /* Force light theme */
}
```

---

## Browser Support

| Browser | Version | Support |
|---------|---------|---------|
| Chrome | 49+ | Full |
| Firefox | 31+ | Full |
| Safari | 10+ | Full |
| Edge | 16+ | Full |
| IE | - | None (not required) |

---

## Usage in Components

### Direct Usage

```css
.my-button {
  background: var(--color-accent-primary);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  transition: var(--transition);
}
```

### With Fallbacks

```css
.my-button {
  background: var(--color-accent-primary, #0d9488);
  /* Fallback if token not defined */
}
```

### In JavaScript

```javascript
const accentColor = getComputedStyle(document.documentElement)
  .getPropertyValue('--color-accent-primary')
  .trim();
```

---

## Sources

- [MDN: Custom Properties (CSS Variables)](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/--*)
- [U.S. Web Design System: Design Tokens](https://designsystem.digital.gov/design-tokens/)
- [GitLab Pajamas: Design Tokens](https://design.gitlab.com/product-foundations/design-tokens/)
- [Salesforce Lightning: Design Tokens](https://www.lightningdesignsystem.com/design-tokens/)
