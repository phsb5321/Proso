# Feature 149 — Tasks

| # | Task | Requirement | State |
|---|---|---|---|
| T-001 | Declare the licence claim contract in `@proso/shared` — request, issued/pending responses, storage key, hash field, claim byte count | FR-006, FR-008 | done (`32d2ceb`) |
| T-002 | Add `assets/js/checkout-config.js` with every Paddle value empty and the tier↔card↔price mapping documented | FR-002, FR-009 | done |
| T-003 | Buy controls on `pricing.html` for Basic (`pro`) and Pro (`enterprise`), monthly and annual | FR-001, FR-004 | done |
| T-004 | Validate configuration per tier and period; leave bad configuration inert with a stated reason, re-checked when the billing toggle flips | FR-003 | done |
| T-005 | Mint the claim secret at the buy click; store it, send only its digest | FR-006 | done |
| T-006 | Load Paddle.js on first activation, never on page load | FR-010 | done |
| T-007 | `success.html` + `success.js`: exchange the purchase for the key, render it as selectable text with a copy control and paste instructions | FR-005 | done |
| T-008 | Refuse to ask for a key without a claim secret, and explain | FR-007 | done |
| T-009 | Poll `pending` to the page's budget; never turn ambiguity into an existence claim; clear the claim secret after a successful copy | FR-008 | done |
| T-010 | `scripts/checkout-surface-gate.mjs` — 13 assertions over the shipped markup and scripts | falsifier | done |
| T-011 | `--plants` mode: 8 planted breaks, each required to turn an assertion red | falsifier | done |
| T-012 | `make checkout-surface-gate` / `make checkout-surface-plants` | falsifier | done |
| T-013 | Site copy: `index.html` paid cards link to pricing instead of claiming "Coming Soon"; privacy page gains a Payments section and states when third-party code loads | FR-010 | done |
| T-014 | knip: register `success.html` and the three checkout scripts (HTML `<script src>` is invisible to knip) | FR-011 | done |
| T-015 | Spec, plan, tasks committed with the code | — | done |

## Deliberately not done

| Item | Why |
|---|---|
| Wiring `POST /api/v1/subscription/checkout` | It requires an authenticated `userId` an account-free buyer does not have, and returns a stub URL. Paddle.js overlay checkout is the account-free path. |
| A "Multilingual" buy control | No server-side tier exists for it. Selling it would be selling something undefined. |
| Real Paddle price ids | Configuration, Pedro-gated on business verification. Empty values are handled visibly by design. |
| Editing `packages/server` | Owned by the sibling seat (Feature 148). |
