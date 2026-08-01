# Quickstart: UnoCSS Integration for Proso Extension

**Feature**: 075-unocss-integration
**Date**: 2026-03-05

---

## Prerequisites

- Node.js (current project version)
- pnpm (workspace manager)
- Firefox Nightly (for dev testing)

---

## Installation

```bash
# Install UnoCSS packages
pnpm --filter @proso/extension add -D unocss @wxt-dev/unocss @unocss/preset-rem-to-px

# Install icon collection (optional, for FR-011)
pnpm --filter @proso/extension add -D @iconify-json/lucide
```

---

## Configuration Files

### 1. Create `packages/extension/uno.config.ts`

```ts
import {
  defineConfig,
  presetIcons,
  presetWind3,
  transformerDirectives,
} from 'unocss'
import presetRemToPx from '@unocss/preset-rem-to-px'

export default defineConfig({
  presets: [
    presetWind3(),
    presetRemToPx(),
    presetIcons({
      scale: 1.2,
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    }),
  ],
  transformers: [
    transformerDirectives(),
  ],
  theme: {
    colors: {
      bg: {
        primary: 'var(--color-bg-primary)',
        secondary: 'var(--color-bg-secondary)',
        tertiary: 'var(--color-bg-tertiary)',
      },
      text: {
        primary: 'var(--color-text-primary)',
        secondary: 'var(--color-text-secondary)',
        muted: 'var(--color-text-muted)',
      },
      accent: {
        DEFAULT: 'var(--color-accent-primary)',
        primary: 'var(--color-accent-primary)',
        secondary: 'var(--color-accent-secondary)',
        bg: 'var(--color-accent-bg)',
        glow: 'var(--color-accent-glow)',
      },
      success: 'var(--color-success)',
      warning: 'var(--color-warning)',
      error: 'var(--color-error)',
      info: 'var(--color-info)',
      border: { DEFAULT: 'var(--color-border)' },
      focus: { ring: 'var(--color-focus-ring)' },
      button: {
        bg: 'var(--color-button-bg)',
        'bg-hover': 'var(--color-button-bg-hover)',
        text: 'var(--color-button-text)',
      },
      input: {
        bg: 'var(--color-input-bg)',
        border: 'var(--color-input-border)',
      },
      disabled: {
        bg: 'var(--color-disabled-bg)',
        text: 'var(--color-disabled-text)',
      },
      overlay: { bg: 'var(--color-overlay-bg)' },
    },
    spacing: {
      xs: 'var(--spacing-xs)',
      sm: 'var(--spacing-sm)',
      md: 'var(--spacing-md)',
      lg: 'var(--spacing-lg)',
      xl: 'var(--spacing-xl)',
      '2xl': 'var(--spacing-2xl)',
      '3xl': 'var(--spacing-3xl)',
    },
    fontSize: {
      xs: 'var(--font-size-xs)',
      sm: 'var(--font-size-sm)',
      md: 'var(--font-size-md)',
      lg: 'var(--font-size-lg)',
      xl: 'var(--font-size-xl)',
    },
    fontWeight: {
      normal: 'var(--font-weight-normal)',
      medium: 'var(--font-weight-medium)',
      semibold: 'var(--font-weight-semibold)',
      bold: 'var(--font-weight-bold)',
    },
    lineHeight: {
      tight: 'var(--line-height-tight)',
      normal: 'var(--line-height-normal)',
      relaxed: 'var(--line-height-relaxed)',
    },
    borderRadius: {
      sm: 'var(--radius-sm)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      full: 'var(--radius-full)',
    },
    boxShadow: {
      sm: 'var(--shadow-sm)',
      md: 'var(--shadow-md)',
      lg: 'var(--shadow-lg)',
      accent: 'var(--shadow-accent)',
    },
    fontFamily: {
      sans: 'var(--font-family)',
    },
    zIndex: {
      base: 'var(--z-base)',
      elevated: 'var(--z-elevated)',
      dropdown: 'var(--z-dropdown)',
      sticky: 'var(--z-sticky)',
      overlay: 'var(--z-overlay)',
      'overlay-content': 'var(--z-overlay-content)',
      toast: 'var(--z-toast)',
    },
  },
  rules: [
    ['bg-accent-gradient', { background: 'var(--color-accent-gradient)' }],
    ['min-h-touch', { 'min-height': 'var(--min-touch-target)' }],
    ['w-popup', { width: 'var(--popup-width)' }],
    ['transition-proso', { transition: 'var(--transition)' }],
    ['transition-colors-proso', { transition: 'var(--transition-colors)' }],
  ],
  shortcuts: {
    'proso-flex-col': 'flex flex-col',
    'proso-flex-center': 'flex items-center justify-center',
    'proso-flex-between': 'flex items-center justify-between',
  },
  content: {
    pipeline: {
      include: [
        /\.(html)($|\?)/,
        'src/**/*.ts',
      ],
    },
  },
})
```

### 2. Update `packages/extension/wxt.config.ts`

Add the UnoCSS module registration:

```ts
export default defineConfig({
  modules: ['@wxt-dev/unocss'],
  unocss: {
    excludeEntrypoints: ['background', 'content'],
  },
  // ... rest of existing config unchanged
});
```

### 3. Add virtual CSS imports to entrypoints

**`src/entrypoints/popup/main.ts`** — add at the top:
```ts
import 'virtual:uno.css'
```

**`src/entrypoints/options/main.ts`** — add at the top:
```ts
import 'virtual:uno.css'
```

---

## Usage

### Utility classes in HTML

```html
<!-- Spacing and layout -->
<div class="flex items-center gap-sm p-lg">

<!-- Colors (references tokens.css) -->
<p class="text-text-primary bg-bg-secondary">

<!-- Typography -->
<h2 class="text-lg font-semibold">

<!-- Borders and shadows -->
<div class="border border-border rounded-md shadow-md">

<!-- Icons (requires @iconify-json/lucide) -->
<span class="i-lucide-play w-5 h-5 text-accent">
```

### @apply in existing CSS files

```css
/* Gradually migrate BEM components */
.proso-card {
  @apply bg-bg-secondary border border-border rounded-lg p-xl;
}
```

### Shortcuts

```html
<!-- Use predefined shortcuts -->
<div class="proso-flex-center gap-md">
<div class="proso-flex-between p-lg">
```

---

## Verification

```bash
# Build the extension
pnpm --filter @proso/extension build

# Run all tests (must pass)
pnpm --filter @proso/extension test:unit

# Lint the extension output (pre-existing MANIFEST_UPDATE_URL error is expected)
npx web-ext lint --source-dir packages/extension/.output/firefox-mv2

# Check bundle sizes (CSS files are in assets/ with hashed names)
ls -la packages/extension/.output/firefox-mv2/assets/*.css
```

---

## Known Issues

### Dev mode warning

In development, you may see a warning about `uno.css` not being found. This is expected behavior from the `@wxt-dev/unocss` module and can be safely ignored. The warning occurs because WXT doesn't know which entrypoints need UnoCSS styles until build time.

### Shadow DOM content scripts (WXT #1125)

`createShadowRootUi` with `cssInjectionMode: 'ui'` has a known issue with UnoCSS style injection. This does not affect the current implementation because:
- Content scripts are excluded from UnoCSS processing
- The sticky footer uses manual `getStyles()` for Shadow DOM CSS

### Opacity modifiers

UnoCSS opacity modifiers like `bg-accent/50` do not work with `var()` color values. Use the pre-defined opacity variants from tokens (e.g., `bg-accent-bg` for the translucent accent background) or arbitrary values (`bg-[rgba(13,148,136,0.5)]`).

---

## IDE Setup

Install the UnoCSS VS Code extension for autocomplete:

1. Install "UnoCSS" extension by Anthony Fu
2. The extension auto-detects `uno.config.ts` and provides class name suggestions
3. Hover over utility classes to see the generated CSS
