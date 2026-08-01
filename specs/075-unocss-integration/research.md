# Research: UnoCSS Integration for Extension Styling

**Feature**: 075-unocss-integration
**Date**: 2026-03-05
**Status**: Complete — all unknowns resolved

---

## RQ-1: WXT + UnoCSS Integration Mechanism

**Decision**: Use the official `@wxt-dev/unocss` module (v1.0.1), not a manual Vite plugin.

**Rationale**: WXT has first-party UnoCSS support maintained in the wxt-dev monorepo. The module hooks into `vite:build:extendConfig` and `vite:devServer:extendConfig` to inject the UnoCSS Vite plugin into each entrypoint build. This is critical because WXT runs separate Vite builds per entrypoint group — a manual Vite plugin in `wxt.config.ts`'s `vite()` function would not be correctly scoped.

**Configuration pattern**:
```ts
// wxt.config.ts
export default defineConfig({
  modules: ['@wxt-dev/unocss'],
  unocss: {
    excludeEntrypoints: ['background', 'content'],
  },
  // ... existing config unchanged
});
```

The `vite()` function does NOT need UnoCSS added manually. Existing Vite config (aliases, defines, esbuild) remains untouched.

**Alternatives considered**:
- Manual `UnoCSS()` in `vite()` — rejected: doesn't handle WXT's multi-build architecture
- Tailwind CSS — rejected: heavier runtime, no official WXT module, PostCSS-based (slower)
- Vanilla Extract — rejected: runtime overhead, TypeScript-in-CSS complexity

---

## RQ-2: Package Selection and Versions

**Decision**: Install three packages as devDependencies.

| Package | Purpose | Version Constraint |
|---|---|---|
| `unocss` | Core engine + Vite plugin + presets (wind3, icons, directives) | >= 0.60.0 |
| `@wxt-dev/unocss` | WXT module for multi-entrypoint builds | ^1.0.1 |
| `@unocss/preset-rem-to-px` | Converts rem to px (separate package, not bundled in `unocss`) | Latest |

**Install command**:
```bash
pnpm --filter @proso/extension add -D unocss @wxt-dev/unocss @unocss/preset-rem-to-px
```

**Icon collections** (optional, for FR-011):
```bash
pnpm --filter @proso/extension add -D @iconify-json/lucide
```

**Rationale**: The `unocss` meta-package re-exports `presetWind3`, `presetIcons`, and `transformerDirectives` — no separate installs needed for those. Only `@unocss/preset-rem-to-px` must be installed independently. `@wxt-dev/unocss` is the only correct way to integrate with WXT.

**Alternatives considered**:
- `@unocss/preset-wind` — deprecated, renamed to `@unocss/preset-wind3`
- `@unocss/preset-wind4` — rejected: injects its own CSS variables via `:root` theme layer using `oklch`, which conflicts with the existing `tokens.css` custom properties
- Separate `@unocss/vite` — unnecessary, bundled in `unocss`

---

## RQ-3: Preset Selection — presetWind3 over presetWind4

**Decision**: Use `presetWind3` (Tailwind CSS v3 compatible utilities).

**Rationale**: `presetWind4` generates its own CSS custom properties in a `:root` theme layer and uses the `oklch` color model. This would conflict with the existing `tokens.css` custom properties that define the design system. `presetWind3` generates simple CSS declarations without injecting competing theme variables, making it the correct choice for a project with an established token system.

**Alternatives considered**:
- `presetWind4` with `preflights: { theme: false }` — possible but adds configuration complexity with no benefit; the project doesn't need Tailwind v4 features

---

## RQ-4: Design Token Mapping Strategy

**Decision**: Map all UnoCSS theme keys to `var()` references pointing to existing `tokens.css` custom properties. `tokens.css` remains the single source of truth.

**Rationale**: By using `var()` references in the UnoCSS theme config, the generated utility classes resolve to CSS custom properties at runtime. This means:
- Dark/light theme switching via `prefers-color-scheme` and `data-theme` works automatically
- No hex values are duplicated between `tokens.css` and `uno.config.ts`
- Token changes propagate to utilities without config updates

**Token mapping** (complete):

```ts
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
}
```

**Limitation**: UnoCSS opacity modifiers (e.g., `bg-accent/50`) do not work with `var()` color values because UnoCSS cannot decompose a CSS variable into color channels at build time. This is acceptable because the existing tokens already define opacity variants (`--color-accent-bg: rgba(13, 148, 136, 0.15)`) and arbitrary values (`bg-[rgba(13,148,136,0.5)]`) remain available.

**Alternatives considered**:
- Duplicating hex values in `uno.config.ts` — rejected: creates drift risk, breaks dark/light theming
- Using `presetWind4` OKLCH theme system — rejected: conflicts with existing tokens (see RQ-3)

---

## RQ-5: Per-Entrypoint CSS Tree-Shaking

**Decision**: Rely on WXT's multi-build architecture for automatic per-entrypoint tree-shaking. No special UnoCSS mode needed.

**Rationale**: WXT runs separate Vite builds for each entrypoint group. The `@wxt-dev/unocss` module injects the UnoCSS plugin into each build independently. Since UnoCSS in `global` mode extracts classes only from files in the current Vite build's dependency graph, each entrypoint naturally receives only the CSS for utilities used in its files.

- Popup build → scans popup HTML + popup main.ts → generates popup-only CSS
- Options build → scans settings HTML + options main.ts → generates options-only CSS
- Background build → excluded via `excludeEntrypoints`
- Content build → excluded via `excludeEntrypoints`

**Important**: `.ts` files are NOT scanned by UnoCSS by default. Must add to `content.pipeline.include`:
```ts
content: {
  pipeline: {
    include: [
      /\.(html)($|\?)/,
      'src/**/*.ts',
    ],
  },
},
```

**Alternatives considered**:
- `per-module` mode (experimental) — rejected: unnecessary given WXT's build isolation
- `dist-chunk` mode (experimental) — rejected: designed for MPA, not WXT

---

## RQ-6: Content Script and Background Exclusion

**Decision**: Exclude both `background` and `content` entrypoints from UnoCSS processing.

**Rationale**:
- **Background**: No DOM, no CSS needed. Already excluded by default in `@wxt-dev/unocss`.
- **Content**: Injects CSS into host web pages. UnoCSS styles must never leak into host pages (SC-008). Content script highlighting styles (`.proso-w--*`, `.proso-highlight`, etc.) must remain hand-written with `!important` declarations.

**Configuration**:
```ts
unocss: {
  excludeEntrypoints: ['background', 'content'],
}
```

**Alternatives considered**:
- Including content with safelist isolation — rejected: risk of style leaking into host pages

---

## RQ-7: rem-to-px Conversion

**Decision**: Use `@unocss/preset-rem-to-px` with default 1rem = 16px.

**Rationale**: Extension popups and options pages operate in contexts where the root font size is unpredictable. The user's browser zoom level or OS accessibility settings can change the base font size. Converting rem to px at build time ensures consistent sizing regardless of runtime context. This aligns with FR-007.

**Configuration**:
```ts
import presetRemToPx from '@unocss/preset-rem-to-px'

presets: [
  presetRemToPx(),  // 1rem = 16px (default)
]
```

**Alternatives considered**:
- Custom `baseFontSize` — rejected: 16px is standard and matches the token system

---

## RQ-8: @apply Directive for Gradual Migration

**Decision**: Enable `transformerDirectives` to support `@apply` in existing CSS files.

**Rationale**: This is the key enabler for gradual migration (FR-009, FR-010). Developers can refactor existing BEM component definitions to use `@apply` internally without changing the selector names. The BEM class names remain stable while the underlying CSS is composed from utilities.

**Example migration path**:
```css
/* Before: raw CSS properties */
.proso-button {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
}

/* After: @apply with UnoCSS utilities */
.proso-button {
  @apply inline-flex items-center gap-sm py-sm px-lg;
}
```

**Alternative syntax**: `--at-apply: 'inline-flex items-center'` (vanilla CSS custom property syntax, valid in CSS linters)

**Alternatives considered**:
- No `@apply` support — rejected: eliminates the gradual migration path specified in FR-010

---

## RQ-9: Icon System (FR-011)

**Decision**: Use `presetIcons` with `@iconify-json/lucide` as the primary icon collection.

**Rationale**: `presetIcons` renders icons as pure CSS via `mask-image` + `background-color: currentColor`. Zero JS runtime, zero font files, zero SVG DOM nodes. Icons inherit text color via `currentColor`, support sizing via font-size/width/height, and are fully tree-shaken — only icons actually used in HTML are included in the build output.

**Usage**: `<div class="i-lucide-play" />`, `<div class="i-lucide-settings w-5 h-5" />`

**Lucide rationale**: Clean line icon style consistent with Proso's UI aesthetic. 1500+ icons. Already used by many Firefox-compatible projects.

**Alternatives considered**:
- Inline SVGs (current approach) — UnoCSS icons are lighter and more consistent
- Icon fonts — rejected: always include full font file, no tree-shaking
- Heroicons — viable but smaller collection (300+)

---

## RQ-10: Shadow DOM Compatibility (WXT Issue #1125)

**Decision**: Document the limitation. Do not attempt UnoCSS in Shadow DOM content scripts for the initial integration.

**Rationale**: WXT issue #1125 reports that `createShadowRootUi` with `cssInjectionMode: 'ui'` fails to inject UnoCSS-generated styles into the Shadow Root. The sticky footer already uses manual `getStyles()` for inline CSS within Shadow DOM, and this approach continues to work.

**Current state of the issue**: Open, labeled `pending-triage`. Known workarounds:
1. Switch to `cssInjectionMode: 'manifest'` — but this leaks styles into host pages
2. Create an empty CSS stub file — fragile hack
3. Manual `adoptedStyleSheets` injection — viable but complex

**For Proso**: The content script and sticky footer are explicitly out of scope for UnoCSS (per spec). The issue only matters if future features add Shadow DOM UIs that need utility classes. Document as a known limitation with workaround path.

**Alternatives considered**:
- Implementing workaround C (manual adoptedStyleSheets) — rejected: out of scope, content script stays hand-written

---

## RQ-11: CSS Layer Ordering

**Decision**: Import order in entrypoints must be: tokens.css → virtual:uno.css → components.css → page-specific CSS.

**Rationale**: This ensures:
1. Tokens are defined first (CSS custom properties available)
2. UnoCSS utilities reference tokens and have lower specificity than components
3. BEM component classes can override utilities when both apply to an element
4. Page-specific CSS has highest specificity for overrides

**For popup** (`popup/main.ts`):
```ts
import '../../styles/tokens.css'
import 'virtual:uno.css'
import '../../styles/components.css'
import './style.css'
```

**For options** (`options/main.ts`):
```ts
// settings.html already imports tokens.css and components.css via <link>
// Add virtual:uno.css import in options/main.ts
import 'virtual:uno.css'
```

**Note**: The popup currently does NOT import `tokens.css` or `components.css` (uses hardcoded fallbacks in `style.css`). The UnoCSS integration is an opportunity to fix this, but it's not required for the initial integration — `var()` references in utilities will use the fallback values same as the current CSS.

---

## RQ-12: Biome / Pre-commit Compatibility

**Decision**: `uno.config.ts` must pass Biome lint and TypeScript `tsc --noEmit` checks.

**Rationale**: The `lefthook.yml` pre-commit hook runs `biome check` on all `packages/**/*.ts` files and `tsc --noEmit` for the extension package. A new `.ts` file must conform to existing code style.

**Actions**:
- Use `const` over `let` (Biome `useConst: error`)
- Use single quotes (Biome formatting)
- Organize imports per Biome rules
- Ensure TypeScript types are correct (strict mode)

**No issues expected**: UnoCSS config files are standard TypeScript with typed `defineConfig()`.

---

## RQ-13: Dev Mode Warning

**Decision**: Document the expected dev mode warning and mark as safe to ignore.

**Rationale**: The `@wxt-dev/unocss` docs note: "While in dev mode, you may see a warning about `uno.css` not being found. This is because in development, we don't know which files should be injected with UnoCSS styles. The warning can be safely ignored."

This is a known WXT module behavior, not a bug. Document in quickstart.md so developers don't mistake it for a configuration error.
