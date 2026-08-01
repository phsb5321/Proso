# Implementation Plan: VoxPage Landing Page & Marketing Site

**Branch**: `065-landing-page` | **Date**: 2026-02-16 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/065-landing-page/spec.md`

## Summary

Build a conversion-focused static landing page for VoxPage to satisfy Paddle merchant verification requirements and drive customer acquisition. The site consists of 4 pages (index, pricing, privacy, terms) built with pure HTML/CSS/JS (no frameworks, no build step), deployed to GitHub Pages via a separate public repository. Dark mode default, typography-forward design using Fraunces + Inter fonts, WCAG 2.1 AA accessible, under 500KB per page.

## Technical Context

**Language/Version**: HTML5, CSS3 (custom properties, grid, `@layer`), JavaScript ES2022+ (vanilla, no dependencies)
**Primary Dependencies**: Google Fonts (Fraunces, Inter) — loaded via CDN, no npm packages
**Storage**: N/A (static site, zero cookies, zero tracking)
**Testing**: Lighthouse audits (Performance 95+, Accessibility 95+, Best Practices 95+, SEO 95+), manual responsive testing, HTML validation
**Target Platform**: All modern browsers (Firefox primary), GitHub Pages hosting
**Project Type**: Static marketing site within monorepo (`packages/site/`)
**Performance Goals**: FCP < 1s, total page weight < 500KB, Lighthouse 95+ all categories
**Constraints**: Zero cookies, zero tracking, no build step, WCAG 2.1 AA, works without JS
**Scale/Scope**: 4 HTML pages, 1 CSS file, 1 JS file, ~2,500 lines total

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applicability | Status | Notes |
| --------- | ------------- | ------ | ----- |
| I. Cross-Browser MV3 | N/A | PASS | Static website, no browser extension APIs |
| II. Privacy by Design | APPLICABLE | PASS | Zero cookies, zero tracking, zero analytics. Privacy policy page accurately represents VoxPage's data practices |
| III. Hexagonal Architecture | N/A | PASS | Static HTML/CSS/JS — no application logic requiring architectural patterns |
| IV. Test Coverage | PARTIAL | PASS | No unit tests (static HTML). Validated via Lighthouse audits for a11y, performance, SEO, best practices |
| V. Observability | N/A | PASS | Zero tracking is a requirement. No telemetry on the marketing site |
| VI. Simplicity | APPLICABLE | PASS | Pure HTML/CSS/JS with zero dependencies is the simplest possible approach. No frameworks, no build tools |

**Quality Gates**:
- TypeScript strict mode: N/A (no TypeScript — pure HTML/CSS/JS per spec constraint C-001)
- ESLint/Biome: N/A (minimal vanilla JS doesn't warrant a linter setup)
- All tests pass: Lighthouse audits replace traditional test suites
- E2E tests on Firefox: Manual visual verification + Lighthouse

**Post-Phase 1 Re-check**: No violations introduced. The static site approach remains the simplest solution that works.

## Project Structure

### Documentation (this feature)

```text
specs/065-landing-page/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 research output
├── data-model.md        # Content model
├── quickstart.md        # Developer quickstart guide
├── contracts/
│   └── page-contracts.md # Page content contracts
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
packages/site/
├── index.html           # Landing page (hero, features, pricing, comparison, open-source)
├── pricing.html         # Pricing page with FAQ (Paddle requirement)
├── privacy.html         # Privacy policy (Paddle requirement)
├── terms.html           # Terms of service (Paddle requirement)
├── robots.txt           # SEO: search engine directives
├── sitemap.xml          # SEO: sitemap
├── package.json         # Minimal workspace package (name + version, no deps)
├── assets/
│   ├── css/
│   │   └── style.css    # Single stylesheet — design tokens, layout, components, responsive, dark/light
│   ├── js/
│   │   └── main.js      # Progressive enhancement: hero animation, pricing toggle, mobile nav
│   └── images/
│       ├── og-image.png # Open Graph social sharing image (1200x630)
│       └── favicon.png  # Favicon (copied from extension icon-32.png)
└── CNAME                # Custom domain (when available)
```

**Deployment repository** (separate public repo):

```text
phsb5321/voxpage-site/     # Public repo on GitHub
├── (same files as packages/site/)
└── .github/
    └── workflows/         # (optional: build validation)
```

**CI workflow** (in main VoxPage repo):

```text
.github/workflows/deploy-site.yml  # Syncs packages/site/ → voxpage-site repo
```

**Structure Decision**: Static site as monorepo package (`packages/site/`) deployed to a separate public GitHub Pages repository (`voxpage-site`). This keeps development co-located with the extension while enabling free GitHub Pages hosting from the private monorepo. No build step — files are copied as-is.

## Design Decisions

### D-001: Deployment via Separate Public Repository

The main VoxPage repo is private. GitHub Pages requires GitHub Pro ($4/mo) for private repos. Instead, a separate public `phsb5321/voxpage-site` repo hosts the static site for free. A GitHub Actions workflow in the main repo syncs `packages/site/` to the public repo on push to main.

### D-002: Typography — Fraunces + Inter

Fraunces (variable serif) for headings provides editorial personality and warmth for a reading/listening product. Inter (variable sans-serif) for body text provides screen-optimized legibility. Both are variable fonts (single file each), minimizing HTTP requests. Total font weight target: < 50KB.

### D-003: Color Palette — Navy/Indigo Dark with Amber Accent

Dark mode default (`#0f0f1a` background) matches the extension's UI. Amber/gold (`#f59e0b`) accent represents audio warmth and serves as the primary CTA color. Teal/cyan (`#06b6d4`) for highlighting matches the extension's word-level sync color. All text colors verified for WCAG AA contrast ratios.

### D-004: Hero Animation — CSS + Minimal JS

The hero visual is a stylized browser window with word-by-word text highlighting animation and a waveform footer. Built with CSS animations (keyframes for word highlighting progression) and a small JS module for waveform bars. Static fallback shows a completed highlight state for no-JS users. `prefers-reduced-motion` disables all animation.

### D-005: Pricing Toggle — Progressive Enhancement

The monthly/annual pricing toggle uses JavaScript to swap displayed prices. Without JS, monthly prices are shown by default (the more common viewing scenario). The toggle is a `<button>` with `aria-pressed` state, not a `<select>` or `<input>`, for better accessibility.

### D-006: No Build Step

The site is pure HTML/CSS/JS with no transpilation, bundling, or minification. This is intentional: it keeps the site maximally simple, debuggable, and aligned with the "no dependencies" constraint. The performance target (< 500KB, FCP < 1s) is achievable without minification given the small codebase.

### D-007: Competitor Comparison — Updated Data

Research (R-002) revealed NaturalReader pricing is $119/yr (not $60/yr as originally estimated). The comparison table is updated accordingly. Word-level sync claims are softened — Speechify and NaturalReader both offer some form of text highlighting; VoxPage's differentiator is that word-level sync is free on all tiers.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
