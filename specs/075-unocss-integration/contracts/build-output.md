# Build Output Contract: UnoCSS Integration

**Feature**: 075-unocss-integration
**Date**: 2026-03-05

---

## Overview

This contract defines the expected build output behavior when UnoCSS is integrated into the Proso extension's WXT + Vite pipeline. Since this is a build-time tooling feature (not a library or API), the contract is between the build configuration and the build output.

---

## Contract 1: Entrypoint CSS Isolation

### Invariant

Each extension entrypoint MUST receive only CSS relevant to its own source files.

### Expectations

| Entrypoint | UnoCSS CSS Included | Content Script CSS | Hand-written CSS |
|---|---|---|---|
| Popup | Yes — only popup utilities | No | popup/style.css |
| Options | Yes — only options utilities | No | options/options.css |
| Content | No | Yes — hand-written inline | content.css |
| Background | No | No | No |

### Verification

```bash
# After build, verify no UnoCSS output in content script bundle
# Content script output should not contain UnoCSS-generated class patterns
grep -r "\/\*.*unocss\|uno-" .output/firefox-mv2/content-scripts/ && echo "FAIL: UnoCSS in content" || echo "PASS"

# Background should have no CSS files
ls .output/firefox-mv2/background*.css 2>/dev/null && echo "FAIL: CSS in background" || echo "PASS"
```

---

## Contract 2: Design Token Consistency

### Invariant

Every UnoCSS utility class that references a design token MUST resolve to the same CSS custom property defined in `tokens.css`.

### Expectations

| Utility Class | Generated CSS Property | Expected Value |
|---|---|---|
| `bg-bg-primary` | `background-color` | `var(--color-bg-primary)` |
| `text-text-primary` | `color` | `var(--color-text-primary)` |
| `p-lg` | `padding` | `var(--spacing-lg)` |
| `text-sm` | `font-size` | `var(--font-size-sm)` |
| `rounded-md` | `border-radius` | `var(--radius-md)` |
| `shadow-accent` | `box-shadow` | `var(--shadow-accent)` |
| `z-overlay` | `z-index` | `var(--z-overlay)` |

### Verification

Contract tests should generate utility classes and verify the CSS output contains the correct `var()` references. Example test structure:

```typescript
// tests/contract/unocss-tokens.test.ts
describe('UnoCSS Design Token Contract', () => {
  it('color utilities reference tokens.css custom properties', () => {
    // Generate CSS for utility class and verify var() output
  });
  
  it('spacing utilities reference tokens.css custom properties', () => {
    // Generate CSS for p-lg and verify var(--spacing-lg)
  });
});
```

---

## Contract 3: Bundle Size

### Invariant

Adding UnoCSS MUST NOT increase any entrypoint's CSS bundle size by more than 5 KB.

### Expectations

| Metric | Threshold |
|---|---|
| Popup CSS increase | ≤ 5 KB |
| Options CSS increase | ≤ 5 KB |
| Total extension size increase | ≤ 10 KB |

### Verification

```bash
# Measure before/after CSS sizes
# Before: build without UnoCSS, record sizes
# After: build with UnoCSS, compare

# Per-entrypoint CSS size check
wc -c .output/firefox-mv2/popup/*.css
wc -c .output/firefox-mv2/options/*.css
```

---

## Contract 4: Build Performance

### Invariant

Build time MUST NOT increase by more than 50% compared to the baseline (~5 seconds).

### Expectations

| Metric | Threshold |
|---|---|
| Production build time | ≤ 7.5 seconds (50% of ~5s baseline) |

### Verification

```bash
# Measure build time
time pnpm --filter @proso/extension build
```

---

## Contract 5: Extension Validity

### Invariant

The built extension MUST pass Mozilla AMO validation.

### Expectations

- `web-ext lint` passes with no errors
- Manifest is valid
- No inline script violations
- All declared permissions are justified

### Verification

```bash
pnpm --filter @proso/extension build
cd packages/extension/.output/firefox-mv2
npx web-ext lint
```

---

## Contract 6: Existing Test Suite

### Invariant

All existing tests MUST continue to pass without modification.

### Expectations

- 2,300+ unit tests pass
- Contract tests pass
- Integration tests pass
- Security tests pass

### Verification

```bash
pnpm --filter @proso/extension test:unit
pnpm --filter @proso/extension test:contract
pnpm --filter @proso/extension test:integration
pnpm --filter @proso/extension test:security
```

---

## Contract 7: No Host Page Style Leaking

### Invariant

UnoCSS-generated CSS MUST NEVER be injected into host web pages.

### Expectations

- Content script entrypoint is excluded from UnoCSS processing
- No `virtual:uno.css` import in content.ts
- No UnoCSS styles in content script output bundle
- Sticky footer Shadow DOM isolation maintained

### Verification

```bash
# Verify no UnoCSS import in content script
grep -r "virtual:uno" packages/extension/src/entrypoints/content.ts && echo "FAIL" || echo "PASS"

# Verify no UnoCSS output in content script build
grep -r "uno" .output/firefox-mv2/content-scripts/*.css 2>/dev/null && echo "FAIL" || echo "PASS"
```

---

## Contract 8: rem-to-px Output

### Invariant

All UnoCSS utility output MUST use pixel units, not rem units.

### Expectations

- `p-4` generates `padding: 16px` (not `padding: 1rem`)
- `text-sm` generates `font-size: var(--font-size-sm)` (token reference, not rem)
- No `rem` unit appears in UnoCSS-generated CSS

### Verification

```bash
# After build, check for rem units in UnoCSS output
# (Note: tokens.css itself uses rem for font sizes — that's the token definition, not UnoCSS output)
```
