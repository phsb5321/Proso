# Feature 158 — Plan

## Approach

Site copy first (what a human reads), then the two shipped scripts
(`success.js`, `checkout.js`) that back it, then the gate that pins every
finding red-on-reintroduction, then the deploy receipt that keeps purchase
disabled until the dependency holds close. No new runtime dependency; the
site stays static.

## Step 1 — Success-surface copy (findings 1, 2)

- `success.html`: headline `Claiming your licence key`; waiting panel says
  what the page is doing without claiming payment went through; problem
  panel drops "your subscription is real"; key-panel recovery copy names
  Paddle-identity verification.
- `success.js`: missing-id, no-claim, budget, and abort sentences all state
  the transaction id alone is insufficient and support verifies through
  Paddle's records.

## Step 2 — Pricing truth (finding 3)

- `pricing.html`: Free/Pro/Enterprise cards at $0 / $4.99 / $14.99 with
  500K/2M credit volumes and the shared feature matrix; Multilingual card
  removed; enterprise callout becomes "Custom licensing"; FAQ drops the
  browser-TTS fallback, the 7-day trial, and rollover claims; an install
  FAQ names the AMO wait.
- `index.html`: the same three cards; JSON-LD offers aligned; comparison
  cells reworded (no "Basic", no "Unlimited browser TTS").
- `terms.html`: tiers, credit policy (no rollover, no browser-TTS fallback),
  refund policy (no trial bullet).
- `checkout-config.js`: tier↔card mapping table now reads Pro/Enterprise.

## Step 3 — Install honesty (findings 4, 10)

- Nav and hero CTAs on all five pages point to `index.html#install-status`.
- New `#install-status` section names pending Mozilla signing (AMO) and
  self-hosted release automation.
- JSON-LD: `downloadUrl` removed; `softwareVersion` = the extension package
  version; `operatingSystem` 109+; offers match the tier table.

## Step 4 — Script hardening (findings 5, 6, 7, 8, 9)

- `success.js`: `MIN_RETRY_MS`/`MAX_RETRY_MS` clamp with
  `Number.isFinite` collapse to default; `AbortController` per request with
  `min(REQUEST_TIMEOUT_MS, remaining)`; shared `budgetMessage()`.
- `checkout.js`: synchronous `checkoutInFlight` lock, released on
  `checkout.closed`/`checkout.completed` via `eventCallback` or on the
  caught failure; rejected `__prosoPaddleLoading` cache cleared;
  `typeof string` guards on token and price id.

## Step 5 — Gate and plants (all findings)

- `scripts/checkout-surface-gate.mjs`: ten new checks; a virtual clock
  (`__advanceClock` + recorded timer delays) so retry budgets and request
  deadlines run without waiting; a hung-fetch mode driven by the page's own
  AbortController; buy-control name expectations moved to Pro/Enterprise;
  explicit `process.exit` (the landing page's hero animation otherwise keeps
  Node alive).
- Eleven new plants, one per finding, each verified to turn at least one
  check red; the existing eight plants for #149 keep passing.

## Step 6 — Deploy receipt (finding 11)

- `scripts/checkout-deploy-readiness.mjs`: reads the shipped checkout config
  through a vm sandbox, scans server sources for the Keyforge claim
  endpoint and extension entrypoints for the licence-key wallet, and fails
  closed (exit 1) whenever the configuration would enable purchase while a
  hold is open. `--live` additionally probes the claim endpoint.
- `make checkout-deploy-readiness` target.
- Wiring the receipt into `deploy-site.yml` is a separate Pedro-gated task
  and is documented in the receipt header, not performed here.

## Step 7 — Spec artifacts and verification

- `specs/158-claim-recovery-r2/{spec,plan,tasks}.md` committed with the code.
- `node scripts/checkout-surface-gate.mjs` 23/23; `--plants` 19/19;
  `checkout-deploy-readiness.mjs` exit 0 with holds listed;
  `check-active-docs.mjs` clean; biome format/lint clean; workspace
  typecheck clean (after `generate-prisma.sh`).

## Risks

- **Plant anchor drift:** plants match exact shipped source. Biome reformats
  only whitespace; anchors were re-verified after formatting by re-running
  plant mode (19/19 caught).
- **Virtual-clock fidelity:** the harness clock drives the page's own
  `setTimeout`/`Date.now`; each advance drains the promise chains via a
  macrotask yield before moving on. Real-timer checks (Paddle open, copy)
  still run on the real clock.
- **Receipt false confidence:** the receipt observes the repository, not the
  fleet. Deploy-time checks (endpoint actually deployed; Paddle values
  verified end to end) are printed as operator checks, and the spec records
  them as holds no code in this PR can close.
