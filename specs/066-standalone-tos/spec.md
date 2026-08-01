# Feature Specification: Standalone Terms of Service

**Feature Branch**: `066-standalone-tos`
**Created**: 2026-02-16
**Status**: Draft
**Input**: Create a standalone, legally comprehensive Terms of Service page for VoxPage covering the full product surface: browser extension, managed TTS server, subscriptions, credits, BYOK, and third-party provider integrations.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Prospective subscriber reads Terms before purchasing (Priority: P1)

A user considering a paid VoxPage subscription navigates to the Terms of Service to understand their rights, obligations, billing terms, refund policy, and credit policy before committing to a paid plan.

**Why this priority**: This is the primary use case. Paddle merchant verification requires a publicly accessible ToS with clear refund and billing policies. Without this, VoxPage cannot process payments.

**Independent Test**: Can be fully tested by navigating to the ToS URL and verifying all 20 sections render correctly, all deep-links work, and pricing/credit/refund information matches the business rules.

**Acceptance Scenarios**:

1. **Given** a visitor at the ToS URL, **When** they load the page, **Then** all 20 sections render without JavaScript, with correct heading hierarchy, and the page loads in under 2 seconds
2. **Given** a visitor reading the ToS, **When** they look for subscription pricing, **Then** they find a table matching the current pricing (Free $0, Basic $4.99/mo, Pro $14.99/mo, Multilingual $19.99/mo)
3. **Given** a visitor reading the ToS, **When** they look for the refund policy, **Then** they find clear terms: 7-day full refund for annual plans, prorated for monthly plans
4. **Given** a visitor reading the ToS, **When** they look for the credit policy, **Then** they find: credits never expire mid-cycle (INV-004), Pro+ rollover up to 100K, cached content never re-charges (INV-006)

---

### User Story 2 - Free tier user understands their rights without account creation (Priority: P1)

A free tier user wants to confirm they can use VoxPage without creating an account, that browser TTS is unlimited, and that BYOK is available to them at no cost.

**Why this priority**: The free tier is VoxPage's primary acquisition channel. Users must trust that the free tier truly has no strings attached. Business invariants INV-001, INV-002, INV-005 must be clearly documented.

**Independent Test**: Can be tested by searching the ToS for "Free Tier", "BYOK", and "Browser TTS" and confirming each business invariant is explicitly stated.

**Acceptance Scenarios**:

1. **Given** a free tier user reading the ToS, **When** they look for account requirements, **Then** they find that the free tier does not require account creation (INV-001)
2. **Given** a free tier user reading the ToS, **When** they look for BYOK terms, **Then** they find BYOK is available on all tiers, always free (INV-002), and that API keys are stored locally in the browser
3. **Given** a free tier user reading the ToS, **When** they look for usage limits, **Then** they find browser TTS is always unlimited (INV-005)

---

### User Story 3 - BYOK user understands provider obligations (Priority: P2)

A user who brings their own API keys wants to understand their responsibilities regarding third-party TTS providers, particularly OpenAI's AI disclosure requirement and ElevenLabs' commercial use restrictions.

**Why this priority**: OpenAI requires disclosure of AI-generated voices. ElevenLabs restricts free plan usage to non-commercial. VoxPage must document these obligations to comply with provider terms and protect itself legally.

**Independent Test**: Can be tested by navigating to the Third-Party Providers section and verifying each provider's key obligations are listed with links to their terms.

**Acceptance Scenarios**:

1. **Given** a BYOK user reading the ToS, **When** they read the Third-Party Providers section, **Then** they find OpenAI's AI-voice disclosure requirement documented
2. **Given** a BYOK user reading the ToS, **When** they read the Third-Party Providers section, **Then** they find ElevenLabs' free-plan non-commercial restriction documented
3. **Given** a BYOK user reading the ToS, **When** they look for each provider, **Then** they find links to the terms of service and privacy policy for OpenAI, ElevenLabs, Groq, Cartesia, and Google Cloud TTS

---

### User Story 4 - Paddle merchant verification reviewer validates ToS (Priority: P2)

A Paddle compliance reviewer checks the VoxPage ToS during merchant onboarding to verify it meets Paddle's requirements: Paddle is identified as Merchant of Record, refund policy is clear, pricing is transparent, and the page is publicly accessible.

**Why this priority**: Paddle merchant verification is a hard blocker for accepting payments. The ToS must satisfy Paddle's compliance requirements.

**Independent Test**: Can be tested by checking that the ToS page is publicly accessible (no auth), mentions Paddle as Merchant of Record in the billing section, and includes a visible refund policy.

**Acceptance Scenarios**:

1. **Given** a Paddle reviewer, **When** they access the ToS URL, **Then** the page loads without authentication and displays the full document
2. **Given** a Paddle reviewer, **When** they search for "Paddle", **Then** they find Paddle identified as Merchant of Record in the billing section
3. **Given** a Paddle reviewer, **When** they search for "refund", **Then** they find a clearly stated refund policy with specific timeframes and conditions

---

### User Story 5 - Developer understands open-source relationship (Priority: P3)

An open-source developer or potential contributor wants to understand how the ToS relates to the AGPL-3.0 license, what rights they have to modify and redistribute the extension, and what parts of VoxPage are proprietary.

**Why this priority**: VoxPage is dual-licensed. The ToS must clearly delineate the AGPL-3.0 open-source extension from the proprietary server, and explain that AGPL-3.0 prevails in case of conflict for the extension source code.

**Independent Test**: Can be tested by reading the Open Source and Intellectual Property sections and confirming the AGPL-3.0 relationship is unambiguously documented.

**Acceptance Scenarios**:

1. **Given** a developer reading the ToS, **When** they read the Open Source section, **Then** they find that AGPL-3.0 governs the extension source code and prevails over the ToS in case of conflict
2. **Given** a developer reading the ToS, **When** they read the Intellectual Property section, **Then** they find that the server, branding, and trademarks are proprietary while the extension source is AGPL-3.0
3. **Given** a developer reading the ToS, **When** they look for commercial licensing, **Then** they find a reference to COMMERCIAL.md with contact information

---

### User Story 6 - User accesses ToS on mobile or prints for reference (Priority: P3)

A user reads the ToS on a mobile device, or prints it for their records. The document must be fully responsive, readable on small screens, and produce clean print output.

**Why this priority**: Legal documents must be accessible on all devices. Print capability is standard for legal documents that users may want to keep for reference.

**Independent Test**: Can be tested by loading the page on a mobile viewport (375px width) and verifying readability, then using browser print preview to verify clean output.

**Acceptance Scenarios**:

1. **Given** a mobile user, **When** they load the ToS on a 375px-wide screen, **Then** the page renders readably with proper text size, no horizontal scrolling, and navigable sections
2. **Given** a user who prints the ToS, **When** they use browser print, **Then** the output includes all content, removes navigation/branding chrome, and produces clean pages with proper margins

---

### Edge Cases

- What happens when a user accesses the ToS with JavaScript disabled? The page must render fully without JavaScript (pure HTML+CSS).
- What happens when a user deep-links to a specific section (e.g., `terms.html#refund-policy`)? The browser must scroll to the correct section.
- What happens when pricing changes between ToS versions? The versioned date and "Previous versions" link allow users to reference the version that was in effect during their purchase.
- What happens when a user with a screen reader accesses the ToS? All sections must have proper heading hierarchy, ARIA landmarks, and semantic HTML.
- What happens when the user's browser is in dark mode? The page must respect `prefers-color-scheme` and render appropriately.

## Requirements *(mandatory)*

### Functional Requirements

#### Document Structure & Deployment

- **FR-001**: The ToS MUST be a standalone HTML page at `packages/legal/terms.html`, separate from the marketing site at `packages/site/`
- **FR-002**: The ToS MUST render fully without JavaScript — pure HTML + CSS only
- **FR-003**: The total page weight (HTML + CSS) MUST be under 50KB
- **FR-004**: The ToS MUST use system fonts only — no external font loading (Georgia/serif for body, system sans-serif stack for headings/nav)
- **FR-005**: The ToS MUST be deployable to GitHub Pages at `https://phsb5321.github.io/VoxPage/legal/terms.html` alongside the existing marketing site
- **FR-006**: The `deploy-site.yml` GitHub Action MUST be updated to include `packages/legal/` in the deploy

#### Content Sections (20 required)

- **FR-007**: The ToS MUST contain all 20 sections as specified: (1) Introduction & Acceptance, (2) Definitions, (3) The Service, (4) Accounts & Registration, (5) Subscription Plans & Pricing, (6) Billing & Payment, (7) Credit Policy, (8) Refund Policy, (9) API Keys & BYOK, (10) Third-Party TTS Providers, (11) Acceptable Use, (12) Intellectual Property, (13) Open Source, (14) Privacy, (15) Disclaimers, (16) Limitation of Liability, (17) Indemnification, (18) Dispute Resolution, (19) Changes to Terms, (20) Contact
- **FR-008**: Every section MUST have an `id` attribute for deep-linking (e.g., `#introduction`, `#refund-policy`, `#credit-policy`)

#### Business Invariants

- **FR-009**: The ToS MUST state that the free tier never requires account creation (INV-001)
- **FR-010**: The ToS MUST state that BYOK is always available on all tiers (INV-002)
- **FR-011**: The ToS MUST state that word-level sync is always free (INV-003)
- **FR-012**: The ToS MUST state that credits never expire mid-billing cycle (INV-004)
- **FR-013**: The ToS MUST state that browser TTS is always unlimited (INV-005)
- **FR-014**: The ToS MUST state that cached content never re-charges credits (INV-006)

#### Pricing & Billing

- **FR-015**: The ToS MUST include the subscription pricing table matching current pricing: Free ($0), Basic ($4.99/mo, $39.99/yr, 100K chars), Pro ($14.99/mo, $119.99/yr, 300K chars), Multilingual ($19.99/mo, $159.99/yr, 300K chars), Team ($14.99/user/mo, 300K/user), Enterprise (custom)
- **FR-016**: The ToS MUST identify Paddle as the Merchant of Record for all payment processing
- **FR-017**: The ToS MUST state that prices may change with 30 days notice and that annual plans lock in pricing for 12 months

#### Credit Policy

- **FR-018**: The ToS MUST state credit rollover rules: Pro and above roll over up to 100K unused characters; Free and Basic have no rollover
- **FR-019**: The ToS MUST state that when credits are exhausted, the extension falls back to browser TTS or BYOK
- **FR-020**: The ToS MUST state that credits are non-transferable between accounts (except Team shared pool)

#### Refund Policy

- **FR-021**: The ToS MUST state: annual plans get full refund within 7 days; monthly plans get prorated refund for unused portion
- **FR-022**: The ToS MUST reference Paddle as the refund processing channel

#### Provider Obligations

- **FR-023**: The ToS MUST document OpenAI's requirement to disclose AI-generated voices to end listeners
- **FR-024**: The ToS MUST document ElevenLabs' restriction that free plans are non-commercial only
- **FR-025**: The ToS MUST list all supported providers (OpenAI, ElevenLabs, Groq, Cartesia, Google Cloud TTS, Browser) with links to their terms

#### Legal & Licensing

- **FR-026**: The ToS MUST explain the AGPL-3.0 license relationship and state that AGPL-3.0 prevails over the ToS in case of conflict for the extension source code
- **FR-027**: The ToS MUST set the governing law jurisdiction to Brazil
- **FR-028**: The ToS MUST set the minimum age requirement to 16 (to comply with GDPR for EU users)
- **FR-029**: The ToS MUST include a visible disclaimer noting this is not legal advice and recommending professional legal review

#### Accessibility & Design

- **FR-030**: The ToS MUST meet WCAG 2.1 AA standards: proper heading hierarchy (h1-h3), skip-nav link, semantic HTML, sufficient color contrast
- **FR-031**: The ToS MUST support dark/light mode via `prefers-color-scheme`
- **FR-032**: The ToS MUST include a `@media print` stylesheet producing clean paper output (no navigation, no sidebar, proper margins)
- **FR-033**: The ToS MUST include a sticky table of contents sidebar on desktop that collapses on mobile
- **FR-034**: The ToS MUST display the effective date and last-updated date prominently at the top, with a "Previous versions" link

#### Cross-References

- **FR-035**: The existing `packages/site/terms.html` MUST be updated to reference the standalone ToS as the authoritative version
- **FR-036**: The existing `TERMS_OF_SERVICE.md` MUST be updated to redirect to the standalone HTML ToS

### Key Entities

- **Terms Document**: The standalone HTML page containing all 20 sections, versioned by effective date
- **Legal CSS Stylesheet**: A minimal, purpose-built CSS file (`packages/legal/assets/css/legal.css`) for readable legal document styling
- **Business Invariants (INV-001 through INV-006)**: The 6 foundational rules that must be reflected in the terms

### Assumptions

- **Jurisdiction**: Brazil is the appropriate governing law jurisdiction, as VoxPage is developed in Recife, Brazil (confirmed by the marketing site footer: "Made with care in Recife, Brazil")
- **Age requirement**: 16+ is used to comply with GDPR (EU users require 16+ for digital services consent); this is the more conservative choice vs. 13+ under COPPA
- **Team tier**: The Team tier ($14.99/user) and Enterprise tier (custom) are included in the pricing table per the feature description, even though they are not yet on the marketing pricing page (they will be added when those features launch)
- **Paddle MoR model**: Paddle handles all payment processing, tax compliance, invoicing, and buyer terms. VoxPage's ToS references but does not duplicate Paddle's buyer terms
- **No business logic spec file exists**: The business rules are sourced from the pricing page (`packages/site/pricing.html`), the marketing terms page (`packages/site/terms.html`), and the feature description which provides authoritative pricing/credit/refund details
- **Provider terms research**: The agent will web-search for current OpenAI, ElevenLabs, Groq, Cartesia, and Google Cloud TTS terms during implementation rather than embedding potentially outdated URLs in the spec
- **GitHub Pages deployment**: The legal pages deploy alongside the marketing site at `https://phsb5321.github.io/VoxPage/legal/terms.html` (Option A from the feature description)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The ToS page renders all 20 sections completely without JavaScript in Firefox, Chrome, and Safari
- **SC-002**: Total page weight (HTML + inlined or linked CSS) is under 50KB
- **SC-003**: All 20 section headings have `id` attributes and respond correctly to deep-link navigation (e.g., `terms.html#refund-policy` scrolls to the correct section)
- **SC-004**: All 6 business invariants (INV-001 through INV-006) are explicitly stated in the document
- **SC-005**: Subscription pricing table matches the current pricing exactly (verified against the marketing pricing page)
- **SC-006**: Page passes WCAG 2.1 AA automated checks (heading hierarchy, color contrast, landmark regions, alt text)
- **SC-007**: Print stylesheet produces clean output without navigation elements, sidebar, or branding chrome
- **SC-008**: Dark mode and light mode both render with readable contrast when `prefers-color-scheme` changes
- **SC-009**: The ToS is publicly accessible at the deployed GitHub Pages URL without authentication
- **SC-010**: `deploy-site.yml` successfully deploys both `packages/site/` and `packages/legal/` to GitHub Pages
- **SC-011**: Paddle is identifiable as "Merchant of Record" by text search within the billing section
- **SC-012**: Each TTS provider has a link to their terms of service or usage policy page
