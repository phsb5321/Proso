# Feature 154 — Tasks

| # | Task | Requirement | State |
|---|---|---|---|
| T-001 | `success.html`: neutral headline, truthful waiting/problem panels, Paddle-verification recovery copy | FR-001, FR-002 | done |
| T-002 | `success.js`: rewrite recovery sentences; shared `budgetMessage()` | FR-001 | done |
| T-003 | `pricing.html`: Free/Pro/Enterprise cards with shared credit volumes and feature matrix; remove Multilingual; fix FAQ | FR-003 | done |
| T-004 | `index.html`: matching cards, JSON-LD offers, comparison cells | FR-003 | done |
| T-005 | `terms.html`: tiers, credit policy, refund policy aligned with the shared source | FR-003 | done |
| T-006 | `checkout-config.js`: tier↔card mapping comment corrected to Pro/Enterprise | FR-003 | done |
| T-007 | Install CTAs on all five pages → `index.html#install-status`; new install-status section naming AMO/signing | FR-004 | done |
| T-008 | JSON-LD: drop `downloadUrl`, align `softwareVersion` with the extension package | FR-004 | done |
| T-009 | `success.js`: retry clamp [1 s, 30 s], NaN/Infinity → default, declared bounds | FR-005 | done |
| T-010 | `checkout.js`: `checkoutInFlight` lock with proved-close release | FR-006 | done |
| T-011 | `success.js`: `AbortController` + request budget on every claim request | FR-007 | done |
| T-012 | `checkout.js`: clear the rejected provider-load cache; `typeof` guards on token/price id | FR-008, FR-009 | done |
| T-013 | Gate: virtual clock + timer-delay recording; hung-fetch mode; explicit process exit | falsifier | done |
| T-014 | Gate: ten new checks (recovery, unproved claims, pricing truth, install honesty, clamp, single checkout, hung fetch, loader cache, non-string config, receipt) | falsifier | done |
| T-015 | Gate: eleven new plants, each turning at least one check red; #149 plants keep passing | falsifier | done |
| T-016 | `scripts/checkout-deploy-readiness.mjs` + `make checkout-deploy-readiness`, fail-closed on enabled-purchase-with-open-holds | FR-010 | done |
| T-017 | Spec, plan, tasks committed with the code | — | done |

## Deliberately not done

| Item | Why |
|---|---|
| Wiring the receipt into `.github/workflows/deploy-site.yml` | Separately Pedro-gated; documented in the receipt header as the deploy-time enforcement point. |
| `docs/money-path.md`, `docs/reading-journey-status.md`, `docs/active-docs.json` | Dated audit snapshot and orchestration-owned ledgers — out of scope by direction. |
| The three deploy holds themselves (Keyforge claim endpoint, licence-key wallet field, verified Paddle config) | Owned by sibling slices; the receipt reports them and fails closed, it does not fake them. |
| Real Paddle price ids / client token | Configuration, Pedro-gated on business verification; empty values stay visibly disabled by design. |
| `packages/server`, `packages/extension` | Out of scope for this bounded site/shared slice. |
