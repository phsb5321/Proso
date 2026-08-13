# Feature 158 — Claim Shield: the purchase surface cannot misclaim

## Goal

Harden the purchase surface merged by PR #151 so that it cannot overstate,
misprice, strand, or stall a purchase before any real Paddle credentials
exist. This is a bounded site/shared slice; `packages/server` and
`packages/extension` are untouched except as read by the deploy receipt.

## The state this feature starts from

PR #151 merged without the required different-family review. An adversarial
pass over the merged surface found eleven defects, five blocking at dispatch
and six more added by independent source-verified review. Each is listed with
its falsifier below.

## Blocking findings and their falsifiers

| # | Finding | Fix | Falsifier (check + plant) |
|---|---|---|---|
| 1 | Human recovery reintroduces transaction-id-as-credential: `success.html`/`success.js` told the visitor to email the public `_ptxn` id and that support "can hand it over against the transaction id" | Recovery copy states support verifies the purchaser through Paddle's records (checkout email and receipt) and never releases a key against the id alone | `recovery copy never turns the transaction id into an identity` / plant `we-will-send-your-key` |
| 2 | Unproved success claims: "your subscription is active" as the static headline, "Your payment went through" while waiting, and "Your payment is unaffected and your subscription is real" in the problem panel | Static copy claims nothing: the headline is "Claiming your licence key", the waiting panel says what the page is doing, and only an `issued` response renders the key panel | `the success page claims nothing before the server issues the key` / plant `claims-active` |
| 3 | Materially false pricing: the site sold Basic/Pro/Multilingual at 100K/300K with MP3 export, cloud sync, PDF, rollover and a trial. `packages/shared/src/constants/tiers.ts` supports only Free/Pro/Enterprise at 0/500K/2M with `managedTts`, `premiumVoices`, `prioritySupport` | Cards renamed/mapped to Free ($0), Pro ($4.99/$39.99yr), Enterprise ($14.99/$119.99yr) with the shared credit volumes and feature matrix; Multilingual removed; terms and FAQ aligned; the `checkout-config.js` tier↔card mapping table corrected | `pricing tiers and credit volumes match the shared source of truth` / plant `credit-volume` |
| 4 | Public install CTAs 404: every CTA and the JSON-LD `downloadUrl` pointed at the private GitHub releases page; the only public XPI is 1.2.1 while source is 1.2.9 | Every install CTA links to a same-site `#install-status` section naming pending Mozilla signing (AMO); JSON-LD `downloadUrl` removed and `softwareVersion` aligned with `packages/extension/package.json` | `install controls name the Firefox signing wait and link nowhere private` / plants `github-install`, `stale-jsonld` |
| 5 | Unbounded retry delay: `success.js` accepted any numeric `retryAfterMs`; negative/zero creates a hot poll loop | `clampRetryAfterMs` bounds every delay to [1000, 30000] ms with NaN/Infinity collapsing to the 3000 ms default | `a pending retry delay is clamped to a safe floor and ceiling` / plant `hot-loop` |
| 6 | No re-entrancy guard: a double-click or tier switch mints secret2 and overwrites sessionStorage while checkout1 may still complete with hash(secret1), stranding the paid purchase | `checkoutInFlight` is set synchronously at the click and released only on a proved `checkout.closed`/`checkout.completed` event or a failure the buyer saw | `one active checkout at a time, released only on a proved close` / plant `double-mint` |
| 7 | A hung fetch stalls the page forever: `MAX_WAIT_MS` bounded only successful 202 loops | Every request carries an `AbortController` aborted at `min(10s, remaining budget)`; an abort renders the transport-failure sentence | `a hung licence service cannot stall the page past its budget` / plant `hung-forever` |
| 8 | `loadPaddle` caches a rejected `__prosoPaddleLoading` forever; one CDN failure makes every retry fail until reload | The cache is cleared when the load promise rejects, so the next buy click starts a fresh load | `a failed provider load does not poison the next buy click` / plant `poisoned-loader` |
| 9 | `configProblem` calls `.indexOf` on `clientToken`/`priceId` without a `typeof string` guard; a numeric value throws and leaves controls visually live | Both values are `typeof`-guarded before prefix checks; malformed config renders the control inert with a stated reason | `a non-string configuration value disables the control with a stated reason` / plant `throws-on-numeric` |
| 10 | JSON-LD still advertised `softwareVersion 1.0.0`, browser TTS and false tier offers | Offers match the shared tier table; `softwareVersion` mirrors the extension package | `install controls name the Firefox signing wait and link nowhere private` / plant `stale-jsonld` |
| 11 | No deploy-readiness receipt: the site could deploy with purchase enabled while the claim endpoint, the licence-key wallet, and Paddle config do not exist | `scripts/checkout-deploy-readiness.mjs` + `make checkout-deploy-readiness`: fails closed (exit 1) whenever the configuration would enable purchase while any of the three holds is open; exits 0 while purchase is disabled. Wiring it into the Pages deploy workflow is a separate Pedro-gated task | `the deploy receipt fails closed while purchase holds are open` / plant `live-config` |

## Preserved invariants (all still asserted)

- 32-byte Web Crypto claim secret; only SHA-256 travels to Paddle.
- Claim secret in sessionStorage; `_ptxn` routes only.
- One indistinguishable 202 pending response; the page never translates it into an existence claim.
- Lazy Paddle.js injection; missing config visibly disables purchase.
- Static site, no framework/bundler/new runtime dependency.

## Requirements

- **FR-001:** Every recovery sentence on the success surface states that
  support verifies the purchaser through Paddle's records and never releases
  a key against the transaction id alone (finding 1).
- **FR-002:** No static or dynamic copy on the success page claims payment,
  activation, or subscription state before the licence service answers
  `issued` (finding 2).
- **FR-003:** Pricing page, landing page, terms, JSON-LD offers, and the
  checkout-config mapping name exactly the tiers and credit volumes in
  `@proso/shared` and none of the unsupported promises (finding 3).
- **FR-004:** No install control links away from the site; every one leads to
  copy that names the pending Firefox signing/AMO wait, and JSON-LD offers no
  download it cannot serve (findings 4, 10).
- **FR-005:** A pending retry delay outside [1 s, 30 s] is clamped; NaN and
  Infinity collapse to the default; the shipped source declares the bounds
  the gate pins (finding 5).
- **FR-006:** One checkout and one claim secret at a time; the lock releases
  only on a proved close/completion or a visible failure (finding 6).
- **FR-007:** Every claim request is aborted within the request budget, so a
  hung connection cannot stall the page (finding 7).
- **FR-008:** A rejected provider load is not cached; the next buy click
  retries (finding 8).
- **FR-009:** A non-string `clientToken` or price id disables the control
  with a stated reason instead of throwing (finding 9).
- **FR-010:** `make checkout-deploy-readiness` fails closed while the
  Keyforge claim endpoint, the licence-key wallet field, and a complete
  Paddle configuration are open holds; it exits 0 while purchase is disabled
  (finding 11).

## Non-goals

- `packages/server` and `packages/extension` changes. The three deploy holds
  are owned by sibling slices; this feature only detects and reports them.
- Editing `docs/money-path.md`, `docs/reading-journey-status.md`, or
  `docs/active-docs.json` — the audit is a dated snapshot and the ledgers are
  orchestration-owned.
- `.github/workflows` changes — wiring the receipt into the Pages deploy is
  a separately gated task, documented in the receipt header.
- Real Paddle credentials, AMO submission, or anything requiring a Paddle
  account. The boundary stays the call handed to Paddle.js.

## Acceptance

```bash
node scripts/checkout-surface-gate.mjs           # 26/26 checks held
node scripts/checkout-surface-gate.mjs --plants  # 30/30 plants caught
node scripts/checkout-deploy-readiness.mjs       # PASS (purchase disabled), holds listed
node scripts/quality/check-active-docs.mjs       # 9 owned documents, no expired reviews
gitleaks git --log-opts="origin/main..HEAD"      # 0 leaks
```

## GPT-5.6 Sol review fixes (second head)

The first head was blocked by a GPT-5.6 Sol max review. Each finding and its
fix, in review order:

1. **Lifecycle callback at the wrong seam.** `eventCallback` was passed to
   `Paddle.Checkout.open()`, but Paddle Billing registers callbacks at
   `Initialize()`/`Update()`. The callback now lives on `paddle.Initialize`
   and the gate drives the unlock through that seam, asserting nothing
   callback-shaped reaches `Checkout.open`. Falsifier: plant
   `event-callback-seam`.
2. **Controls looked enabled while checkout was open.** All buy controls now
   stay `aria-disabled` + visually disabled with an announced
   "already open" reason until a proved close or a visible failure; a proved
   close re-enables them through `refresh()`. Falsifier: plant
   `live-controls`.
3. **`apiBaseUrl` unvalidated.** Checkout refuses to sell without a nonempty
   HTTPS API address (config check + readiness check), and the success page
   both rejects a malformed address up front and wraps the claim setup in a
   try/catch so a synchronous throw lands in the visible problem panel, never
   a stuck waiting panel. Falsifiers: plants `bad-api-url`, `sync-throw`.
4. **Neutral metadata and a real no-JS state.** Title/meta/headline make no
   outcome claim; all three outcome panels start `hidden` and JavaScript
   reveals exactly one; a `<noscript>` block gives an actionable recovery
   path naming Paddle verification. Falsifiers: plants `active-headline`,
   `hidden-panels`.
5. **Authoritative legal terms stale.** `packages/legal/terms.html` is
   reconciled to the shared tier truth (Free/Pro/Enterprise, 0/500K/2M, no
   browser TTS / Basic / Multilingual / Team / MP3 / cloud sync / PDF /
   rollover / grace period, no Google Cloud provider), with the README's
   material-change treatment: version 2.0, last updated 12/08/2026,
   effective 2026-09-18 (30+ days out), previous-versions section listing
   v1.0. Falsifier: plant `stale-legal`.
6. **Unreachable voice claims.** The landing page no longer advertises
   browser built-in voices and the privacy page no longer describes
   browser-native TTS or the absent Google Cloud provider. Falsifier: plant
   `builtin-voices`.
7. **Subscribe links looked live while checkout is disabled.** Landing-page
   card CTAs now read "View Pro plan" / "View Enterprise plan" and navigate
   to the pricing section. Falsifier: plant `subscribe-links`.
8. **Truth oracle ignored the feature matrix, privacy, and the legal doc.**
   The gate now derives `FEATURE_MATRIX` from `tiers.ts` and asserts, per
   card on both the pricing and landing pages, that each tier claims exactly
   its granted features (check-mark) and denies exactly the rest (dash-mark).
   The forbidden/required token sweep extends to `privacy.html` and
   `packages/legal/terms.html`. Falsifier: plant `free-managed-voices` — the
   semantic near-miss (a check-marked "Managed voices" grant to Free) now
   goes red.
9. **Readiness gullible to comments and non-canonical answers.** The
   claim-endpoint oracle requires an actual NestJS `@Post` registration and
   the wallet oracle requires an actual `<input>` bound to a licence-key
   setting, both on comment-stripped source; `--live` only counts the
   canonical `202 { status: 'pending', retryAfterMs > 0 }` answer as
   deployed; independent Paddle evidence is an explicit operator hold in
   every verdict; `checkout-deploy-readiness` is in `.PHONY`. Test seams
   (`PROSO_SCAN_*`, `PROSO_PROBE_URL`) let the gate drive comment-only,
   runnable, 501, and canonical-202 scenarios. Falsifier: plant
   `gullible-receipt`.
10. **Credential-shaped literal in the gate.** The plant token and price ids
    are assembled from parts at runtime; the PR commit range scans clean
    under Gitleaks.

A plant-mode self-check now proves an HTML plant reaches the DOM actor
(`openPage` constructs the page from the planted source), so DOM-only
regressions cannot hide behind source greps.
