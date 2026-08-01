# Feature Specification: VoxPage Landing Page & Marketing Site

**Feature Branch**: `065-landing-page`
**Created**: 2026-02-16
**Status**: Draft
**Input**: User description: "Build a conversion-focused landing page for VoxPage for Paddle merchant verification and customer acquisition"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Paddle Merchant Verification (Priority: P1)

A VoxPage developer submits a website URL to Paddle during merchant verification. Paddle reviewers visit the URL and find a live website with pricing information, a privacy policy, and terms of service, confirming VoxPage is a legitimate product.

**Why this priority**: Without Paddle merchant verification, VoxPage cannot process paid subscriptions. This is a hard blocker for monetization. The site must exist with pricing, privacy, and terms pages at a publicly accessible URL.

**Independent Test**: Can be fully tested by visiting the deployed URL and verifying all four required pages (index, pricing, privacy, terms) load correctly with substantive content. Delivers: unblocks Paddle merchant onboarding.

**Acceptance Scenarios**:

1. **Given** the site is deployed to a public URL, **When** a Paddle reviewer visits the homepage, **Then** they see a professional product page with clear description of VoxPage's functionality
2. **Given** the site is deployed, **When** a Paddle reviewer navigates to the pricing page, **Then** they see clearly defined subscription tiers with prices (Free $0, Basic $4.99/mo, Pro $14.99/mo, Multilingual $19.99/mo)
3. **Given** the site is deployed, **When** a Paddle reviewer navigates to the privacy policy page, **Then** they find a substantive privacy policy covering data handling, GDPR, and cookie policy
4. **Given** the site is deployed, **When** a Paddle reviewer navigates to the terms of service page, **Then** they find substantive terms covering subscriptions, refunds, and usage restrictions

---

### User Story 2 - Prospective User Discovers VoxPage (Priority: P1)

A person searching for "text to speech browser extension" or "Firefox TTS extension" finds the VoxPage landing page via search engine. They quickly understand what VoxPage does, see the key differentiators (open source, BYOK, privacy-first, word-level highlighting), and are convinced to install the free version.

**Why this priority**: Customer acquisition is the primary purpose of the landing page after Paddle compliance. The page must clearly communicate VoxPage's value proposition and convert visitors to installs.

**Independent Test**: Can be tested by loading the homepage and confirming: (1) the product value proposition is communicated within 5 seconds of page load, (2) the install CTA is visible above the fold, (3) key features are presented clearly, (4) the page is fully functional without JavaScript.

**Acceptance Scenarios**:

1. **Given** a visitor lands on the homepage, **When** the page loads, **Then** they see a clear headline communicating VoxPage's core value, a sub-headline explaining it's a Firefox extension with AI voices and word-level sync, and a prominent "Install for Firefox" call-to-action button
2. **Given** a visitor scrolls down the homepage, **When** they reach the features section, **Then** they see at least 4 distinct feature blocks (premium AI voices, word-level highlighting, smart text extraction, privacy by design) each with a visual element
3. **Given** a visitor wants to install, **When** they click the "Install for Firefox" button, **Then** they are directed to the .xpi download (GitHub Releases) or the AMO listing
4. **Given** a visitor uses a screen reader, **When** they navigate the site, **Then** all content is accessible via keyboard, all images have alt text, all interactive elements have ARIA labels, and the site meets WCAG 2.1 AA

---

### User Story 3 - Visitor Evaluates Pricing (Priority: P2)

A prospective user who has seen the homepage wants to understand the cost before committing. They navigate to the pricing page, compare tiers, understand the BYOK option (bring your own API key for free on any tier), and decide which plan suits their needs.

**Why this priority**: Pricing transparency drives conversion. Users need to understand the free tier is genuinely useful and paid tiers offer clear value. This also satisfies Paddle's pricing requirement.

**Independent Test**: Can be tested by visiting the pricing page and confirming: all 4 tiers are displayed with correct prices, the BYOK concept is explained, FAQ answers common purchase questions, and monthly/annual toggle works.

**Acceptance Scenarios**:

1. **Given** a visitor navigates to the pricing page, **When** the page loads, **Then** they see 4 pricing tiers (Free, Basic, Pro, Multilingual) with monthly prices and feature lists matching the business model
2. **Given** a visitor on the pricing page, **When** they toggle between monthly and annual billing, **Then** the prices update to show annual pricing with ~33% discount
3. **Given** a visitor on the pricing page, **When** they read the BYOK callout, **Then** they understand they can use their own API keys for free on any tier
4. **Given** a visitor on the pricing page, **When** they scroll to the FAQ, **Then** they find answers to: credit exhaustion fallback, refund policy, free trial details, and credit rollover policy

---

### User Story 4 - Visitor Compares VoxPage to Competitors (Priority: P3)

A visitor evaluating TTS extensions wants to compare VoxPage against alternatives like Speechify and NaturalReader. The landing page provides an honest comparison highlighting VoxPage's unique advantages.

**Why this priority**: Comparison content is high-conversion for users actively shopping for a solution. It differentiates VoxPage on: open source, BYOK, privacy, free word-level sync, and Firefox-first support.

**Independent Test**: Can be tested by visiting the comparison section and confirming factual accuracy of claims and that VoxPage's differentiators are clearly highlighted.

**Acceptance Scenarios**:

1. **Given** a visitor scrolls to the comparison section, **When** they view the comparison table, **Then** they see an honest side-by-side of VoxPage vs Speechify vs NaturalReader covering: free tier, BYOK, open source, word-level sync, price, privacy, and Firefox support
2. **Given** a visitor reads the comparison, **When** they evaluate VoxPage's position, **Then** VoxPage's claims are factually accurate and the comparison is honest about limitations (Firefox-first, Chrome support secondary)

---

### User Story 5 - Developer/Contributor Discovers Open Source (Priority: P3)

A developer finds VoxPage and is interested in contributing or auditing the code. The landing page communicates the open-source nature, links to the GitHub repository (if public), and provides licensing information.

**Why this priority**: Open-source credibility is a core brand differentiator. Developers may become contributors, and the open-source messaging builds trust with privacy-conscious users.

**Independent Test**: Can be tested by visiting the open-source section and confirming: license info is present (AGPL-3.0), tech stack is mentioned, and contribution CTA is clear.

**Acceptance Scenarios**:

1. **Given** a developer visits the homepage, **When** they scroll to the open-source section, **Then** they see the AGPL-3.0 license, a "Built with" tech stack list, and either a link to the GitHub repo (if public) or a note about the license
2. **Given** a business evaluates VoxPage, **When** they look for commercial licensing, **Then** they find a link to commercial licensing information with contact email (commercial@voxpage.com)

---

### Edge Cases

- What happens when a visitor has JavaScript disabled? The site must be fully functional as a static HTML page with no JS required for core content. Only enhanced interactions (hero animation, pricing toggle, mobile menu) may require JS.
- How does the site handle visitors on mobile devices? All pages must be fully responsive with no horizontal scrolling, readable text sizes, and touch-friendly interactive elements (44x44px minimum targets).
- What happens when the .xpi download link is broken or the release hasn't been published yet? The install CTA should link to the latest GitHub Release page, which gracefully shows "no releases" if none exist.
- How does the site behave with `prefers-reduced-motion`? All animations and transitions must be disabled or simplified when the user has requested reduced motion.
- How does the site handle `prefers-color-scheme: light`? The site defaults to dark mode but must respect the user's system preference and provide a readable light mode.
- What if the GitHub repo is private? The "View on GitHub" link should either be omitted or link to the public-facing release page, not the private repo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Site MUST include four pages: landing page (index), pricing, privacy policy, and terms of service
- **FR-002**: Landing page MUST display a hero section with headline, sub-headline, install CTA, and a visual demonstration of the product
- **FR-003**: Landing page MUST include a features section presenting at least 4 key features (premium AI voices, word-level highlighting, smart text extraction, privacy by design) with visual elements
- **FR-004**: Landing page MUST include a "how it works" section with 3 clear steps (install, navigate, listen)
- **FR-005**: Landing page MUST include a pricing summary section matching the business model tiers
- **FR-006**: Landing page MUST include a comparison section contrasting VoxPage with at least 2 competitors (Speechify, NaturalReader) on factual criteria
- **FR-007**: Landing page MUST include an open-source section with license info, tech stack, and contribution/commercial licensing links
- **FR-008**: Landing page MUST include a trust bar/social proof section with badges for: open source, privacy, test count, Firefox compatibility
- **FR-009**: Pricing page MUST display all 4 subscription tiers (Free $0, Basic $4.99/mo, Pro $14.99/mo, Multilingual $19.99/mo) with feature breakdowns
- **FR-010**: Pricing page MUST provide a monthly/annual billing toggle showing ~33% annual discount
- **FR-011**: Pricing page MUST include a BYOK (Bring Your Own Key) explanation callout
- **FR-012**: Pricing page MUST include an FAQ section addressing: credit exhaustion, API key usage, free trial, refund policy, credit rollover
- **FR-013**: Pricing page MUST include enterprise/commercial licensing contact (commercial@voxpage.com)
- **FR-014**: Privacy policy page MUST cover: data handling (extension processes text locally), API key storage (local only), server-side data handling for managed credits, GDPR/data deletion rights, cookie policy (zero cookies)
- **FR-015**: Terms of service page MUST cover: license terms (AGPL-3.0), subscription terms, refund policy (7 days for annual, prorated for monthly), credit policies (no expiration mid-billing cycle per INV-004), usage restrictions
- **FR-016**: All pages MUST have consistent navigation (header with links to all pages, footer with navigation, legal links, and site information)
- **FR-017**: The "Install for Firefox" CTA MUST link to the latest .xpi download (GitHub Releases page or direct .xpi URL)
- **FR-018**: The hero section MUST include an animated visual demonstration of VoxPage's word-level highlighting feature (with static fallback for no-JS)
- **FR-019**: Site MUST be fully functional without JavaScript - all content readable, all navigation working, all pages accessible
- **FR-020**: Site MUST include proper SEO elements: semantic HTML5, Open Graph meta tags, Twitter Card meta tags, JSON-LD structured data (SoftwareApplication schema), meta descriptions, robots.txt, sitemap.xml
- **FR-021**: Site MUST include a skip-navigation link for keyboard/screen reader users
- **FR-022**: Site MUST respect `prefers-reduced-motion` by disabling or simplifying all animations
- **FR-023**: Site MUST support both dark mode (default) and light mode, respecting `prefers-color-scheme`
- **FR-024**: Site MUST use zero cookies and zero external tracking scripts
- **FR-025**: Site MUST be deployable as a static site with no server-side rendering and no build step required
- **FR-026**: Site MUST be hosted at a publicly accessible URL suitable for Paddle merchant verification
- **FR-027**: Site MUST include appropriate favicon and Open Graph image (1200x630) for social sharing

### Key Entities

- **Subscription Tier**: Represents a pricing plan with: name, monthly price, annual price, feature set, character credit allocation, included providers
- **Page**: A distinct URL-addressable document on the site (index, pricing, privacy, terms) with: title, meta description, content sections, navigation
- **Feature**: A product capability displayed on the landing page with: name, description, visual element, differentiator status
- **Competitor Comparison**: A factual comparison point between VoxPage and a competitor with: category, VoxPage value, competitor value, source/verification

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All four pages (index, pricing, privacy, terms) are accessible at public URLs and return valid content within 2 seconds
- **SC-002**: Site achieves 95+ scores across Performance, Accessibility, Best Practices, and SEO audits
- **SC-003**: Total page weight for any single page is under 500KB including all fonts, images, and scripts
- **SC-004**: First Contentful Paint is under 1 second on a standard broadband connection
- **SC-005**: Site passes WCAG 2.1 AA accessibility audit with zero critical or serious violations
- **SC-006**: All pages are fully readable and navigable with JavaScript disabled
- **SC-007**: Site renders correctly on mobile (320px), tablet (768px), and desktop (1280px) viewports with no horizontal scrolling
- **SC-008**: Pricing page accurately displays all 4 tiers with correct prices matching the business model ($0, $4.99/mo, $14.99/mo, $19.99/mo)
- **SC-009**: Privacy policy and terms of service contain substantive legal content (not placeholder text) sufficient for Paddle merchant verification
- **SC-010**: Site contains zero cookies, zero external tracking scripts, and zero third-party analytics
- **SC-011**: Open Graph meta tags render correctly when the URL is shared on social platforms (correct title, description, and image)
- **SC-012**: Hero animation runs smoothly and is completely disabled when the user has requested reduced motion
- **SC-013**: Install CTA links to a valid Firefox extension download URL
- **SC-014**: Site is deployed and accessible at a public URL that can be submitted to Paddle for merchant verification

### Assumptions

- The VoxPage GitHub repository is private, so static site hosting will require either a separate public repository or an alternative hosting approach. A separate public repository is the assumed deployment approach.
- The subscription pricing tiers described in the feature request ($0 Free, $4.99 Basic, $14.99 Pro, $19.99 Multilingual monthly) are the confirmed business model. Annual pricing applies a ~33% discount.
- The existing `TERMS_OF_SERVICE.md` and `COMMERCIAL.md` in the repository provide the legal foundation, which will be adapted and expanded for the web pages with subscription-specific terms.
- No custom domain (voxpage.app/voxpage.com) is available initially. The site will use a free hosting URL for initial Paddle verification.
- The site will be developed as a package within the existing monorepo (`packages/site/`) and deployed via CI to the hosting platform.
- The .xpi install link will point to the GitHub Releases page, which may show "no releases" if no signed release exists yet.
- Paid tier CTAs will show "Coming Soon" until Paddle integration is complete.
- The site uses no build step - pure HTML, CSS, and vanilla JavaScript. No npm dependencies for the site package itself.

### Constraints

- **C-001**: Pure HTML/CSS/JS only - no frameworks, no build tools, no npm dependencies
- **C-002**: Static hosting compatible - static files only, no server-side rendering
- **C-003**: Zero cookies, zero external tracking - consistent with VoxPage's privacy-first brand
- **C-004**: AGPL-3.0 licensed - site code is part of the monorepo under the same license
- **C-005**: Under 500KB total page weight per page - performance is a brand value
- **C-006**: WCAG 2.1 AA minimum - this is a TTS/accessibility product
- **C-007**: Dark mode default - matches the extension's UI aesthetic
- **C-008**: Firefox-first messaging - stated proudly as a differentiator, not a limitation

### Dependencies

- **DEP-001**: Hosting account with ability to serve static files at a public URL
- **DEP-002**: Extension icons available at `packages/extension/public/icons/` (confirmed: 16, 32, 48, 96, 128 PNG)
- **DEP-003**: Existing legal documents (`TERMS_OF_SERVICE.md`, `COMMERCIAL.md`) provide foundation for web legal pages
- **DEP-004**: Confirmed pricing tiers from the business model for accurate pricing page content
