# Tasks: Standalone Terms of Service

**Input**: Design documents from `/specs/066-standalone-tos/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: No automated tests requested. This is a static HTML+CSS document — validation is manual (page weight, accessibility, print, deep-links) per quickstart.md.

**Organization**: Tasks grouped by implementation phase from plan.md, tagged with user stories from spec.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US6)

---

## Phase 1: Setup

**Purpose**: Create directory structure and project scaffolding

- [x] T001 Create `packages/legal/` directory structure: `packages/legal/assets/css/` directories
- [x] T002 [P] Create `packages/legal/README.md` with purpose, deployment, and maintenance notes

---

## Phase 2: Foundational (CSS + HTML Shell)

**Purpose**: CSS foundation and document skeleton that ALL content depends on

**CRITICAL**: No content tasks can begin until the HTML shell (T004) is complete

- [x] T003 [P] Create `packages/legal/assets/css/legal.css` — complete stylesheet with: system font stacks (Georgia serif body, system sans-serif headings), max-width 720px content column, sticky TOC sidebar on desktop (CSS `position: sticky`), collapsible TOC on mobile (via `details/summary`), `prefers-color-scheme` dark/light mode, `@media print` stylesheet (hide nav/sidebar, clean margins, no backgrounds), skip-nav link styling, table styling for pricing table, definition list styling, link styling (brand color only), focus-visible indicators for accessibility
- [x] T004 Create `packages/legal/terms.html` — document shell with: DOCTYPE, `<html lang="en">`, proper `<head>` with meta tags (charset, viewport, description, robots), link to `legal.css`, skip-nav link, minimal header with VoxPage text wordmark, effective date (2026-03-18) and last-updated date (2026-02-16), version 1.0, TOC `<nav>` with links to all 20 sections, 20 empty `<section>` elements with correct `id` attributes and `<h2>` headings per data-model.md section inventory, footer with copyright and "Previous versions" link, legal disclaimer notice

**Checkpoint**: HTML shell renders in browser with heading hierarchy, TOC links scroll to sections, dark mode works, print produces clean skeleton output

---

## Phase 3: User Story 1 + User Story 2 — Subscriber & Free Tier Rights (Priority: P1) MVP

**Goal**: Deliver Sections 1-5 so a prospective subscriber can read pricing/terms and a free tier user can confirm their rights (INV-001, INV-002, INV-003, INV-005)

**Independent Test**: Navigate to ToS, verify all 5 sections render with correct content. Search for each business invariant concept. Verify pricing table matches `packages/site/pricing.html`.

### Implementation

- [x] T005 [US1] Write Section 1 (Introduction & Acceptance) in `packages/legal/terms.html` — product definition ("VoxPage" = extension + server + website + services), acceptance triggers (install, use API, create account, purchase), age 16+ (FR-028), AGPL-3.0 relationship, visible disclaimer per FR-029
- [x] T006 [US1] Write Section 2 (Definitions) in `packages/legal/terms.html` — 10 defined terms using `<dl>` definition lists: Extension, Service, Account, Subscription, Credits, BYOK, Free Tier, Content, Provider, Paddle
- [x] T007 [US2] Write Section 3 (The Service) in `packages/legal/terms.html` — service description, INV-001 (free no account), INV-002 (BYOK all tiers), INV-003 (word sync free), INV-005 (browser TTS unlimited), modification/discontinuation clause
- [x] T008 [US2] Write Section 4 (Accounts & Registration) in `packages/legal/terms.html` — INV-001 (free no account), paid features require account, user responsibilities, termination, data portability on deletion
- [x] T009 [US1] Write Section 5 (Subscription Plans & Pricing) in `packages/legal/terms.html` — pricing table (6 tiers: Free $0, Basic $4.99/$39.99, Pro $14.99/$119.99, Multilingual $19.99/$159.99, Team $14.99/user, Enterprise custom), 30-day change notice, annual price lock. Cross-check against `packages/site/pricing.html`

**Checkpoint**: Sections 1-5 complete. Pricing table matches marketing site. INV-001, INV-002, INV-003, INV-005 all present. US1 and US2 acceptance scenarios verifiable.

---

## Phase 4: User Story 1 + User Story 3 + User Story 4 — Billing, Credits, BYOK, Providers (Priority: P1/P2)

**Goal**: Deliver Sections 6-10 covering billing/Paddle (US4), credit/refund policies (US1), BYOK terms (US3), and provider obligations (US3)

**Independent Test**: Verify Paddle MoR attribution text present in Section 6. Verify credit policy matches business rules (INV-004, INV-006). Verify each provider has terms link and key obligations listed.

### Implementation

- [x] T010 [US4] Write Section 6 (Billing & Payment) in `packages/legal/terms.html` — Paddle MoR attribution (use exact recommended text from research.md R2: "Our order process is conducted by our online reseller Paddle.com..."), link to Paddle Checkout Buyer Terms, billing cycles, 7-day grace period, currency USD, tax by Paddle, cancellation terms
- [x] T011 [US1] Write Section 7 (Credit Policy) in `packages/legal/terms.html` — INV-004 (no mid-cycle expiry), INV-006 (cache no re-charge), rollover rules (Pro+ 100K, Free/Basic none), fallback to browser TTS/BYOK, non-transferable, forfeiture beyond rollover cap
- [x] T012 [US1] Write Section 8 (Refund Policy) in `packages/legal/terms.html` — 7-day full for annual, prorated for monthly, Paddle processing channel, chargeback rights and account suspension, free tier (nothing to refund)
- [x] T013 [US3] Write Section 9 (API Keys & BYOK) in `packages/legal/terms.html` — INV-002 (always available all tiers), local storage in `browser.storage.local`, user responsibilities (security, charges, provider terms), VoxPage not liable, fallback to browser TTS
- [x] T014 [US3] Write Section 10 (Third-Party TTS Providers) in `packages/legal/terms.html` — 6 providers with terms links (OpenAI Usage Policies, ElevenLabs Service-Specific Terms, Groq Services Agreement, Cartesia ToS, Google APIs Terms, Browser N/A), OpenAI AI-voice disclosure requirement (FR-023), ElevenLabs free-plan non-commercial restriction (FR-024), Cartesia free-tier non-commercial restriction (from research.md R1), provider availability disclaimer

**Checkpoint**: Sections 6-10 complete. Paddle identified as MoR (SC-011). Each provider has terms link (SC-012). INV-004 and INV-006 present. US3 and US4 acceptance scenarios verifiable.

---

## Phase 5: User Story 5 — Developer & Open Source (Priority: P2/P3)

**Goal**: Deliver Sections 11-15 covering acceptable use, intellectual property, open source relationship (US5), privacy summary, and disclaimers

**Independent Test**: Read Open Source and IP sections and confirm AGPL-3.0 relationship is unambiguous — extension is open source, server is proprietary, AGPL-3.0 prevails in conflict.

### Implementation

- [x] T015 [P] Write Section 11 (Acceptable Use) in `packages/legal/terms.html` — 8 prohibited activities: no unauthorized content processing, no provider terms violation, no circumventing limits, no spam/harassment/illegal use, no reverse-engineering server (extension source is open under AGPL-3.0), no sharing/reselling credits, no abuse via automation, no voice impersonation
- [x] T016 [P] [US5] Write Section 12 (Intellectual Property) in `packages/legal/terms.html` — AGPL-3.0 for extension source, proprietary server/branding/trademarks, user retains content rights, generated audio per provider terms, commercial license reference to COMMERCIAL.md
- [x] T017 [P] [US5] Write Section 13 (Open Source) in `packages/legal/terms.html` — AGPL-3.0 governs extension, users' rights not limited by ToS, AGPL-3.0 prevails in conflict (FR-026), server is NOT open source, commercial licensing link
- [x] T018 [P] Write Section 14 (Privacy) in `packages/legal/terms.html` — summary of data collection practices, what VoxPage does NOT collect (browsing history, page content, API keys), link to privacy policy at `../privacy.html`
- [x] T019 [P] Write Section 15 (Disclaimers) in `packages/legal/terms.html` — AS IS/AS AVAILABLE, no warranty on availability/accuracy/quality, AI audio artifacts/mispronunciations, no uptime SLA except Enterprise

**Checkpoint**: Sections 11-15 complete. AGPL-3.0 relationship clear (FR-026). US5 acceptance scenarios verifiable.

---

## Phase 6: General Legal Sections 16-20 (Priority: P3)

**Goal**: Complete all remaining legal sections (liability, indemnification, disputes, changes, contact)

**Independent Test**: All 20 sections present. Dispute resolution uses Brazilian law. Contact emails listed.

### Implementation

- [x] T020 [P] Write Section 16 (Limitation of Liability) in `packages/legal/terms.html` — 12-month cap, excluded damages list (indirect, incidental, special, consequential, punitive, loss of profits/data/business), jurisdictional savings clause
- [x] T021 [P] Write Section 17 (Indemnification) in `packages/legal/terms.html` — user indemnifies for: ToS violation, service misuse, third-party rights violation, content processed
- [x] T022 [P] Write Section 18 (Dispute Resolution) in `packages/legal/terms.html` — Brazilian law governs (FR-027), good-faith negotiation 30 days, arbitration option, no mandatory arbitration for consumers under Brazilian CDC (from research.md R5), consumers may have mandatory local jurisdiction, no class action waiver (not enforceable in Brazil)
- [x] T023 [P] Write Section 19 (Changes to Terms) in `packages/legal/terms.html` — 30-day notice for material changes, notification channels (email/extension/website), continued use = acceptance, cancellation right for paid plan impacts
- [x] T024 [P] Write Section 20 (Contact) in `packages/legal/terms.html` — support@voxpage.com, commercial@voxpage.com, privacy@voxpage.com, SECURITY.md reference, GitHub Issues link

**Checkpoint**: All 20 sections complete (FR-007). All deep-link anchors present (FR-008). SC-001 through SC-004 verifiable.

---

## Phase 7: Cross-References & Deploy Workflow (Priority: P2)

**Goal**: Update existing files to reference standalone ToS, update deploy workflow to include legal pages

**Independent Test**: Deploy workflow triggers on `packages/legal/**` changes. Cross-references point to correct URLs. `TERMS_OF_SERVICE.md` redirects to HTML version.

### Implementation

- [x] T025 [P] Update `packages/site/terms.html` — add notice at top: "For the complete, authoritative Terms of Service, see [link to standalone ToS at legal/terms.html]." Keep existing marketing-friendly content but add the cross-reference (FR-035)
- [x] T026 [P] Update `TERMS_OF_SERVICE.md` — replace content with redirect notice pointing to `packages/legal/terms.html` and the deployed URL at `https://phsb5321.github.io/voxpage-site/legal/terms.html` (FR-036)
- [x] T027 Update `.github/workflows/deploy-site.yml` — add `packages/legal/**` to trigger paths, add pre-deploy step to copy `packages/legal/` into `packages/site/legal/`, keep `publish_dir` as `./packages/site` which now includes `legal/` subdirectory (FR-006, SC-010)

**Checkpoint**: Deploy workflow updated. Cross-references in place. US4 fully satisfied (page publicly accessible, Paddle MoR identified, refund policy clear, pricing visible).

---

## Phase 8: Polish & Final Verification

**Purpose**: Validate all success criteria, page weight, accessibility, and cross-cutting concerns

- [x] T028 Verify page weight: `wc -c packages/legal/terms.html packages/legal/assets/css/legal.css` — total must be under 50KB (SC-002, FR-003)
- [x] T029 Verify all 20 section `id` attributes match data-model.md inventory and respond to deep-link navigation (SC-003, FR-008)
- [x] T030 Verify all 6 business invariants (INV-001 through INV-006) are explicitly stated in the document (SC-004)
- [x] T031 Verify subscription pricing table matches `packages/site/pricing.html` exactly (SC-005)
- [x] T032 [P] Verify dark mode renders with readable contrast by toggling `prefers-color-scheme` (SC-008, FR-031)
- [x] T033 [P] Verify print stylesheet produces clean output: no navigation, no sidebar, proper margins (SC-007, FR-032)
- [x] T034 [P] [US6] Verify mobile rendering at 375px viewport: readable text, no horizontal scroll, TOC collapses (FR-033)
- [x] T035 Verify accessibility: heading hierarchy (h1 > h2 > h3, no skipped levels), skip-nav link as first focusable element, ARIA landmarks, color contrast 4.5:1+ (SC-006, FR-030)
- [x] T036 Verify Paddle MoR: search for "Merchant of Record" in billing section (SC-011)
- [x] T037 Verify provider terms links: each of 6 providers has a working link to their terms (SC-012)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: T004 depends on T001 (directory exists); T003 can run in parallel with T001+T002
- **US1+US2 Content (Phase 3)**: Depends on T004 (HTML shell exists) — BLOCKS on Foundational
- **US1+US3+US4 Content (Phase 4)**: Depends on Phase 3 completion (content flows sequentially in the document)
- **US5 Content (Phase 5)**: All tasks [P] — can run in parallel within phase; depends on T004
- **General Legal (Phase 6)**: All tasks [P] — can run in parallel within phase; depends on T004
- **Cross-References (Phase 7)**: T025 and T026 are [P]; T027 is independent; all depend on content being complete
- **Polish (Phase 8)**: Depends on ALL previous phases being complete

### User Story Dependencies

- **US1 (Prospective subscriber)**: Sections 1-8 — Phases 3+4
- **US2 (Free tier user)**: Sections 1-4, 9 — Phases 3+4
- **US3 (BYOK/providers)**: Sections 9-10 — Phase 4
- **US4 (Paddle verification)**: Sections 5-8 + deploy — Phases 3+4+7
- **US5 (Developer/open source)**: Sections 12-13 — Phase 5
- **US6 (Mobile/print)**: CSS foundation + verification — Phases 2+8

### Within Each Phase

- Sections within a phase are written sequentially (they go into the same file `terms.html`)
- Sections marked [P] in Phases 5-6 can theoretically be written in parallel by different authors, but since they all edit the same HTML file, sequential execution is recommended
- CSS (T003) and HTML shell (T004) can be developed in parallel

### Parallel Opportunities

- T001 + T002 + T003 can all run in parallel (different files)
- Phase 5 tasks (T015-T019) are marked [P] — different content sections, same file
- Phase 6 tasks (T020-T024) are marked [P] — different content sections, same file
- Phase 7 tasks T025 + T026 can run in parallel (different files)
- Phase 8 verification tasks T032 + T033 + T034 can run in parallel (independent checks)

---

## Parallel Example: Setup + Foundational

```bash
# Launch setup tasks in parallel:
Task: "Create packages/legal/ directory structure" (T001)
Task: "Create packages/legal/README.md" (T002)
Task: "Create packages/legal/assets/css/legal.css" (T003)

# Then create HTML shell (depends on T001):
Task: "Create packages/legal/terms.html document shell" (T004)
```

## Parallel Example: Phase 8 Verification

```bash
# Launch independent verification checks in parallel:
Task: "Verify dark mode rendering" (T032)
Task: "Verify print stylesheet output" (T033)
Task: "Verify mobile rendering at 375px" (T034)
```

---

## Implementation Strategy

### MVP First (Phases 1-4)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: CSS + HTML Shell (T003-T004)
3. Complete Phase 3: Sections 1-5 (T005-T009) — US1+US2 satisfied
4. Complete Phase 4: Sections 6-10 (T010-T014) — US3+US4 core satisfied
5. **STOP and VALIDATE**: Verify INV-001 through INV-006, pricing table, Paddle MoR
6. At this point, the ToS is sufficient for Paddle merchant verification

### Incremental Delivery

1. Setup + Foundational → Document shell renders
2. Sections 1-5 → Subscriber and free tier stories testable (MVP!)
3. Sections 6-10 → Billing, BYOK, providers complete
4. Sections 11-15 → Acceptable use, IP, open source, privacy, disclaimers
5. Sections 16-20 → All legal boilerplate complete
6. Cross-references + deploy → Production-ready
7. Verification → All success criteria validated

### Single-File Consideration

Since all content goes into one file (`terms.html`), parallelism is limited for content phases. The primary parallel opportunities are:
- CSS and HTML shell development (Phase 2)
- Cross-reference updates (Phase 7: different files)
- Verification checks (Phase 8: independent tests)

---

## Notes

- All content tasks edit `packages/legal/terms.html` — serialize content phases (3-6)
- CSS task (T003) edits a separate file and can run in parallel with HTML tasks
- No automated tests needed — validation is manual per quickstart.md
- Pricing must be cross-checked against `packages/site/pricing.html` in T009 and T031
- Paddle MoR attribution text must use exact wording from research.md R2
- Provider terms links should be verified as resolving in T037
- Total task count: 37 tasks across 8 phases
