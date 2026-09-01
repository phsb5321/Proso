# Proso Pre-Launch Checklist

A comprehensive checklist for launching Proso as a commercial browser extension product.

**Last Updated**: 2026-08-31
**Current License**: AGPL-3.0-or-later — root text, package metadata, public terms, and AMO listing agree

---

## Legend

| Symbol | Meaning |
|--------|---------|
| **[MUST]** | Required for launch - cannot ship without this |
| **[SHOULD]** | Strongly recommended for MVP launch |
| **[NICE]** | Can add post-launch |

| Effort | Meaning |
|--------|---------|
| S | Small (< 1 day) |
| M | Medium (1-3 days) |
| L | Large (3-7 days) |
| XL | Extra Large (1-2 weeks) |

---

## 1. Legal Requirements

### Privacy Policy

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Create Privacy Policy document | **[MUST]** | M | None | [x] |
| GDPR compliance sections (EU users) | **[MUST]** | M | Privacy Policy | [x] |
| CCPA/CPRA compliance (California users) | **[MUST]** | M | Privacy Policy | [ ] |
| Global Privacy Control (GPC) signal support | **[SHOULD]** | S | None | [ ] |
| "Do Not Sell/Share" link implementation | **[MUST]** | S | Privacy Policy | [ ] |
| Data retention periods disclosure | **[MUST]** | S | Privacy Policy | [x] |
| Third-party data sharing disclosure (TTS APIs) | **[MUST]** | S | Privacy Policy | [x] |
| Cookie/storage policy | **[SHOULD]** | S | Privacy Policy | [x] |
| Host Privacy Policy on website | **[MUST]** | S | Website, Privacy Policy | [x] |

**Key Requirements**:
- [Chrome Extensions Requirements](https://www.privacypolicies.com/blog/chrome-extensions-requirements-privacy-policy-secure-handling/) require a privacy policy if collecting ANY data
- [CCPA 2025](https://secureprivacy.ai/blog/ccpa-privacy-policy-requirements-2025) requires specific timeframes for data retention
- Penalties: Up to $7,988 per intentional CCPA violation
- Firefox [requires manifest.json disclosure](https://blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/) of data collection (Nov 2025+)

### Terms of Service

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Create Terms of Service document | **[MUST]** | M | Business entity | [x] |
| Acceptable use policy | **[MUST]** | S | ToS | [x] |
| Refund/cancellation policy | **[MUST]** | S | ToS, Payment setup | [x] |
| Limitation of liability | **[MUST]** | S | ToS | [x] |
| Intellectual property terms | **[MUST]** | S | ToS | [x] |
| Dispute resolution clause | **[SHOULD]** | S | ToS | [x] |
| Age requirements (13+/16+/18+) | **[SHOULD]** | S | ToS | [x] |

### License Selection

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| **RESOLVE LICENSE CONFLICT** | **[MUST]** | S | None | [x] |
| Choose final license (AGPL-3.0-or-later) | **[MUST]** | S | Business decision | [x] |
| Update package.json license field | **[MUST]** | S | License choice | [x] |
| Update LICENSE file if needed | **[MUST]** | S | License choice | [x] |
| Add license headers to source files | **[NICE]** | M | License choice | [ ] |

**Current Conflict**:
- `/LICENSE` file: GPL-3.0 (copyleft - requires derivative works to be GPL)
- `package.json`: MIT (permissive - allows proprietary derivatives)

**License Considerations**:
- [GPL-3.0](https://fossa.com/learn/open-source-licenses/): Strong copyleft, requires source disclosure for distributed derivatives
- [MIT](https://choosealicense.com/licenses/): Permissive, allows commercial use and proprietary derivatives
- [MPL-2.0](https://fossa.com/blog/open-source-software-licenses-101-mozilla-public-license-2-0/): Weak copyleft, file-level copyleft only (Mozilla's choice)

### API Provider Compliance

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| OpenAI API compliance review | **[MUST]** | S | None | [ ] |
| Add AI-generated voice disclosure in UI | **[MUST]** | S | None | [ ] |
| ElevenLabs commercial license verification | **[MUST]** | S | None | [ ] |
| Groq API terms review | **[SHOULD]** | S | None | [ ] |
| Cartesia API terms review | **[SHOULD]** | S | None | [ ] |
| Document API terms in user-facing docs | **[SHOULD]** | S | All API reviews | [ ] |

**Critical Requirements**:
- [OpenAI TTS](https://openai.com/policies/usage-policies/): **MUST disclose AI-generated voice to end users**
- [ElevenLabs](https://elevenlabs.io/terms-of-use): Free plan = non-commercial only; Paid plan = commercial allowed
- Users with free ElevenLabs accounts cannot use Proso commercially

### Trademark

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Trademark search for "Proso" | **[SHOULD]** | S | None | [ ] |
| Register trademark (if clear) | **[NICE]** | M | Trademark search, Business entity | [ ] |
| Domain registration (proso.com.br etc.) | **[SHOULD]** | S | None | [ ] |

---

## 2. Technical Requirements

### Extension Store Compliance

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Chrome Web Store developer account ($5) | **[MUST]** | S | None | [ ] |
| Firefox Add-ons developer account (free) | **[MUST]** | S | None | [x] |
| Manifest V3 compliance (Chrome) | **[MUST]** | - | Already done | [x] |
| Single-purpose policy compliance | **[MUST]** | S | None | [x] |
| Minimum permissions audit | **[MUST]** | M | None | [x] |
| Store listing assets (icons, screenshots) | **[MUST]** | M | None | [x] |
| Clear extension description | **[MUST]** | S | None | [x] |
| Privacy policy URL in developer dashboard | **[MUST]** | S | Privacy Policy | [x] |
| Firefox data_collection_permissions manifest | **[MUST]** | S | None | [x] |
| Source code submission (Firefox) | **[MUST]** | S | Clean build process | [x] |

**Firefox listing state (31/08/2026):** version 1.2.9, product metadata, privacy policy, custom AGPL-3.0-or-later text, icon, four screenshots, reviewer notes, and complete corresponding source are submitted with 0 validation errors. AMO status is **Awaiting Review**; store approval remains unchecked in the launch section until the anonymous public oracle passes.

**Chrome Web Store Requirements**:
- [$5 one-time registration fee](https://www.extensionradar.com/blog/how-to-make-chrome-extension)
- Review: 1-3 business days (complex extensions may take longer)
- [Quality Guidelines](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq): Single purpose, minimal permissions

**Firefox Add-ons Requirements**:
- [Mozilla signing required](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)
- Source code must be provided for review
- [Data collection disclosure](https://blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/) required in manifest (Nov 2025)

### Security Audit

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Permission minimization review | **[MUST]** | M | None | [ ] |
| No dynamic code execution functions | **[MUST]** | S | Audit | [ ] |
| Content Security Policy review | **[MUST]** | S | None | [ ] |
| Input validation/sanitization audit | **[MUST]** | M | None | [ ] |
| Message validation between contexts | **[MUST]** | M | None | [ ] |
| HTTPS-only external communications | **[MUST]** | S | Audit | [ ] |
| API key storage security review | **[MUST]** | M | None | [ ] |
| Dependency vulnerability scan (npm audit) | **[MUST]** | S | None | [ ] |
| No hardcoded secrets in source | **[MUST]** | S | Audit | [ ] |
| Third-party library audit | **[SHOULD]** | M | None | [ ] |

### Performance

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Memory usage benchmarks | **[SHOULD]** | M | None | [ ] |
| CPU usage during playback | **[SHOULD]** | M | None | [ ] |
| Storage quota management | **[SHOULD]** | S | None | [ ] |
| Startup time benchmarks | **[NICE]** | S | None | [ ] |
| Network request optimization | **[NICE]** | M | None | [ ] |

### Error Tracking and Monitoring

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Error tracking service selection | **[SHOULD]** | S | None | [ ] |
| Sentry/Rollbar/BugSnag integration | **[SHOULD]** | M | Service selection | [ ] |
| User consent for error reporting | **[MUST]** | S | Error tracking, Privacy Policy | [ ] |
| Error grouping and alerting setup | **[SHOULD]** | M | Error tracking | [ ] |
| Performance monitoring | **[NICE]** | M | Error tracking | [ ] |

**Options**:
- [Sentry](https://sentry.io): Industry standard, good browser extension support
- [BugSnag](https://www.bugsnag.com): Mobile-first, good for extensions
- [Rollbar](https://rollbar.com): Flexible pricing, AI-assisted debugging
- [Better Stack](https://betterstack.com): [83% cheaper than Sentry](https://betterstack.com/community/comparisons/sentry-alternatives/), Sentry SDK compatible

### Analytics

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Privacy-respecting analytics selection | **[SHOULD]** | S | None | [ ] |
| Feature usage tracking | **[SHOULD]** | M | Analytics | [ ] |
| Conversion funnel tracking | **[SHOULD]** | M | Analytics, Payment | [ ] |
| User consent mechanism | **[MUST]** | S | Privacy Policy | [ ] |

**Options**: Plausible, Fathom, Simple Analytics (all privacy-focused)

### Payment Integration

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Payment provider selection | **[MUST]** | S | Business entity | [ ] |
| Stripe/Paddle integration | **[MUST]** | L | Provider selection | [ ] |
| License key generation/validation | **[MUST]** | L | Payment integration | [ ] |
| Subscription management backend | **[MUST]** | L | Payment integration | [ ] |
| Webhook handling for payment events | **[MUST]** | M | Payment integration | [ ] |
| Grace period for failed payments | **[SHOULD]** | M | Payment integration | [ ] |
| Invoice/receipt generation | **[SHOULD]** | M | Payment integration | [ ] |

**Provider Comparison**:
| Provider | Pros | Cons |
|----------|------|------|
| [Stripe](https://stripe.com) | Lower fees (~2.9%), more control, flexible | You handle tax compliance |
| [Paddle](https://www.paddle.com) | Merchant of Record, handles VAT/taxes | Higher fees (~5-7%), weekly payouts |
| [ExtensionPay](https://extensionpay.com) | Built for browser extensions | Less flexible |
| [Lemon Squeezy](https://lemonsqueezy.com) | MoR, simple setup | Newer, less proven |

**Chrome Web Store Note**: [Built-in payments deprecated](https://www.extensionradar.com/blog/how-to-monetize-chrome-extension) - must use external payment provider

---

## 3. Business Operations

### Business Entity

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Decide on entity type (LLC/Corp) | **[MUST]** | S | None | [ ] |
| Form business entity | **[MUST]** | M | Entity decision | [ ] |
| Obtain EIN (US) | **[MUST]** | S | Business entity | [ ] |
| Business bank account | **[MUST]** | S | EIN | [ ] |
| Register for state taxes | **[SHOULD]** | M | Business entity | [ ] |

**Entity Considerations**:
- Single-Member LLC: Simple, pass-through taxation, self-employment tax on all profits
- S-Corp election: Tax savings when profits > $40-60K/year (split salary/distributions)
- Many states (e.g., California) charge $800+ minimum franchise tax

### Tax Compliance

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| US sales tax nexus assessment | **[MUST]** | M | None | [ ] |
| Tax automation service selection | **[SHOULD]** | S | None | [ ] |
| VAT/GST registration (if >threshold) | **[SHOULD]** | M | International sales | [ ] |
| EU VAT One-Stop Shop (OSS) | **[SHOULD]** | M | EU customers | [ ] |
| Tax compliance software integration | **[SHOULD]** | M | Payment integration | [ ] |

**Key Facts**:
- [SaaS taxable in 25 US states](https://www.paddle.com/blog/saas-sales-tax-state-wide-and-international) as of March 2025
- [110+ countries apply VAT to digital services](https://www.anrok.com/vat-software-digital-services)
- Non-compliance costs [~5% of revenue](https://www.commenda.io/sales-tax/10-best-sales-tax-software-for-saas-businesses/)
- Using Paddle/Lemon Squeezy as MoR eliminates most tax compliance burden

**Tax Software Options**: [Avalara](https://www.avalara.com), [Anrok](https://www.anrok.com), [Quaderno](https://quaderno.io), [Stripe Tax](https://stripe.com/tax)

### Customer Support

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Support email setup | **[MUST]** | S | Domain | [x] |
| Help desk software selection | **[SHOULD]** | S | None | [ ] |
| Ticket management system | **[SHOULD]** | M | Help desk | [ ] |
| Response time SLA definition | **[SHOULD]** | S | None | [ ] |
| Support documentation | **[MUST]** | M | None | [ ] |

**Options**: Zendesk, Freshdesk, Help Scout, Crisp (all have free tiers)

### Refund Policy

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Define refund policy (30-day recommended) | **[MUST]** | S | None | [ ] |
| Implement refund workflow | **[MUST]** | M | Payment integration | [ ] |
| Document refund process | **[MUST]** | S | Refund policy | [ ] |
| Pro-rata vs full refund decision | **[SHOULD]** | S | None | [ ] |

**Best Practice**: [30-day no-questions-asked refunds](https://www.extensionradar.com/blog/how-to-monetize-chrome-extension) build goodwill and reduce chargebacks

---

## 4. Marketing Preparation

### Landing Page

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Landing page design | **[MUST]** | L | Domain | [ ] |
| Hero section with clear value prop | **[MUST]** | M | Design | [ ] |
| Feature highlights | **[MUST]** | M | Design | [ ] |
| Pricing section | **[MUST]** | M | Pricing decision | [ ] |
| Social proof section | **[SHOULD]** | M | Beta feedback | [ ] |
| CTA buttons (Install/Try Free) | **[MUST]** | S | Store listings | [ ] |
| Mobile optimization | **[MUST]** | M | Landing page | [ ] |
| Page speed optimization (<3s load) | **[SHOULD]** | M | Landing page | [ ] |
| SEO basics (meta tags, sitemap) | **[SHOULD]** | S | Landing page | [ ] |

**Landing Page Best Practices (2025)**:
- [Headlines above fold](https://www.involve.me/blog/landing-page-best-practices) with clear value proposition
- [No navigation links](https://thrivethemes.com/must-have-google-chrome-extensions/) - focus on conversion
- [Social proof](https://www.landing.so/articles/what-is-a-landing-page-complete-2025-guide-best-practises): "Join X users" messaging
- Average SaaS landing page conversion: [3.8%](https://www.involve.me/blog/landing-page-best-practices)

### Documentation

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Getting started guide | **[MUST]** | M | None | [ ] |
| Feature documentation | **[MUST]** | L | None | [ ] |
| API key setup guides (per provider) | **[MUST]** | M | None | [ ] |
| FAQ section | **[MUST]** | M | Beta feedback | [ ] |
| Troubleshooting guide | **[SHOULD]** | M | Beta feedback | [ ] |
| Video tutorials | **[NICE]** | L | Documentation | [ ] |

### Promotional Materials

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Store listing screenshots | **[MUST]** | M | None | [x] |
| Extension icon (128x128 PNG) | **[MUST]** | S | None | [x] |
| Promotional tile images | **[SHOULD]** | M | None | [ ] |
| Demo video (60-90 seconds) | **[SHOULD]** | L | None | [ ] |
| GIF demonstrations | **[NICE]** | M | None | [ ] |
| Press kit | **[NICE]** | M | All assets | [ ] |

### Social Media

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Twitter/X account | **[SHOULD]** | S | None | [ ] |
| Product Hunt preparation | **[SHOULD]** | M | Launch date | [ ] |
| Reddit presence (relevant subreddits) | **[NICE]** | S | None | [ ] |
| Discord/community server | **[NICE]** | M | None | [ ] |

---

## 5. User Experience

### Onboarding

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| First-run welcome experience | **[MUST]** | M | None | [ ] |
| API key setup wizard | **[MUST]** | M | None | [ ] |
| Quick start tour | **[SHOULD]** | M | None | [ ] |
| Sample/demo content | **[NICE]** | S | None | [ ] |
| Progress indicators | **[NICE]** | S | None | [ ] |

### Freemium/Trial Mechanics

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Define free tier limits | **[MUST]** | S | Pricing strategy | [ ] |
| Trial duration decision (7/14/30 days) | **[MUST]** | S | None | [ ] |
| Feature gating implementation | **[MUST]** | L | Payment integration | [ ] |
| Usage tracking for limits | **[MUST]** | M | None | [ ] |
| Clear upgrade prompts | **[MUST]** | M | Payment integration | [ ] |
| Trial expiration notifications | **[SHOULD]** | M | Trial system | [ ] |

**Conversion Benchmarks**:
- [Freemium: 2.6-2.8%](https://www.custify.com/blog/free-trial-conversion-rate/) average conversion
- [Opt-out trial (card required): 48.8%](https://www.custify.com/blog/free-trial-conversion-rate/) conversion
- [Opt-in trial (no card): 18.2%](https://www.custify.com/blog/free-trial-conversion-rate/) conversion
- [Good freemium+sales: 5-7%](https://www.lennysnewsletter.com/p/what-is-a-good-free-to-paid-conversion); Great: 10-15%

**Freemium Strategy Tips**:
- [Balance free/premium](https://fastspring.com/blog/8-strategies-for-converting-free-trials-users-into-paying-customers/): Free must be useful enough to hook, limited enough to upgrade
- [30-day trials](https://amplitude.com/blog/increasing-free-trial-conversion) work well for habit-forming products
- [Reverse trial](https://productled.com/blog/how-to-improve-free-trial-to-paid-conversion-rate): Premium during trial, downgrade to free after

### Account Management

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Account creation flow | **[MUST]** | M | Backend | [ ] |
| Login/logout functionality | **[MUST]** | M | Account creation | [ ] |
| Password reset flow | **[MUST]** | M | Account creation | [ ] |
| Subscription status display | **[MUST]** | S | Payment integration | [ ] |
| Plan upgrade/downgrade flow | **[MUST]** | M | Payment integration | [ ] |
| Cancel subscription flow | **[MUST]** | M | Payment integration | [ ] |
| Data export (GDPR requirement) | **[MUST]** | M | None | [ ] |
| Account deletion (GDPR requirement) | **[MUST]** | M | None | [ ] |

### Cancellation Flow

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Clear cancellation path (no dark patterns) | **[MUST]** | S | Account management | [ ] |
| Cancellation survey | **[SHOULD]** | S | Cancellation flow | [ ] |
| Win-back offer option | **[NICE]** | M | Cancellation flow | [ ] |
| Downgrade to free tier option | **[SHOULD]** | M | Cancellation flow | [ ] |
| Grace period after cancellation | **[SHOULD]** | S | Cancellation flow | [ ] |

---

## 6. Quality Assurance

### Beta Testing

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Beta signup landing page | **[SHOULD]** | M | Website | [ ] |
| Beta user recruitment (50-100 users) | **[SHOULD]** | M | Beta page | [ ] |
| Feedback collection mechanism | **[MUST]** | M | None | [ ] |
| Beta user communication channel | **[SHOULD]** | S | None | [ ] |
| Bug reporting system | **[MUST]** | M | None | [ ] |
| Beta changelog/updates | **[SHOULD]** | S | None | [ ] |

### Security Testing

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Automated security scanning | **[SHOULD]** | M | CI/CD | [ ] |
| Dependency vulnerability scanning | **[MUST]** | S | None | [ ] |
| Manual security review | **[SHOULD]** | L | None | [ ] |
| Bug bounty program (post-launch) | **[NICE]** | M | Launch | [ ] |
| Penetration testing | **[NICE]** | XL | None | [ ] |

### Cross-Browser Testing

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Firefox testing (primary) | **[MUST]** | M | None | [ ] |
| Chrome testing | **[MUST]** | M | None | [ ] |
| Edge testing | **[SHOULD]** | M | None | [ ] |
| Brave testing | **[NICE]** | S | None | [ ] |
| Multiple OS testing (Win/Mac/Linux) | **[SHOULD]** | L | None | [ ] |

### Accessibility (WCAG 2.1 AA)

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Keyboard navigation audit | **[MUST]** | M | None | [~] |
| Screen reader testing | **[MUST]** | M | None | [ ] |
| Color contrast audit (4.5:1 ratio) | **[MUST]** | M | None | [~] |
| Focus indicators | **[MUST]** | S | None | [~] |
| ARIA labels and roles | **[MUST]** | M | None | [~] |
| prefers-reduced-motion support | **[SHOULD]** | S | None | [~] |
| Touch target sizes (44x44px) | **[SHOULD]** | S | None | [~] |

**Note**: Proso already has accessibility features (see CLAUDE.md Feature 018). Needs formal audit.

### Performance Testing

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Load time benchmarks | **[SHOULD]** | M | None | [ ] |
| Memory leak testing | **[SHOULD]** | M | None | [ ] |
| Long-running session testing | **[SHOULD]** | M | None | [ ] |
| Large document handling | **[SHOULD]** | M | None | [ ] |
| Concurrent tab testing | **[SHOULD]** | M | None | [ ] |

---

## 7. Support Infrastructure

### Knowledge Base

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| FAQ documentation | **[MUST]** | M | Beta feedback | [ ] |
| Troubleshooting guides | **[MUST]** | M | Beta feedback | [ ] |
| Provider setup guides | **[MUST]** | M | None | [ ] |
| Search functionality | **[SHOULD]** | M | Knowledge base | [ ] |
| Feedback/rating on articles | **[NICE]** | S | Knowledge base | [ ] |

### Support Channels

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Email support (support@proso.com.br) | **[MUST]** | S | Domain | [x] |
| Help desk integration | **[SHOULD]** | M | Email | [ ] |
| Community Discord/forum | **[NICE]** | M | None | [ ] |
| In-app feedback widget | **[SHOULD]** | M | None | [ ] |
| GitHub issues for bugs | **[SHOULD]** | S | None | [ ] |

### Bug Reporting

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Bug report template | **[MUST]** | S | None | [ ] |
| System info collection (with consent) | **[SHOULD]** | M | None | [ ] |
| Screenshot/recording capability | **[NICE]** | M | None | [ ] |
| Status page for known issues | **[NICE]** | M | None | [ ] |

---

## 8. Launch Preparation

### Pre-Launch Checklist

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| All **[MUST]** items completed | **[MUST]** | - | All above | [ ] |
| Final security review | **[MUST]** | M | None | [ ] |
| Final QA pass | **[MUST]** | L | None | [ ] |
| Store listings approved | **[MUST]** | - | Submissions | [ ] |
| Payment flow end-to-end tested | **[MUST]** | M | Payment integration | [ ] |
| Backup and recovery procedures | **[SHOULD]** | M | Backend | [ ] |
| Rollback plan documented | **[SHOULD]** | S | None | [ ] |

### Launch Day Checklist

| Item | Priority | Effort | Dependencies | Status |
|------|----------|--------|--------------|--------|
| Monitoring dashboards ready | **[MUST]** | M | Error tracking | [ ] |
| Support team briefed | **[MUST]** | S | Support setup | [ ] |
| Social media posts scheduled | **[SHOULD]** | S | Social accounts | [ ] |
| Product Hunt launch (if planned) | **[NICE]** | M | Product Hunt prep | [ ] |
| Press outreach | **[NICE]** | M | Press kit | [ ] |

---

## MVP Minimum Requirements Summary

The absolute minimum to launch legally and functionally:

### Legal (Non-Negotiable)
1. Privacy Policy (GDPR + CCPA compliant)
2. Terms of Service
3. Resolve license conflict (GPL-3.0 vs MIT)
4. AI voice disclosure in UI (OpenAI requirement)

### Technical (Non-Negotiable)
1. Chrome Web Store listing ($5 fee)
2. Firefox Add-ons listing
3. Minimum permissions audit
4. Security audit (no obvious vulnerabilities)
5. Payment integration (Stripe or Paddle)
6. License key validation

### Business (Non-Negotiable)
1. Business entity (LLC minimum)
2. Business bank account
3. Refund policy
4. Support email

### UX (Non-Negotiable)
1. First-run onboarding
2. Free tier or trial period
3. Clear upgrade path
4. Account creation/management
5. Cancellation flow

---

## Estimated Timeline

| Phase | Items | Duration |
|-------|-------|----------|
| Legal Setup | Entity, Privacy Policy, ToS, License | 1-2 weeks |
| Technical | Payment integration, licensing, store prep | 2-3 weeks |
| Marketing | Landing page, docs, assets | 1-2 weeks |
| QA | Beta testing, security audit, cross-browser | 2-3 weeks |
| Launch Prep | Final checks, monitoring, support | 1 week |
| **Total MVP** | All **[MUST]** items | **7-11 weeks** |

---

## Resources and Links

### Store Guidelines
- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [Firefox Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)
- [Chrome Extension Monetization Guide](https://www.extensionradar.com/blog/how-to-monetize-chrome-extension)

### Legal
- [CCPA Privacy Policy Requirements 2025](https://secureprivacy.ai/blog/ccpa-privacy-policy-requirements-2025)
- [Chrome Extension Privacy Requirements](https://www.privacypolicies.com/blog/chrome-extensions-requirements-privacy-policy-secure-handling/)
- [Open Source License Comparison](https://choosealicense.com/licenses/)

### Payments and Tax
- [Stripe Tax](https://stripe.com/tax)
- [Paddle (Merchant of Record)](https://www.paddle.com)
- [SaaS Sales Tax Guide](https://www.paddle.com/blog/saas-sales-tax-state-wide-and-international)

### API Provider Terms
- [OpenAI Usage Policies](https://openai.com/policies/usage-policies/)
- [ElevenLabs Terms of Service](https://elevenlabs.io/terms-of-use)
- [ElevenLabs Commercial Rights](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform)

### Error Tracking
- [Sentry Alternatives Comparison](https://betterstack.com/community/comparisons/sentry-alternatives/)
- [Error Monitoring Options](https://middleware.io/blog/sentry-alternatives/)

### Landing Pages and Marketing
- [Landing Page Best Practices 2025](https://www.involve.me/blog/landing-page-best-practices)
- [Free Trial Conversion Strategies](https://fastspring.com/blog/8-strategies-for-converting-free-trials-users-into-paying-customers/)
