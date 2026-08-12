# Feature 149 — Checkout surface

## Goal

Make Proso buyable by a stranger, and make the thing they bought reach them.

## The state this feature starts from

Verified on `main` @ `087607c`:

- `packages/site/pricing.html` quotes real prices — Basic $4.99/mo or
  $39.99/yr, Pro $14.99/mo or $119.99/yr — and every paid tier's call to
  action is `<span class="btn btn--disabled">Coming Soon</span>`. The only
  links on the page go to GitHub releases, the legal pages, and
  `mailto:commercial@proso.com.br`. **There is no way to pay.**
- `POST /api/v1/subscription/checkout` exists
  (`packages/server/src/infrastructure/controllers/subscription.controller.ts:69`)
  and nothing in the repository calls it. It also requires an authenticated
  `userId`, which an account-free buyer does not have.
- The deployed `proso-api` has neither `PADDLE_API_KEY` nor
  `PADDLE_WEBHOOK_SECRET`. Live Paddle needs business verification, which is
  Pedro-gated and outside this feature.

So the surface has to be built now and configured later, without the
configuration gap turning into a button that looks alive and does nothing.

## Requirements

- **FR-001:** Each purchasable tier and billing period on `pricing.html` has a
  buy control that opens Paddle's overlay checkout for the price id configured
  for that tier and period, carrying the tier in `custom_data` for diagnostics.
- **FR-002:** Paddle price ids and the client-side token are configuration read
  from exactly one file (`assets/js/checkout-config.js`), never invented and
  never inlined in markup or logic.
- **FR-003:** A missing, empty or malformed configuration value fails visibly:
  the control is left inert (`aria-disabled="true"`, visually disabled) and a
  sentence next to it names the value that is missing. It never silently
  renders a dead button, and an inert control never opens checkout or fetches
  the payment provider's script.
- **FR-004:** The buy control is a real `<button>`, in the tab order, operable
  by keyboard, with an accessible name that says what it does and which plan it
  buys.
- **FR-005:** A post-checkout page exchanges the completed purchase for the
  licence key it minted and shows the key as selectable text, with a copy
  control and a plain sentence saying where to paste it.
- **FR-006:** The transaction id is **not** the credential. Paddle publishes
  `_ptxn` in checkout and success URLs by design, so it reaches history, logs,
  screenshots and support transcripts. The buyer's browser mints a 256-bit
  claim secret at the buy click, keeps it in `sessionStorage`, and sends only
  `SHA-256(claimSecret)` through Paddle's signed `custom_data`. The success
  page presents the raw secret; the transaction id only routes.
- **FR-007:** A browser holding the transaction id but no claim secret makes no
  retrieval request at all, and is told why in a sentence that offers a way
  forward.
- **FR-008:** Unavailability is one answer. `202 { status: 'pending' }` covers
  an unknown transaction, a webhook still in flight, and a wrong claim alike.
  The page must not translate that ambiguity into a statement about whether a
  purchase exists, and must keep polling until its own budget expires.
- **FR-009:** The tier a buyer receives is not decided by the page. The site's
  `custom_data.tier` is client-editable and therefore diagnostic only;
  entitlement is derived server-side from the Paddle price id.
- **FR-010:** Third-party code is loaded only when a visitor asks to buy. The
  pricing page runs no payment-provider script until a buy control is
  activated, and the privacy page states what happens when it is.
- **FR-011:** No framework, bundler, package or deploy target is added.
  `packages/site` remains static HTML, CSS and vanilla JS served by
  `deploy-site.yml`.

## Non-goals

- Paddle account verification, live keys, and anything requiring them.
- Minting or storing licence keys — that is Feature 148 (`packages/server`).
- An account system. INV-001 keeps the free tier account-free and this feature
  does not introduce sign-up to solve retrieval.
- The "Multilingual" pricing card, which has no server-side tier to sell.

## Falsifier

`make checkout-surface-gate` loads the shipped `pricing.html`, `success.html`
and their scripts into jsdom and drives them through public controls: the
button a person sees, the real billing toggle, the real copy control. Thirteen
assertions cover FR-001 through FR-010, including the two the brief demands —
that a click reaches `Paddle.Checkout.open` with the configured price id, and
that an unset price id yields a visibly disabled control with a stated reason
rather than silence.

`make checkout-surface-plants` breaks the shipped source eight ways and
requires every break to turn at least one assertion red. An assertion that
cannot fail is not evidence.

What neither proves: that Paddle's hosted overlay renders and accepts a card.
That needs credentials this repository does not have. The boundary reached is
the exact call handed to Paddle.js, arguments included.
