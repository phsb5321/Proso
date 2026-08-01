# Page Contracts: VoxPage Landing Page

**Feature**: `065-landing-page`
**Date**: 2026-02-16

This is a static site with no API endpoints. These contracts define what each page MUST contain (content sections, navigation elements, meta tags) to satisfy the functional requirements.

## Shared Page Contract (all pages)

Every page MUST include:

### Head
- `<meta charset="UTF-8">`
- `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
- `<meta name="description" content="...">` (page-specific, max 155 chars)
- `<meta property="og:title">`, `<meta property="og:description">`, `<meta property="og:image">`, `<meta property="og:url">`, `<meta property="og:type">`
- `<meta name="twitter:card" content="summary_large_image">`, `<meta name="twitter:title">`, `<meta name="twitter:description">`, `<meta name="twitter:image">`
- `<link rel="icon" type="image/png" href="...">` (favicon)
- `<link rel="canonical" href="...">`
- Google Fonts preconnect + Fraunces + Inter stylesheet
- Single CSS file `<link rel="stylesheet" href="assets/css/style.css">`

### Body Structure
- **Skip navigation link**: `<a href="#main" class="skip-link">Skip to content</a>`
- **Header**: `<header>` with logo, nav links (Features, Pricing, Privacy, Terms), install CTA button
- **Main**: `<main id="main">` with page-specific content
- **Footer**: `<footer>` with nav links (Features, Pricing, Privacy, Terms, GitHub/Commercial Licensing), copyright, "Made with care in Recife, Brazil"

### Accessibility
- Heading hierarchy: exactly one `<h1>` per page, followed by `<h2>`, `<h3>` in order
- All links have descriptive text (no "click here")
- `prefers-reduced-motion` media query disables animations
- `prefers-color-scheme` media query provides light mode
- `aria-label` on interactive elements where text is not self-explanatory

---

## index.html Contract

### Sections (in order)

1. **Hero** (`<section id="hero">`)
   - `<h1>` — Headline (e.g., "Listen to the web. Your way.")
   - `<p>` — Sub-headline explaining Firefox extension + AI voices + word-level sync
   - Primary CTA: `<a>` button linking to GitHub Releases .xpi
   - Secondary CTA: link to GitHub repo (if public) or pricing page
   - Visual: animated browser mockup with word-level highlighting demo
   - Static fallback for no-JS

2. **Trust Bar** (`<section id="trust" aria-label="Trust indicators">`)
   - Badge: "Open Source (AGPL-3.0)"
   - Badge: "Privacy First"
   - Badge: "2,800+ Tests"
   - Badge: "Built with TypeScript"
   - Badge: "Firefox 112+"

3. **Features** (`<section id="features">`)
   - `<h2>` — Section heading
   - 4 feature blocks, each with: icon/visual, `<h3>` title, `<p>` description
   - Features: Premium AI Voices, Word-Level Highlighting, Smart Text Extraction, Privacy by Design

4. **How It Works** (`<section id="how-it-works">`)
   - `<h2>` — Section heading
   - 3 steps with number, title, description
   - Steps: Install, Navigate, Listen

5. **Pricing Summary** (`<section id="pricing">`)
   - `<h2>` — Section heading
   - Monthly/Annual toggle (JS-enhanced, works without JS showing monthly by default)
   - 4 pricing cards with tier name, price, feature list, CTA button
   - BYOK callout box

6. **Comparison** (`<section id="comparison">`)
   - `<h2>` — Section heading
   - `<table>` with VoxPage vs Speechify vs NaturalReader
   - Accessible table with `<th scope>` attributes

7. **Open Source** (`<section id="open-source">`)
   - `<h2>` — Section heading
   - License info (AGPL-3.0)
   - Tech stack list
   - Contribution CTA
   - Commercial licensing link

### JSON-LD
- `<script type="application/ld+json">` with SoftwareApplication schema

---

## pricing.html Contract

### Sections (in order)

1. **Pricing Header** (`<section id="pricing-hero">`)
   - `<h1>` — "Simple, transparent pricing"
   - `<p>` — Sub-text about free tier being genuinely useful

2. **Pricing Cards** (`<section id="pricing-cards">`)
   - Monthly/Annual toggle
   - 4 pricing cards (identical structure to index.html pricing)
   - Enterprise callout with commercial@voxpage.com link

3. **BYOK Callout** (`<section id="byok">`)
   - `<h2>` — "Bring Your Own Key"
   - Explanation of BYOK concept
   - List of supported providers

4. **FAQ** (`<section id="faq">`)
   - `<h2>` — "Frequently Asked Questions"
   - 5 Q&A items using `<details>`/`<summary>` elements (works without JS)

---

## privacy.html Contract

### Sections (in order)

1. **Header** (`<section>`)
   - `<h1>` — "Privacy Policy"
   - Effective date, last updated date

2. **Extension Data Handling** (`<section>`)
   - `<h2>` — "How VoxPage Handles Your Data"
   - Explanation: text processed locally, API keys stored locally, audio sent only to selected provider

3. **Server-Side Data** (`<section>`)
   - `<h2>` — "Managed Credit Users"
   - What data the VoxPage server processes for paid subscribers
   - Data retention policy

4. **Cookies & Tracking** (`<section>`)
   - `<h2>` — "Cookies and Tracking"
   - Statement: zero cookies, zero tracking scripts, zero analytics on this website
   - Statement: extension collects no browsing data

5. **GDPR / Data Rights** (`<section>`)
   - `<h2>` — "Your Rights"
   - Right to access, rectify, delete data
   - Contact email for data requests

6. **Third-Party Services** (`<section>`)
   - `<h2>` — "Third-Party TTS Providers"
   - List of providers and links to their privacy policies

7. **Contact** (`<section>`)
   - Contact information for privacy inquiries

---

## terms.html Contract

### Sections (in order)

1. **Header** (`<section>`)
   - `<h1>` — "Terms of Service"
   - Effective date, last updated date

2. **License** (`<section>`)
   - `<h2>` — "License"
   - AGPL-3.0 for open source use
   - Commercial license reference

3. **Subscriptions** (`<section>`)
   - `<h2>` — "Subscription Terms"
   - Tier descriptions and pricing
   - Billing cycle (monthly/annual)
   - Auto-renewal terms

4. **Credits** (`<section>`)
   - `<h2>` — "Credit Policy"
   - Credit allocation per tier
   - No expiration mid-billing cycle (INV-004)
   - Rollover policy (Pro+: up to 100K chars)

5. **Refunds** (`<section>`)
   - `<h2>` — "Refund Policy"
   - 7-day full refund for annual plans
   - Prorated refund for monthly plans

6. **Usage Restrictions** (`<section>`)
   - Adapted from existing TERMS_OF_SERVICE.md sections 3-5

7. **API Keys & Third-Party Services** (`<section>`)
   - Adapted from existing TERMS_OF_SERVICE.md section 4-5

8. **Disclaimers & Liability** (`<section>`)
   - Adapted from existing TERMS_OF_SERVICE.md sections 6-8

9. **Changes & Contact** (`<section>`)
   - Adapted from existing TERMS_OF_SERVICE.md sections 10-14
