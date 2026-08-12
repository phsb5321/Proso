# Feature 149 — Plan

## Shape

Four files of vanilla JavaScript, one new HTML page, one shared schema module,
one gate. No build step: `packages/site` is copied verbatim to GitHub Pages by
`deploy-site.yml`, and introducing a bundler would mean introducing a deploy
pipeline for a page whose entire payload is a form opener.

```text
packages/shared/src/schemas/checkout.ts   contract (zod) — canonical for 148 too
packages/site/assets/js/checkout-config.js  the only place Paddle values live
packages/site/assets/js/checkout.js         buy controls on pricing.html
packages/site/assets/js/success.js          licence handoff on success.html
packages/site/success.html                  the page Paddle redirects to
scripts/checkout-surface-gate.mjs           the falsifier (+ plants)
```

## Decisions

**The transaction id cannot be the credential.** Paddle documents `_ptxn` as a
value it appends to checkout and success URLs
(https://developer.paddle.com/build/transactions/pass-transaction-checkout/).
A value deliberately placed in a URL is in history, referrer headers, proxy
logs and screenshots. Redeeming a licence against it alone would hand the key
to anyone who ever saw the link. So the browser mints its own secret before
checkout opens:

1. 32 bytes from `crypto.getRandomValues`, base64url encoded, written to
   `sessionStorage` **before** `Paddle.Checkout.open` — a redirect must never
   outrun the value the success page needs.
2. `SHA-256(claimSecret)`, lowercase hex, travels as
   `custom_data.license_claim_hash`. Paddle copies custom data onto the signed
   transaction and subscription events, so the server can persist the digest
   without ever holding the secret.
3. The success page POSTs `{ transactionId, claimSecret }`. Transaction id
   routes; secret authorises.

**One unavailable answer.** `202 { status: 'pending', retryAfterMs }` is
returned for an unknown transaction, an in-flight webhook and a wrong claim
alike. A 403 or a 404 would confirm that a given transaction id exists, turning
the endpoint into an enumeration oracle. The page therefore cannot distinguish
those cases either, and its timeout copy says both things that could be true
without asserting which.

**Configuration fails loudly.** `configProblem()` validates the environment,
the client token's prefix against that environment, the presence of a price id
for the *current* period, and its `pri_` shape. Anything wrong leaves the
control `aria-disabled="true"` with the reason written beside it and bound via
`aria-describedby`. `aria-disabled` rather than the `disabled` attribute so the
control stays in the tab order and a screen-reader user can reach the
explanation. A `MutationObserver` on the section's `data-billing` attribute
re-runs the check when the billing toggle flips, because a price id can exist
monthly and not annually.

**Paddle.js loads on demand.** The pricing page ships no third-party script
tag; `loadPaddle()` injects it on the first activation and reuses an instance
the page already has. This keeps the privacy page's "no third-party code"
claim true for anyone who is only reading, and the privacy page now states
exactly what pressing a buy button does.

**Web Crypto and sessionStorage are preconditions, not assumptions.** If either
is unavailable the control is inert with a stated reason, because taking money
we cannot deliver a key against is worse than not selling.

## Sequence

1. Contract in `@proso/shared` — canonical for the server seat (148), which
   consumes it rather than declaring a competing shape in `schemas/license.ts`.
2. Config module, with the tier↔card↔price mapping documented in prose.
3. Buy controls, then the success page.
4. Gate, then plants; plants are what make the gate evidence.
5. Site copy: `index.html` paid cards stop saying "Coming Soon", privacy page
   gains a Payments section.

## Risks

- **Cross-seat drift.** The contract is the interface to 148. Mitigated by a
  gate assertion that reads `packages/shared/src/schemas/checkout.ts` and fails
  when the site and the contract disagree on the route, the storage key or the
  hash field.
- **Paddle's `custom_data` propagation.** Custom data set at checkout appears
  on the transaction and is copied to the subscription. If Paddle ever changed
  that, the claim hash would not reach the webhook. Unverifiable without a
  Paddle account; stated here rather than assumed silently.
- **Single-tab retrieval.** The claim secret lives in `sessionStorage`, so the
  key can only be collected in the tab that started checkout. That is the cost
  of not having accounts; the page says so plainly and support can hand over a
  key against the transaction id out of band.
