# Research: Standalone Terms of Service

**Feature**: 066-standalone-tos
**Date**: 2026-02-16

## R1: TTS Provider Terms & Obligations

### Decision
Document each provider's key user-facing obligations with links to current terms.

### Findings

| Provider | Terms URL | Commercial Use | Key Obligation |
| --- | --- | --- | --- |
| OpenAI | [Usage Policies](https://openai.com/policies/usage-policies/) | Allowed | **MUST disclose AI-generated voices** to end listeners |
| ElevenLabs | [Service-Specific Terms](https://elevenlabs.io/service-specific-terms) | Paid plans only | **Free plan = non-commercial only**; must attribute "elevenlabs.io" if publishing |
| Groq | [Services Agreement](https://console.groq.com/docs/legal/services-agreement) | Allowed | No key trading; comply with rate limits; customer data remains customer property |
| Cartesia | [Terms of Service](https://cartesia.ai/legal/terms.html) | Paid plans only | **Free tier = non-commercial only**; voice consent required; no impersonation |
| Google Cloud TTS | [APIs Terms](https://developers.google.com/terms) | Allowed | Standard GCP compliance; subject to usage quotas |
| Browser (native) | N/A | N/A | No restrictions (client-side only) |

### New Finding: Cartesia Free Tier Restriction
The spec's FR-024 only mentions ElevenLabs' non-commercial restriction. Research reveals Cartesia also restricts free tier to non-commercial use. The ToS should document both.

### Alternatives Considered
- Embedding full provider terms text: Rejected (would become stale, legally risky)
- Summarizing only critical obligations: Chosen (links to source for full terms)

---

## R2: Paddle Merchant of Record Requirements

### Decision
Include Paddle's recommended MoR attribution language and link to Paddle's Checkout Buyer Terms.

### Findings

**Required Language** (from Paddle documentation):
> "Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries and handles returns."

**Key Requirements**:
1. Identify Paddle as Merchant of Record in the billing section
2. Link to [Paddle Checkout Buyer Terms](https://www.paddle.com/legal/checkout-buyer-terms) — buyers must accept both VoxPage's ToS and Paddle's buyer terms
3. State that Paddle handles: payment processing, tax compliance, invoicing, refunds, chargebacks
4. Paddle's standard refund window is 14 days (VoxPage spec says 7 days for annual — this is more restrictive, which is acceptable since Paddle enforces the seller's stated policy)
5. Paddle may charge sellers $20-40 per chargeback
6. Chargebacks are raised against Paddle (not VoxPage), but Paddle passes along the cost

**Refund Policy Alignment**:
- VoxPage spec: 7-day full refund for annual, prorated for monthly
- Paddle default: 14-day window for subscriptions
- Resolution: VoxPage's 7-day policy is more restrictive than Paddle's default. This is permitted — sellers can set their own refund policy. Paddle enforces whatever the seller specifies.

### Alternatives Considered
- Using Paddle's 14-day default: Rejected (spec explicitly states 7-day for annual plans)
- Handling payments directly (no MoR): Rejected (Paddle eliminates tax compliance burden)

---

## R3: Minimum Age Requirement

### Decision
Keep 16+ as specified in the spec. This is the most conservative choice that provides maximum global compliance without jurisdiction-specific age logic.

### Findings

| Jurisdiction | Minimum Age | Notes |
| --- | --- | --- |
| GDPR (EU) default | 16 | Member states can lower to 13 |
| COPPA (US) | 13 | Applies to children under 13 |
| LGPD (Brazil) | 18 (with parental consent) | Digital ECA (Sept 2025) extends protections to 18 |
| Industry standard | 13 | Most SaaS products use 13+ |

**Analysis**:
- Using 13+ (industry standard) would cover COPPA and most GDPR member states but not the GDPR default of 16
- Using 16+ covers GDPR default without needing per-country age logic
- Brazil's LGPD technically requires parental consent for under-18, but VoxPage collects minimal personal data for free tier users (zero data collection)
- For paid subscribers, VoxPage only collects email and subscription status

**Rationale for 16+**:
- Simpler than jurisdiction-specific logic (13+ with parental consent for some regions)
- Covers the GDPR default without needing to track which EU member states lowered the threshold
- For a SaaS with paid subscriptions and credit card processing, 16+ is a reasonable and defensible threshold
- VoxPage's free tier requires no account and collects no data, making age verification moot for most users

### Alternatives Considered
- 13+ with jurisdiction-specific language: Rejected (complexity, minimal benefit for a TTS tool)
- 18+ (most conservative): Rejected (unnecessarily restrictive, would exclude many legitimate users)

---

## R4: Deploy Workflow Integration

### Decision
Add a pre-deploy step to copy `packages/legal/` into the site publish directory.

### Findings

**Current deploy-site.yml**:
- Triggers on push to `main` when `packages/site/**` changes
- Publishes `packages/site/` to `phsb5321/voxpage-site` repo via `peaceiris/actions-gh-pages@v4`
- Uses `SITE_DEPLOY_TOKEN` personal token
- Deployed URL: `https://phsb5321.github.io/voxpage-site/`

**Integration approach**:
1. Add `packages/legal/**` to the trigger paths
2. Add a step before deploy to copy `packages/legal/` → `packages/site/legal/`
3. The legal pages will be accessible at `https://phsb5321.github.io/voxpage-site/legal/terms.html`
4. The `keep_files: false` setting means every deploy replaces the entire site — so legal pages must be copied every time

**Why copy instead of changing publish_dir**:
- Changing `publish_dir` to a parent directory would include unwanted files
- Copying into the site directory keeps the deploy simple and self-contained
- The site's existing CSS/assets remain undisturbed; legal pages have their own CSS

### Alternatives Considered
- Separate deploy workflow for legal pages: Rejected (adds complexity, potential for sites to be out of sync)
- Merging legal CSS into site CSS: Rejected (legal pages should be self-contained and independent)
- Separate GitHub Pages repo for legal: Rejected (unnecessary infrastructure)

---

## R5: Brazilian Dispute Resolution

### Decision
Use Brazilian law as governing law with arbitration through Câmara de Mediação e Arbitragem (or equivalent).

### Findings

- VoxPage is developed in Recife, Brazil (confirmed by site footer)
- Brazilian Consumer Protection Code (CDC) applies to B2C relationships
- CDC allows arbitration but consumer can always choose to go to their local court (this is a consumer right that cannot be waived by contract)
- Class action waiver is generally not enforceable in Brazil under CDC
- For international users: the ToS can specify Brazilian law and forums, but users in the EU may have mandatory consumer protection in their home jurisdiction

**ToS approach**:
- Set governing law to Brazil
- Specify good-faith negotiation (30 days) as first step
- Allow arbitration as an option, but acknowledge that consumers may have mandatory local jurisdiction rights
- Do NOT include a class action waiver (not enforceable in Brazil, and questionable in EU)

### Alternatives Considered
- US (Delaware) jurisdiction: Rejected (developer is in Brazil)
- No arbitration clause: Considered but rejected (arbitration is standard for SaaS ToS)
- Mandatory arbitration with class waiver: Rejected (not enforceable under Brazilian CDC)
