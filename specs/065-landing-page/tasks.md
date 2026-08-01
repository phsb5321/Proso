# Tasks: VoxPage Landing Page & Marketing Site

**Input**: Design documents from `/specs/065-landing-page/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/page-contracts.md
**Tests**: No automated tests requested. Validation via Lighthouse audits and manual inspection.
**Organization**: Tasks grouped by user story. US1 is the MVP — completing only Phase 1-3 produces a deployable site sufficient for Paddle verification.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1-US5)
- All file paths relative to repository root

---

## Phase 1: Setup (Project Initialization)

**Purpose**: Create directory structure and foundational files

- [x] T001 Create directory structure for `packages/site/` with subdirectories: `assets/css/`, `assets/js/`, `assets/images/`
- [x] T002 Create minimal `packages/site/package.json` with name `@voxpage/site`, version `1.0.0`, no dependencies
- [x] T003 Copy favicon from `packages/extension/public/icons/icon-32.png` to `packages/site/assets/images/favicon.png`

---

## Phase 2: Foundational (CSS Design System)

**Purpose**: Shared stylesheet that ALL pages depend on. Must complete before any HTML page.

- [x] T004 Create `packages/site/assets/css/style.css` with CSS custom properties (design tokens from research R-006): colors (`--bg-primary: #0f0f1a`, `--bg-surface: #1a1a2e`, `--bg-elevated: #252540`, `--text-primary: #e8e8ec`, `--text-secondary: #a0a0b4`, `--accent-warm: #f59e0b`, `--accent-highlight: #06b6d4`, `--accent-success: #22c55e`, `--border: #2a2a42`), typography (Fraunces headings, Inter body), spacing scale, and base resets
- [x] T005 Add layout styles to `packages/site/assets/css/style.css`: `.container` max-width, header/nav styles (logo, nav links, install CTA button), footer styles (nav, copyright, "Made with care in Recife, Brazil"), skip-link styles (`.skip-link` visually hidden but focusable), responsive breakpoints (640px, 768px, 1024px, 1280px)
- [x] T006 Add component styles to `packages/site/assets/css/style.css`: pricing cards (grid layout, highlighted card variant), trust badges (horizontal flex row), feature blocks (2-column grid), FAQ details/summary accordion, comparison table, hero section (browser mockup frame, waveform bars), CTA buttons (primary amber, secondary outline), mobile hamburger menu

**Checkpoint**: CSS design system complete. All pages can now be built.

---

## Phase 3: User Story 1 — Paddle Merchant Verification (Priority: P1) MVP

**Goal**: Deliver all 4 pages (index, pricing, privacy, terms) with substantive content at a public URL, sufficient for Paddle merchant verification.

**Independent Test**: Visit the deployed URL. All 4 pages load, pricing shows correct tiers, privacy/terms have substantive legal content, navigation works between all pages.

### Landing Page (index.html)

- [x] T007 [US1] Create `packages/site/index.html` with shared page structure: DOCTYPE, meta charset, viewport, Google Fonts preconnect + Fraunces/Inter stylesheet link, `style.css` link, skip-nav link, `<header>` with VoxPage logo text and `<nav>` (Features, Pricing, Privacy, Terms links + Install CTA), `<main id="main">`, `<footer>` with nav links, copyright 2026, "Made with care in Recife, Brazil"
- [x] T008 [US1] Add hero section to `packages/site/index.html` (`<section id="hero">`): `<h1>` headline ("Listen to the web. Your way."), `<p>` sub-headline explaining Firefox extension with AI voices and word-level sync, primary CTA button linking to `https://github.com/phsb5321/VoxPage/releases` ("Install Free for Firefox"), secondary CTA linking to `pricing.html`, placeholder `<div>` for hero visual (static browser mockup with sample highlighted text — no animation yet)
- [x] T009 [US1] Add pricing summary section to `packages/site/index.html` (`<section id="pricing">`): `<h2>` heading, 4 pricing cards (Free $0/Basic $4.99/Pro $14.99/Multilingual $19.99 monthly prices), each card with tier name, price, feature list (browser TTS, managed credits, premium voices, word-level sync, MP3 export, cloud sync, PDF reading), CTA button (Free="Install Now" linking to GitHub Releases, others="Coming Soon" disabled), BYOK callout box explaining bring-your-own-key concept
- [x] T010 [US1] Add SEO meta tags to `packages/site/index.html` `<head>`: `<title>VoxPage — Listen to the Web</title>`, meta description, Open Graph tags (og:title, og:description, og:image, og:url, og:type=website), Twitter Card tags (summary_large_image), canonical URL, JSON-LD `<script type="application/ld+json">` with SoftwareApplication schema per research R-005

### Pricing Page

- [x] T011 [P] [US1] Create `packages/site/pricing.html` with shared page structure (same header/footer as index), `<h1>` "Simple, transparent pricing", `<p>` sub-text about free tier, 4 pricing cards (same data as index pricing section but full-page layout), enterprise callout with `commercial@voxpage.com` link, page-specific SEO meta tags (title "Pricing — VoxPage", description)

### Privacy Policy Page

- [x] T012 [P] [US1] Create `packages/site/privacy.html` with shared page structure, full privacy policy content: effective date (2026-02-16), data handling (text processed locally, API keys in browser.storage.local, audio sent only to selected TTS provider), managed credit users (server processes text for TTS synthesis, stores credit usage, retains data per billing cycle), cookies and tracking (zero cookies, zero tracking scripts, zero analytics), GDPR rights (access, rectify, delete data, contact email), third-party TTS providers (OpenAI, ElevenLabs, Groq, Cartesia with links to their privacy policies), contact section, page-specific SEO meta tags

### Terms of Service Page

- [x] T013 [P] [US1] Create `packages/site/terms.html` with shared page structure, full terms of service: effective date (2026-02-16), license (AGPL-3.0, commercial license reference), subscription terms (4 tiers with prices, monthly/annual billing, auto-renewal), credit policy (allocations per tier, no expiration mid-billing cycle per INV-004, rollover up to 100K for Pro+), refund policy (7-day full refund annual, prorated monthly), usage restrictions, API keys & third-party services, disclaimers & liability, changes & contact, page-specific SEO meta tags

### SEO & Crawling Files

- [x] T014 [P] [US1] Create `packages/site/robots.txt` allowing all crawlers, linking to sitemap.xml
- [x] T015 [P] [US1] Create `packages/site/sitemap.xml` listing all 4 pages with lastmod dates and priority values (index 1.0, pricing 0.8, privacy 0.5, terms 0.5)

**Checkpoint**: All 4 pages exist with substantive content, correct pricing, navigation works between pages. This is sufficient for Paddle merchant verification. MVP complete.

---

## Phase 4: User Story 2 — Prospective User Discovers VoxPage (Priority: P1)

**Goal**: Make the landing page compelling for customer acquisition: hero animation, features section, how-it-works, trust bar, full accessibility.

**Independent Test**: Load index.html, confirm hero visual animates word-by-word highlighting in a browser mockup, features section shows 4 blocks with icons, trust badges visible, all content accessible via keyboard, skip-nav works, ARIA labels present.

### Hero Animation

- [x] T016 [US2] Build hero visual in `packages/site/index.html` `#hero` section: stylized browser window mockup (dark chrome with address bar using CSS), inside the mockup render a sample article title and paragraphs with individual `<span>` elements per word for CSS highlight animation
- [x] T017 [US2] Add hero animation CSS to `packages/site/assets/css/style.css`: `@keyframes` for word-by-word highlighting progression, waveform bars at bottom of browser mockup with staggered `animation: wave` bounce, static fallback for no-JS, `@media (prefers-reduced-motion: reduce)` disabling all animation

### Content Sections

- [x] T018 [US2] Add trust bar section to `packages/site/index.html` (`<section id="trust" aria-label="Trust indicators">`): 5 inline badges — "Open Source (AGPL-3.0)", "Privacy First — No Data Collection", "2,800+ Tests Passing", "Built with TypeScript", "Firefox 112+"
- [x] T019 [US2] Add features section to `packages/site/index.html` (`<section id="features">`): `<h2>` heading, 4 feature blocks each with inline SVG icon, `<h3>` title, `<p>` description — "Premium AI Voices", "Word-Level Highlighting", "Smart Text Extraction", "Privacy by Design"
- [x] T020 [US2] Add how-it-works section to `packages/site/index.html` (`<section id="how-it-works">`): `<h2>` heading, 3 numbered steps — Step 1 "Install the Extension", Step 2 "Navigate to Any Page", Step 3 "Listen"

### Accessibility

- [x] T021 [US2] Audit and enhance accessibility across all 4 HTML pages: verify single `<h1>` per page with proper heading hierarchy, add `aria-label` to all nav elements and icon-only buttons, ensure all `<a>` have descriptive text, add focus-visible styles to `packages/site/assets/css/style.css`

**Checkpoint**: Landing page is visually compelling with animation, features, trust indicators, and full accessibility.

---

## Phase 5: User Story 3 — Visitor Evaluates Pricing (Priority: P2)

**Goal**: Enhanced pricing page with monthly/annual toggle, BYOK explainer, and FAQ section.

**Independent Test**: Visit pricing.html, toggle between monthly and annual (prices update showing ~33% discount), BYOK callout clearly explains the concept, FAQ accordion opens/closes and answers 5 key questions.

### Pricing Toggle (Progressive Enhancement)

- [x] T022 [US3] Create `packages/site/assets/js/main.js` with pricing toggle function: toggle `data-billing="monthly"|"annual"` attribute on pricing section, swap visible price elements, update toggle button `aria-pressed` state, default to monthly when JS disabled
- [x] T023 [US3] Add monthly/annual toggle button to `packages/site/pricing.html` pricing section: `<button aria-pressed="false">` with "Monthly" / "Annual (Save 33%)" labels, annual prices as hidden `<span class="annual-price">` toggled by JS
- [x] T024 [US3] Add same monthly/annual toggle to `packages/site/index.html` `#pricing` section with identical structure and behavior

### BYOK & FAQ

- [x] T025 [P] [US3] Add BYOK callout section to `packages/site/pricing.html` (`<section id="byok">`): `<h2>` "Bring Your Own Key", explanation paragraph, list of supported providers with brief descriptions
- [x] T026 [P] [US3] Add FAQ section to `packages/site/pricing.html` (`<section id="faq">`): `<h2>` "Frequently Asked Questions", 5 `<details>`/`<summary>` items (credit exhaustion, BYOK usage, free trial, refund policy, credit rollover)
- [x] T027 [US3] Add enterprise/commercial licensing callout to `packages/site/pricing.html`: box with "Enterprise" heading, link to `commercial@voxpage.com` and COMMERCIAL.md

**Checkpoint**: Pricing page fully functional with toggle, BYOK explanation, FAQ, and enterprise contact.

---

## Phase 6: User Story 4 + 5 — Comparison & Open Source (Priority: P3)

**Goal**: Add competitor comparison table and open-source section to the landing page.

**Independent Test**: Visit index.html, scroll to comparison table showing VoxPage vs Speechify vs NaturalReader with verified data, open-source section shows AGPL-3.0, tech stack, commercial licensing link.

### Competitor Comparison (US4)

- [x] T028 [US4] Add comparison section to `packages/site/index.html` (`<section id="comparison">`): responsive `<table>` with `<thead>` (Category, VoxPage, Speechify, NaturalReader), `<th scope="col">` and `<th scope="row">` for accessibility, 7 rows from data-model.md CompetitorComparison instances, checkmark/cross visual indicators

### Open Source (US5)

- [x] T029 [P] [US5] Add open-source section to `packages/site/index.html` (`<section id="open-source">`): AGPL-3.0 license badge, "Built with" tech stack list, contribution CTA, commercial licensing link to `commercial@voxpage.com`

**Checkpoint**: All landing page content sections complete — hero, trust, features, how-it-works, pricing, comparison, open-source.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Light/dark mode, responsive refinement, mobile navigation, OG image, deployment pipeline, final validation.

### JavaScript Enhancements

- [x] T030 Add mobile navigation toggle to `packages/site/assets/js/main.js`: hamburger button toggles nav visibility on mobile (<768px), `aria-expanded` state, close on outside click or Escape key
- [x] T031 Add smooth scroll to `packages/site/assets/js/main.js`: intercept anchor links for smooth scrolling, respect `prefers-reduced-motion` by using instant scroll
- [x] T032 Add `<script src="assets/js/main.js" defer>` tag to all 4 HTML pages in `packages/site/`

### Theme & Accessibility Polish

- [x] T033 Add light mode styles to `packages/site/assets/css/style.css`: `@media (prefers-color-scheme: light)` overriding all `--bg-*` and `--text-*` custom properties, ensure all contrast ratios remain WCAG AA compliant
- [x] T034 Add `prefers-reduced-motion` styles to `packages/site/assets/css/style.css`: `@media (prefers-reduced-motion: reduce)` setting `animation: none`, `transition: none` globally, hero static fallback, waveform bars static

### Responsive Refinement

- [x] T035 Test and fix responsive layout in `packages/site/assets/css/style.css`: pricing cards stack single-column on mobile, 2-column on tablet, 4-column on desktop; comparison table horizontal scroll on mobile; hero mockup scales down; nav collapses to hamburger; 44x44px minimum touch targets

### Assets

- [x] T036 [P] Create OG image at `packages/site/assets/images/og-image.png` (1200x630): dark navy background (#0f0f1a), VoxPage name, tagline "Listen to the web. Your way.", waveform motif in amber/teal accent colors (SVG source at `og-image.svg`, converted to PNG)

### Deployment

- [x] T037 Create `.github/workflows/deploy-site.yml`: triggered on push to main with path filter `packages/site/**` and workflow_dispatch, uses `peaceiris/actions-gh-pages` to deploy to public `phsb5321/voxpage-site` repo with `SITE_DEPLOY_TOKEN` secret
- [x] T038 Create public repository `phsb5321/voxpage-site` via `gh repo create`, enable GitHub Pages (deploy from branch main, root), push initial site files, verify site accessible at `https://phsb5321.github.io/voxpage-site/`

### Validation

- [x] T039 Validate all 4 pages with no-JS: disable JavaScript in browser, verify all pages load with full content visible, navigation works, pricing shows monthly prices, FAQ items expand via native `<details>`, no broken layouts
- [x] T040 Run Lighthouse audit on all 4 pages served via local HTTP server: target 95+ on Performance, Accessibility, Best Practices, SEO; fix any issues found; verify total page weight < 500KB per page
- [x] T041 Verify OG meta tags render correctly: inspect meta tags to confirm og:title, og:description, og:image values are correct on all 4 pages (verified via curl inspection)
- [x] T042 Final cross-browser check: load all 4 pages in Firefox and at least one Chromium browser, verify layout, colors, animations, dark/light mode, responsive breakpoints, no console errors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational CSS (Phase 2)**: Depends on Phase 1 (T001-T003)
- **US1 (Phase 3)**: Depends on Phase 2 (T004-T006) — BLOCKS deployment
- **US2 (Phase 4)**: Depends on Phase 3 (needs index.html to exist)
- **US3 (Phase 5)**: Depends on Phase 3 (needs pricing.html and index.html to exist)
- **US4+US5 (Phase 6)**: Depends on Phase 3 (needs index.html to exist)
- **Polish (Phase 7)**: Depends on Phases 3-6

### User Story Dependencies

- **US1 (P1)**: Foundation only — no other story dependencies. **This is the MVP.**
- **US2 (P1)**: Depends on US1 (needs index.html hero section to exist for animation)
- **US3 (P2)**: Depends on US1 (needs pricing section HTML to exist for toggle). Independent of US2.
- **US4 (P3)**: Depends on US1 (needs index.html to exist). Independent of US2/US3.
- **US5 (P3)**: Depends on US1 (needs index.html to exist). Independent of US2/US3/US4.

### Within Each User Story

- CSS foundations before HTML pages
- HTML structure before JS enhancements
- Content before animation/interactivity

### Parallel Opportunities

**Phase 3** (US1): T011, T012, T013, T014, T015 can all run in parallel (different files)

**Phase 5** (US3): T025, T026 can run in parallel (different sections of pricing.html)

**Phase 6** (US4+US5): T028, T029 can run in parallel (different sections of index.html)

**Phase 7**: T033, T034, T036 can run in parallel (different concerns)

---

## Parallel Example: Phase 3 (US1 MVP)

```
# These tasks create different files and can run in parallel:
T011: Create pricing.html
T012: Create privacy.html
T013: Create terms.html
T014: Create robots.txt
T015: Create sitemap.xml

# These must be sequential (all modify index.html):
T007 → T008 → T009 → T010
```

---

## Implementation Strategy

### MVP First (User Story 1 Only — Phases 1-3)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: CSS Design System (T004-T006)
3. Complete Phase 3: US1 — All 4 pages with content (T007-T015)
4. **STOP AND VALIDATE**: All pages load, pricing correct, legal content substantive
5. Deploy to GitHub Pages → Submit URL to Paddle

**MVP delivers**: 4-page site with correct pricing, privacy policy, terms, navigation — sufficient for Paddle merchant verification.

### Incremental Delivery

1. **MVP** (Phases 1-3): Paddle verification ready
2. **+ US2** (Phase 4): Hero animation, features, trust bar → conversion-optimized
3. **+ US3** (Phase 5): Pricing toggle, BYOK, FAQ → pricing page complete
4. **+ US4+US5** (Phase 6): Comparison, open source → full landing page
5. **+ Polish** (Phase 7): Light mode, mobile nav, deployment CI → production-ready

Each increment adds value without breaking previous work.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- No build step — all files are plain HTML/CSS/JS
- Commit after each completed phase
- US1 alone is a viable MVP for Paddle verification
- Total: ~2,500 lines across 4 HTML + 1 CSS + 1 JS files
