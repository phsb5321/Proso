# Implementation Plan: Standalone Terms of Service

**Branch**: `066-standalone-tos` | **Date**: 2026-02-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/066-standalone-tos/spec.md`

## Summary

Create a standalone, legally comprehensive Terms of Service as a pure HTML+CSS document at `packages/legal/terms.html`. The document covers VoxPage's full product surface (browser extension, managed TTS server, subscriptions, credits, BYOK, third-party providers) across 20 sections. It is the authoritative legal document referenced by the extension, server, Paddle checkout, and external links. No JavaScript, no build step, no external dependencies. Deploys alongside the marketing site to GitHub Pages.

## Technical Context

**Language/Version**: HTML5, CSS3 (no JavaScript)
**Primary Dependencies**: None (pure static HTML+CSS, system fonts only)
**Storage**: N/A (static document, no data persistence)
**Testing**: Manual browser testing + Playwright for accessibility/rendering verification
**Target Platform**: All modern browsers (Firefox 112+, Chrome 88+, Safari 15+), GitHub Pages hosting
**Project Type**: Static document (part of monorepo, not a workspace package)
**Performance Goals**: Page load under 2 seconds, total weight under 50KB
**Constraints**: No JavaScript, no external fonts, WCAG 2.1 AA, printable via `@media print`, deep-linkable sections
**Scale/Scope**: Single HTML page (~40KB) + single CSS file (~5KB), 20 legal sections

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Status | Notes |
| --- | --- | --- | --- |
| I. Cross-Browser MV3 | No | N/A | Static HTML page, not extension code |
| II. Privacy by Design | Yes | PASS | Zero data collection, no cookies, no tracking, no JS |
| III. Hexagonal Architecture | No | N/A | Static HTML, no application code |
| IV. Test Coverage | Partial | PASS | Manual testing checklist + optional Playwright checks; no unit tests needed for static HTML |
| V. Observability | No | N/A | Static page, no telemetry |
| VI. Simplicity | Yes | PASS | Pure HTML+CSS, zero dependencies, zero JavaScript — maximally simple |

**Gate result**: PASS. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/066-standalone-tos/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Provider terms, Paddle MoR, age requirements, deploy workflow
├── data-model.md        # Document structure, section inventory, cross-reference map
├── quickstart.md        # Local dev, testing, deployment guide
└── checklists/
    └── requirements.md  # Specification quality checklist
```

### Source Code (repository root)

```text
packages/legal/                          # NEW: Standalone legal documents
├── terms.html                           # The 20-section ToS (~40KB HTML)
├── assets/
│   └── css/
│       └── legal.css                    # Legal document styling (~5KB CSS)
└── README.md                            # Purpose, deployment, maintenance

# Modified files:
.github/workflows/deploy-site.yml        # Add legal pages to deploy
packages/site/terms.html                 # Add cross-reference to standalone ToS
TERMS_OF_SERVICE.md                      # Replace with redirect to HTML version
```

**Structure Decision**: Static HTML document in `packages/legal/` — separate from the marketing site in `packages/site/`. Legal pages have their own minimal CSS (`legal.css`) independent of the marketing site's styles. Not a pnpm workspace package (no `package.json` needed — just static files). Deployed alongside the site by copying into the publish directory during CI.

## Implementation Phases

### Phase 1: CSS Foundation + Document Shell

Create the legal CSS stylesheet and HTML document shell with all 20 section headings, table of contents, and metadata. No content yet — just structure.

**Files created**:
- `packages/legal/assets/css/legal.css` — Complete stylesheet with:
  - System font stacks (Georgia serif body, system sans-serif headings)
  - Max-width 720px content column
  - Sticky TOC sidebar on desktop (CSS-only via `position: sticky`)
  - Collapsible TOC on mobile (CSS-only via `:target` or `details/summary`)
  - `prefers-color-scheme` dark/light mode support
  - `@media print` stylesheet (hide nav/sidebar, clean margins, no backgrounds)
  - Skip-nav link styling
  - Table styling for pricing table
  - Definition list styling for terms definitions
  - Link styling (brand color for links only)
  - Focus-visible indicators for accessibility
- `packages/legal/terms.html` — Document shell with:
  - DOCTYPE, `<html lang="en">`, proper `<head>` with meta tags
  - Skip-nav link
  - Minimal header with VoxPage wordmark (text, no image)
  - Effective date and last-updated date
  - TOC `<nav>` with links to all 20 sections
  - 20 empty `<section>` elements with correct `id` attributes and `<h2>` headings
  - Footer with copyright

**Validation**: Open in browser — page renders with heading hierarchy, TOC links scroll to sections, dark mode works, print produces clean output.

### Phase 2: Content — Sections 1-5 (Introduction through Pricing)

Fill in the first 5 sections with legal content:

1. **Introduction & Acceptance** — product definition, acceptance triggers, age 16+, AGPL-3.0 relationship, disclaimer notice
2. **Definitions** — 10 defined terms using `<dl>` definition lists
3. **The Service** — description, INV-001 (free no account), INV-002 (BYOK all tiers), INV-003 (word sync free), INV-005 (browser TTS unlimited), modification/discontinuation clause
4. **Accounts & Registration** — INV-001, paid features require account, user responsibilities, termination, data portability
5. **Subscription Plans & Pricing** — pricing table (6 tiers matching `packages/site/pricing.html`), 30-day change notice, annual price lock

**Validation**: Pricing table matches `packages/site/pricing.html` exactly. All INV references are explicit.

### Phase 3: Content — Sections 6-10 (Billing through Providers)

Fill in sections 6-10:

6. **Billing & Payment** — Paddle MoR attribution (use Paddle's recommended language), Paddle Buyer Terms link, billing cycles, 7-day grace period, currency USD, tax handled by Paddle, cancellation terms
7. **Credit Policy** — INV-004 (no mid-cycle expiry), INV-006 (cache no re-charge), rollover rules (Pro+ 100K, Free/Basic none), fallback to browser TTS/BYOK, non-transferable, forfeiture beyond rollover cap
8. **Refund Policy** — 7-day full for annual, prorated for monthly, Paddle processing, chargeback rights, free tier (nothing to refund)
9. **API Keys & BYOK** — INV-002, local storage in `browser.storage.local`, user responsibilities (security, charges, provider terms compliance), VoxPage not liable, fallback to browser TTS
10. **Third-Party TTS Providers** — 6 providers with terms links, OpenAI AI-voice disclosure requirement, ElevenLabs free-plan non-commercial restriction, Cartesia free-tier non-commercial restriction, provider availability disclaimer

**Validation**: Paddle is identified as "Merchant of Record". Each provider has a working terms link. Credit/refund rules match business logic.

### Phase 4: Content — Sections 11-15 (Acceptable Use through Disclaimers)

Fill in sections 11-15:

11. **Acceptable Use** — 8 prohibited activities (no unauthorized content processing, no provider terms violation, no circumventing limits, no spam/harassment/illegal use, no reverse-engineering server, no sharing/reselling credits, no abuse via automation, no voice impersonation)
12. **Intellectual Property** — AGPL-3.0 for extension source, proprietary server/branding/trademarks, user retains content rights, generated audio per provider terms, commercial license reference
13. **Open Source** — AGPL-3.0 governs extension, users' rights not limited by ToS, AGPL-3.0 prevails in conflict, server not open source, commercial licensing link
14. **Privacy** — summary of data collection practices, what VoxPage does NOT collect, link to privacy policy at `../privacy.html`
15. **Disclaimers** — AS IS/AS AVAILABLE, no warranty on availability/accuracy/quality, AI audio artifacts/mispronunciations, no uptime SLA except Enterprise

**Validation**: All prohibited activities are specific and actionable. AGPL-3.0 relationship is unambiguous.

### Phase 5: Content — Sections 16-20 (Liability through Contact)

Fill in sections 16-20:

16. **Limitation of Liability** — 12-month cap, excluded damages list (indirect, incidental, special, consequential, punitive, loss of profits/data/business), jurisdictional savings clause
17. **Indemnification** — user indemnifies for: ToS violation, service misuse, third-party rights violation, content processed
18. **Dispute Resolution** — Brazilian law governs, good-faith negotiation 30 days, arbitration option (no mandatory arbitration for consumers under Brazilian CDC), consumers may have mandatory local jurisdiction, no class action waiver (not enforceable in Brazil)
19. **Changes to Terms** — 30-day notice for material changes, notification channels (email/extension/website), continued use = acceptance, cancellation right for paid plan impacts
20. **Contact** — support@voxpage.com, commercial@voxpage.com, privacy@voxpage.com, SECURITY.md reference, GitHub Issues link

**Validation**: All 20 sections complete. Dispute resolution respects Brazilian CDC consumer protections.

### Phase 6: Cross-References + Deploy Workflow

Update existing files and the deploy workflow:

1. **`packages/site/terms.html`** — Add a notice at the top: "For the complete, authoritative Terms of Service, see [link to standalone ToS]." Keep existing marketing-friendly content but add the cross-reference.

2. **`TERMS_OF_SERVICE.md`** — Replace content with a redirect notice:
   ```
   # VoxPage Terms of Service

   The authoritative Terms of Service is available at:
   https://phsb5321.github.io/voxpage-site/legal/terms.html

   For the source file, see: packages/legal/terms.html
   ```

3. **`.github/workflows/deploy-site.yml`** — Update to include legal pages:
   - Add `packages/legal/**` to the trigger paths
   - Add a step before deploy to copy `packages/legal/` → `packages/site/legal/`
   - The `publish_dir` stays as `./packages/site` (which now includes `legal/` subdirectory)

4. **`packages/legal/README.md`** — Create with purpose, deployment, and maintenance notes

**Validation**: Deploy workflow triggers on both `packages/site/**` and `packages/legal/**` changes. Cross-references point to correct URLs.

### Phase 7: Final Verification

1. **Page weight check**: `wc -c packages/legal/terms.html packages/legal/assets/css/legal.css` — total must be under 50KB
2. **No-JS rendering**: Disable JavaScript, reload — all content visible
3. **Deep-link test**: Navigate to each `#section-id` — correct section scrolls into view
4. **Dark mode test**: Toggle `prefers-color-scheme` — colors adapt correctly
5. **Print test**: Browser print preview — clean output, no navigation/sidebar
6. **Mobile test**: Viewport at 375px — readable, no horizontal scroll, TOC collapses
7. **Accessibility audit**: Check heading hierarchy (h1→h2→h3), skip-nav, ARIA landmarks, color contrast
8. **Business invariant audit**: Search document text for each INV-001 through INV-006 concept
9. **Pricing cross-check**: Compare pricing table against `packages/site/pricing.html`
10. **Provider links check**: Verify each TTS provider terms URL resolves
11. **Paddle attribution check**: Search for "Merchant of Record" in billing section

## Key Research Findings (from research.md)

| Topic | Decision | Rationale |
| --- | --- | --- |
| OpenAI disclosure | Document AI-voice disclosure requirement | Required by OpenAI Usage Policies |
| ElevenLabs commercial | Document free-plan non-commercial restriction | Required by ElevenLabs Service Terms |
| Cartesia commercial | Document free-tier non-commercial restriction | Discovered during research (not in original spec) |
| Paddle MoR language | Use Paddle's recommended attribution text | Required for merchant verification |
| Paddle refund window | Keep VoxPage's 7-day (annual) policy | More restrictive than Paddle's 14-day default; permitted |
| Minimum age | 16+ | GDPR default, conservative, no per-country logic needed |
| Dispute resolution | Brazilian law, no mandatory arbitration, no class waiver | Brazilian CDC consumer protections prevent mandatory arbitration and class waivers |
| Deploy approach | Copy `packages/legal/` into site publish dir | Simplest integration with existing workflow |

## Complexity Tracking

No constitution violations. No complexity justifications needed.
