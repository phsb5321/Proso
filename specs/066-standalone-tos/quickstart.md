# Quickstart: Standalone Terms of Service

**Feature**: 066-standalone-tos
**Date**: 2026-02-16

## Overview

This feature creates a standalone, legally comprehensive Terms of Service as a pure HTML+CSS document at `packages/legal/terms.html`. No build step, no JavaScript, no dependencies.

## File Structure

```
packages/legal/
├── terms.html              # The 20-section Terms of Service (~40KB)
├── assets/
│   └── css/
│       └── legal.css       # Legal document stylesheet (~5KB)
└── README.md               # Purpose, deployment, and maintenance notes
```

## Local Development

Open the file directly in a browser:

```bash
# From repo root
open packages/legal/terms.html          # macOS
xdg-open packages/legal/terms.html      # Linux
firefox packages/legal/terms.html       # Firefox directly
```

No server required. No build step. Just HTML and CSS.

## Testing

### Manual Checks

1. **No-JS rendering**: Disable JavaScript in browser, reload — all content visible
2. **Deep links**: Navigate to `terms.html#refund-policy` — scrolls to correct section
3. **Dark mode**: Toggle system dark mode — colors adapt via `prefers-color-scheme`
4. **Print**: Ctrl+P / Cmd+P — clean output, no navigation/sidebar/branding chrome
5. **Mobile**: Resize to 375px width — readable, no horizontal scroll, TOC collapses
6. **Page weight**: Check file sizes (`wc -c packages/legal/terms.html packages/legal/assets/css/legal.css`)

### Accessibility Checks

1. **Heading hierarchy**: h1 (page title) → h2 (sections) → h3 (subsections) — no skipped levels
2. **Skip-nav**: Tab from top of page — first focusable element is "Skip to content" link
3. **Color contrast**: Check all text/background combos meet 4.5:1 ratio (WCAG AA)
4. **Screen reader**: Navigate with VoiceOver/NVDA — sections announced by heading level

### Content Verification

1. **Business invariants**: Search for each INV-001 through INV-006 concept in the text
2. **Pricing match**: Compare pricing table with `packages/site/pricing.html`
3. **Provider links**: Click each TTS provider terms link — should resolve to current page
4. **Paddle attribution**: Search for "Merchant of Record" — present in billing section

## Deployment

The legal pages deploy alongside the marketing site via `deploy-site.yml`:

1. Push changes to `main` branch
2. GitHub Action triggers on `packages/legal/**` or `packages/site/**` changes
3. Action copies `packages/legal/` → build output as `legal/` subdirectory
4. Deploys to `phsb5321/voxpage-site` repo
5. Accessible at `https://phsb5321.github.io/voxpage-site/legal/terms.html`

## Updating the ToS

When modifying the Terms of Service:

1. Update the `lastUpdated` date in the document metadata
2. If material changes: update the `effectiveDate` (should be 30+ days in the future)
3. Archive the previous version (add to "Previous versions" link section)
4. Update cross-references in `packages/site/terms.html` and `TERMS_OF_SERVICE.md` if needed
5. Commit and push to `main` to trigger deploy

## Key Design Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| No JavaScript | Pure HTML+CSS | Legal documents must be accessible to all users |
| System fonts | Georgia (body), system sans-serif (headings) | No external loading, instant rendering |
| Separate from site | `packages/legal/` not `packages/site/` | Legal docs are authoritative, not marketing |
| Sticky TOC sidebar | CSS-only (position: sticky) | Navigation without JavaScript |
| Dark mode | `prefers-color-scheme` media query | Respects user preference automatically |
