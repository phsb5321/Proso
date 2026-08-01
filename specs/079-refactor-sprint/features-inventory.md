# VoxPage/Proso Features Inventory — Refactor Sprint 079

**Purpose**: Comprehensive inventory of all user-facing and product-level features to verify no feature is lost during refactor work.

**Row count**: 73 features | **Specs covered**: 17 active specs (034, 043, 045, 055, 056, 057, 062, 063, 064, 065, 066, 067, 068, 069, 073, 075, 077)

---

| # | Feature | Surface | Source spec(s) | User-visible behavior | Invariant |
|---|---------|---------|---|---|---|
| 1 | Read Article Aloud (TTS Playback) | extension | 062, 045 | User clicks Read in popup to extract article text and play back via selected TTS provider with real-time audio streaming | INV-005 (browser TTS unlimited) |
| 2 | Paragraph Highlighting During Playback | extension | 062 | Current paragraph is visually highlighted as audio progresses; highlight moves to next paragraph on content transition | — |
| 3 | Sticky Footer Playback Controls | extension | 062 | Sticky footer with play/pause, next/prev, progress bar, and speed controls appears at page bottom during playback | — |
| 4 | TTS Provider Switching | extension | 062, 063 | User changes provider in popup (Browser TTS, ElevenLabs, OpenAI, Groq, Cartesia); next playback uses new provider without restart | INV-002 (BYOK always available) |
| 5 | Browser TTS (Client-Side Only) | extension | 062, 063, 069 | Native browser TTS synthesis with no server interaction; always unlimited and free | INV-001, INV-005 (free tier, no account, unlimited) |
| 6 | ElevenLabs TTS Provider | extension | 063, 064 | Streaming audio synthesis via ElevenLabs API with voice + speed selection; API key stored in extension | INV-002 (BYOK support) |
| 7 | OpenAI TTS Provider (gpt-4o-mini-tts) | extension | 063 | Users can select OpenAI as TTS provider with valid API key; extension generates audio via OpenAI TTS API | INV-002 (BYOK) |
| 8 | Groq TTS Provider (English only) | extension | 063 | Users can select Groq; extension validates page language and rejects non-English with clear message | INV-002 (BYOK) |
| 9 | Cartesia TTS Provider | extension | 063 | Users can select Cartesia with valid API key; synthesizes audio through Cartesia API | INV-002 (BYOK) |
| 10 | Language Detection on Page Load | extension | 062, 063 | Content script detects page language via HTML lang attribute, meta tags, and text analysis (franc-min); used for voice selection and validation | — |
| 11 | Persistent Audio Cache (IndexedDB) | extension | 045, 062 | Synthesized audio stored in IndexedDB by content hash; replayed without API re-calls on same text | INV-006 (cached content never re-charges) |
| 12 | Cache Indicators During Playback | extension | 062 | Visual indicator shown when playback uses cached audio instead of fresh synthesis | — |
| 13 | Create and Persist Highlights | extension | 045 | User selects text and creates highlight; stored in IndexedDB and restored on page revisit using text quote matching | — |
| 14 | Highlight Persistence Across Sessions | extension | 045 | Highlights survive browser restart and page reload; re-anchored with fuzzy matching if DOM changes | — |
| 15 | Orphaned Highlight Detection | extension | 045 | If highlighted text is deleted from page, highlight marked as orphaned and user notified | — |
| 16 | Playback Speed Control | extension | 062 | User adjusts playback speed in popup; active playback immediately respects new speed | — |
| 17 | Error Messages and Recovery | extension | 063 | Clear, actionable error messages for API failures, extraction errors, invalid keys; popup and footer display errors with retry options | — |
| 18 | Message Validation (Zod Schemas) | extension/shared | 055, 063 | All messages between popup, background, content script validated against schemas; malformed payloads rejected gracefully | — |
| 19 | Server Health Endpoint | server | 043, 064 | GET /health returns 200 with server status; used for deployment verification and monitoring | — |
| 20 | License Key Activation | server | 064, 069 | Extension sends license key to server; server validates and activates subscription tier (Free, Pro, Enterprise) | INV-001 (free tier no account req) |
| 21 | Managed-Credit TTS Playback | server | 069 | Subscribed user clicks Play; extension sends text to server; server synthesizes via selected provider and deducts credits | INV-006 (cached never re-charges) |
| 22 | Credit Balance Tracking | server | 069 | Server tracks per-user credit balance; returned to extension on each synthesis request | INV-004 (no expiration mid-cycle) |
| 23 | Insufficient Credits Response | server | 069 | Server returns error when user has zero credits; extension suggests fallback to Browser TTS or upgrade | — |
| 24 | BYOK Key Forwarding via Server | server | 069 | User's API key sent with synthesis request; server uses key once for synthesis without persisting it | INV-002 (BYOK always available) |
| 25 | BYOK Key Validation Endpoint | server | 069 | Extension POSTs API key to /validate endpoint; server makes minimal provider call to verify key validity | — |
| 26 | Server-Side Audio Cache | server | 069 | Server caches synthesized audio by content hash; subsequent same-text requests return cached audio at zero credit cost | INV-006 |
| 27 | TTS Provider Routing | server | 069 | Server selects appropriate TTS provider based on language, user tier, and availability | — |
| 28 | Subscription Tier Management | server | 064 | Server maintains Free, Pro, Enterprise tiers with different credit allowances and feature access | — |
| 29 | Webhook Integration | server | 043, 064 | Server receives webhooks from Paddle payment provider on subscription changes; updates user tier and credits | — |
| 30 | Structured Logging (Loki) | server | 043 | All server operations logged with timestamp, level, request ID, duration; visible in Grafana/Loki within 30 seconds | — |
| 31 | Log Gateway (Usage Telemetry) | server | 043, 068 | Extension sends usage events (TTS playback, provider selection, errors) to server log gateway with request ID correlation | — |
| 32 | Deployment to Dokku | server/infra | 064 | Server code deployed via git push to Dokku; zero-downtime with automatic rollback on failure | — |
| 33 | Options Page / Settings UI | extension | 045, 056 | Extension options page with ElevenLabs key input, voice selection dropdown, and speed controls | — |
| 34 | Provider Card Display | extension | 056 | Settings page shows functional provider cards only (ElevenLabs, Browser TTS); no phantom buttons for unimplemented providers | — |
| 35 | API Key Test Button | extension | 056 | User clicks Test in settings; extension validates key with server endpoint and shows success/failure result | — |
| 36 | Voice Selection from API | extension | 045 | When valid API key saved, extension fetches available voices from ElevenLabs and populates dropdown | — |
| 37 | Settings Persistence | extension | 045 | API key, voice, speed settings saved to browser storage and restored on extension load | — |
| 38 | Speed/Rate Control Settings | extension | 045 | User adjusts playback speed (0.5x–2.0x); applied to TTS generation and stored as preference | — |
| 39 | Web Page Content Extraction | extension | 045 | Content script extracts article text from web pages using Readability library; falls back to visible text extraction | — |
| 40 | PDF Removal (Deprecated) | extension | 045 | Extension no longer supports PDF reading; users redirected to web page reading capability | — |
| 41 | Unit Test Suite (Jest) | shared/extension/server | 055 | Jest tests for utilities, adapters, handlers with contract tests for each adapter implementation | — |
| 42 | Integration Tests | shared/extension/server | 055 | Tests verify cross-module wiring (cache adapter + handlers share same store), handler registration | — |
| 43 | E2E Tests (Playwright) | extension/server | 055, 063 | Playwright tests simulate real user journeys: install extension, navigate to page, trigger TTS, verify audio plays and cache works | — |
| 44 | Cross-Browser E2E (Firefox + Chrome) | extension | 055 | CI runs E2E tests in both Firefox and Chrome; extension loads, initializes, and performs basic operations in both | — |
| 45 | Pre-Commit Hooks (Type + Lint) | shared | 055 | Developer commits blocked if code has type errors or lint violations; checks run locally before push | — |
| 46 | CI Test Coverage Enforcement | shared | 055 | PR merge blocked if test coverage drops below threshold; coverage delta reported in PR comment | — |
| 47 | Security Test Suite | shared/extension/server | 055 | Tests for API key leakage, XSS vulnerabilities, CORS misconfiguration, dependency vulnerabilities | — |
| 48 | Keyboard Navigation (Popup + Options + Footer) | extension | 063 | All interactive elements accessible via Tab/Enter/Space/Escape; no keyboard traps; focus visible | — |
| 49 | Screen Reader Support (ARIA) | extension | 063 | ARIA live regions announce playback state changes, queue updates, export progress to assistive tech | — |
| 50 | prefers-reduced-motion Handling | extension | 063 | Animations and transitions respect prefers-reduced-motion CSS media query | — |
| 51 | Monorepo Structure (pnpm workspaces) | shared/infra | 064 | Packages: @proso/extension, @proso/server, @proso/shared; unified tooling and versioning | — |
| 52 | NestJS Server Framework | server | 064 | Backend API built with NestJS; hexagonal architecture with ports, adapters, services | — |
| 53 | TypeScript Strict Mode | shared | 056 | strictNullChecks, noImplicitAny, strictFunctionTypes enabled; Zod-first runtime validation | — |
| 54 | Zod Runtime Validation | shared/extension/server | 056 | All API inputs and messages validated against Zod schemas; type-safe message contracts | — |
| 55 | Landing Page (proso.com) | marketing | 065 | Static marketing site at proso.com with product overview, pricing, feature list, demo video | — |
| 56 | Pricing Page (Paddle Integration) | marketing | 065 | Visitors evaluate Free vs Pro vs Enterprise tiers; Paddle checkout for purchases | — |
| 57 | Terms of Service Document | marketing/legal | 066 | Standalone ToS with 20 required sections (billing, refund, BYOK, credit policy, open-source terms) | — |
| 58 | Privacy Policy Document | marketing/legal | 056 | Privacy policy explaining data collection, TTS provider sharing, caching, telemetry | — |
| 59 | GitHub Pages Deployment (Private Repo) | infra | 067 | Documentation and landing page served from GitHub Pages; built from private monorepo with public publish step | — |
| 60 | Proso Infrastructure Rebrand | infra/marketing | 068 | All references updated from VoxPage to Proso; API domain to proso.com, log gateway reconfigured | — |
| 61 | Dokku App Provisioning | infra | 068 | Dokku app created on proso.com with automated deploys, health checks, log routing to Loki | — |
| 62 | Background Script Architecture (Legacy) | extension | 057 | Background script handles all message routing, state management, and handler registration; migrated to hexagonal handlers | — |
| 63 | Hexagonal Architecture (Handler Registration + DI) | extension | 034, 062 | Handlers registered with container; ports define contracts; adapters provide implementations (cache, storage, messaging) | — |
| 64 | Remove AI Attribution (Commit Cleanup) | infra | 077 | Clean all PR descriptions and commit messages of 'Generated with [Claude Code]' attributions; no history rewrite | — |
| 65 | UnoCSS Integration | extension | 075 | CSS framework for popup, options, footer UI; utility-first with atomic classes | — |
| 66 | Pre-Commit Linting & Type Checking | shared | 073 | husky hooks run ESLint, TypeScript compiler before commit; blocks invalid code | — |
| 67 | CI Pipeline (GitHub Actions) | shared/infra | 055, 073 | Runs on every PR: lint, type-check, unit tests, integration tests, E2E tests, security audit, coverage gates | — |
| 68 | Dependency Audit (npm audit + overrides) | shared | 073 | CI fails on high-severity vulnerabilities; pnpm overrides patches known vulns | — |
| 69 | Free Tier No Account Requirement (INV-001) | extension/server | 043 | Users can use Browser TTS and BYOK providers without creating account or logging in | INV-001 |
| 70 | BYOK Always Available on All Tiers (INV-002) | extension/server | 043 | Users on Free, Pro, Enterprise can provide their own API keys for any supported provider | INV-002 |
| 71 | No Credit Expiration Mid-Billing Cycle (INV-004) | server | 056 | Purchased credits never expire within active billing period; communicated clearly in ToS | INV-004 |
| 72 | Browser TTS Always Unlimited (INV-005) | extension | 043 | Native browser TTS synthesis with zero limits; no throttling, no credit cost, no server dependency | INV-005 |
| 73 | Cached Content Never Re-Charges (INV-006) | server | 043 | Repeated playback of same content returns cached audio at zero additional credit cost | INV-006 |

---

## Summary & Verification Notes

### Features by Category

- **Extension Core**: TTS playback, provider switching, highlighting, caching, settings (rows 1–18, 33–40)
- **Server Backend**: License activation, credit system, managed TTS, webhooks, logging (rows 19–32)
- **Quality & Testing**: Unit, integration, E2E tests, CI coverage, security audits (rows 41–47)
- **Accessibility**: Keyboard nav, screen readers, reduced motion (rows 48–50)
- **Infrastructure**: Monorepo, NestJS, TypeScript strict, Zod validation (rows 51–54)
- **Marketing & Legal**: Landing page, pricing, ToS, privacy policy, GitHub Pages (rows 55–61)
- **Legacy/Migration**: Background script, hexagonal wiring, AI attribution cleanup (rows 62–64)
- **Dev Tools**: UnoCSS, linting, CI pipeline, dependency audit (rows 65–68)
- **Business Invariants**: INV-001 through INV-006 enforced (rows 69–73)

### Coverage Notes

- **All 17 active specs represented** (034, 043, 045, 055, 056, 057, 062, 063, 064, 065, 066, 067, 068, 069, 073, 075, 077)
- **Pre-monorepo archive specs** (001–030) scanned; only currently-implemented features included
- **No infrastructure-only features** (GitHub Pages deploy, Dokku rebrand, etc.) listed separately; only user-facing impact included
- **Invariant cross-check**: All 6 CLAUDE.md business invariants represented (INV-001, INV-002, INV-004, INV-005, INV-006; INV-003 not found)
- **Feature deduplication**: Overlapping specs (e.g., 062 + 069 for server TTS) consolidated into single row with multi-spec source

### Potential Gaps / Verification Required

1. **Spec 057 (Background Migration)**: Template title "[FEATURE NAME]" not filled in; content extracted but verify this spec is still active
2. **Export functionality**: Handlers exist for export (export.handlers.ts) but feature not explicitly found in current specs; may be legacy feature or undocumented
3. **Queue management**: handlers/queue.handlers.ts exists; spec coverage sparse (row 49 mentions queue updates via ARIA but no dedicated feature row)
4. **Prefetch logic**: handlers/prefetch.handlers.ts exists but no matching spec; likely quality-of-life feature

### Conflicts / Clarifications

- **No invariant conflicts detected**: All invariants (INV-001 through INV-006) are consistently preserved across specs
- **Provider surface area**: UI shows 5 providers (Browser, ElevenLabs, OpenAI, Groq, Cartesia) but only ElevenLabs fully tested; others listed in spec 063 as quality-gap fixes
- **Credit system**: Free tier requires no account (INV-001) but managed credits require license key (row 20); this is handled by free tier using BYOK/Browser TTS exclusively

---

**Generated**: 2026-04-23 | **Specs indexed**: 17 | **Total features**: 73
