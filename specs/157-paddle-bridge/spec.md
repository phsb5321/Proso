# Feature 157 — Signed Paddle provisioning boundary

## Goal

A recurring Paddle payment that reaches Proso must either converge on one usable
paid entitlement or remain retryable. Proso must never acknowledge a failed
fulfilment as received, derive identity or entitlement from buyer-authored
metadata, or duplicate credits when Paddle retries or delivers related events
out of order.

## User outcomes

### A completed purchase becomes usable

After a completed recurring purchase, the buyer has one Proso identity bound to
the Paddle customer, one subscription at the plan represented by the purchased
price, one allocation for that paid period, and one hash-only licence record.
The buyer's existing transaction-plus-claim-secret journey retrieves a key that
the paid validation route accepts.

### Retries do not grant twice

Replaying a delivery, restarting Proso between attempts, or receiving the
linked transaction and subscription events in either order produces the same
final entitlement. A period's Paddle transaction can fund at most one credit
allocation.

### Failed fulfilment remains recoverable

If payload validation, configuration, or persistence fails, Paddle receives a
non-success response. No processed marker or partial entitlement remains, so a
later delivery of the same event can complete normally.

## Requirements

- **FR-001 — Authentic bytes only.** Proso accepts a Paddle webhook only when at
  least one supplied signature matches the HMAC-SHA256 of the exact timestamp,
  colon, and unmodified request bytes under the configured endpoint secret.
  Missing, malformed, mismatched, more-than-five-seconds-old, and more-than-five-
  seconds-in-the-future signatures receive HTTP 403. A second valid signature
  is accepted during secret rotation. JSON is interpreted only after this
  check succeeds.
- **FR-002 — Persistent event idempotency.** Each accepted event id has one
  database record. That record commits in the same atomic operation as every
  resulting entitlement change. A duplicate returns HTTP 200 without another
  allocation or licence. A rolled-back operation leaves no event record.
- **FR-003 — Paddle customer identity.** Provisioning creates or reuses the user
  identified by Paddle's `customer_id`. Buyer-authored `custom_data.user_id`,
  passthrough values, and other client identifiers never select a Proso user.
- **FR-004 — Exact configured price entitlement.** Four operator-provided price
  ids represent Pro monthly, Pro yearly, Enterprise monthly, and Enterprise
  yearly. A recognized event contains exactly one recurring plan item and its
  price id selects the tier. Missing, unknown, duplicated, or mixed recurring
  plan prices are retryable failures. Buyer-authored tier or billing-period
  metadata is diagnostic only and never changes the grant.
- **FR-005 — Event-order convergence.** Delivering a linked
  `transaction.completed` before or after `subscription.created` produces the
  same user, subscription, claim routing, allocation, and licence state.
  Subscription status, tier, cancellation state, and paid period do not regress
  when an event with an older `occurred_at` arrives later.
- **FR-006 — Claim pair integrity.** A transaction routing id and a claim hash
  are filled as a pair only when the hash is exactly 64 lowercase hexadecimal
  characters. Existing claim routing is never overwritten by a conflicting
  transaction or hash. A transaction id alone never authorises licence
  retrieval.
- **FR-007 — Exactly one allocation per paid period.** Every allocation created
  by this boundary records its source Paddle transaction id under a database
  uniqueness constraint. Related events and retries reuse the allocation; a
  different completed renewal transaction may create one new allocation.
- **FR-008 — Atomic fulfilment.** One database unit of work records the event,
  creates or reuses the Paddle customer user, converges the subscription,
  fills claim routing, creates the period allocation, and ensures one active
  hash-only licence row. No plaintext licence key, claim secret, endpoint
  secret, or raw request body is persisted or logged.
- **FR-009 — Retry truth.** A processing fault escapes the HTTP boundary as a
  5xx response and leaves the event unprocessed. An unsupported but authentic
  event may be durably recorded and acknowledged with HTTP 200.
- **FR-010 — No pretend commerce API.** The server exposes no checkout URL,
  subscription lookup, or cancellation operation that returns a placeholder or
  logs success without contacting Paddle. The static site remains the owner of
  Paddle.js checkout.
- **FR-011 — Safe legacy transition.** Existing users remain valid while the
  legacy user-level licence column becomes nullable and deprecated. Licence
  validation continues to resolve only the dedicated hash-only licence table.
- **FR-012 — Sandbox-ready configuration only.** No Paddle id, token, endpoint
  secret, or deployment value is invented. Missing configuration fails closed
  when a webhook is attempted and remains an operator/deployment prerequisite.

## Acceptance criteria

This is a service-to-service contract with native HTTP and PostgreSQL oracles;
the repository has no maintained Gherkin runner for this boundary, so no
`.feature` layer is added.

- Changing one byte after signing an otherwise valid body yields HTTP 403.
- A signature timestamp six seconds from the verifier clock yields HTTP 403,
  while a valid second `h1` value is accepted.
- Delivering the same event before and after an application restart leaves one
  event row, one allocation, and one licence row.
- A fault injected after all fulfilment writes but before commit yields HTTP
  5xx and zero rows from that event; replay without the fault succeeds.
- Buyer metadata claiming Enterprise alongside the configured Pro monthly
  price provisions Pro.
- An unknown recurring price yields HTTP 5xx and no user, subscription,
  allocation, licence, or event marker.
- Transaction-first and subscription-first delivery produce equivalent final
  state, and an older delivery cannot undo a newer status or period.
- A real application HTTP request made from raw signed bytes provisions a
  purchase whose claimed key validates with paid tier and credits.
- Removing persistent event uniqueness or an exact price mapping makes the
  focused real-PostgreSQL acceptance test fail.

## Executed falsifiers — 13/08/2026 00:01 BRT

- The initial signature suite was red because no verifier existed
  (`/tmp/proso-157-signature-baseline-red.log`, SHA-256
  `0ebe9a70f52d5d6265a78b84e353133762d9dae8a2facc13e184527a5b438e3a`).
  Exact-byte HMAC, timestamp, rotation, and parse-order checks then passed
  (`/tmp/proso-157-signature-green.log`, SHA-256
  `130369135d4954e319bb5b96b965cc1f04c3e35eda1805fa9b5e8005983fcc0d`).
- Removing the database identity from `PaddleWebhookEvent.eventId` made the
  focused restart test persist two markers for the same event and fail
  (`/tmp/proso-157-event-uniqueness-red.log`, SHA-256
  `53413df50778632bdb13c75b25c2d2d9ba845ef814617f396b07d08ee26d5aa6`).
- Removing one exact price mapping made the four-price oracle fail
  (`/tmp/proso-157-price-mapping-red.log`, SHA-256
  `b87ec0334f181729117a3b44e9a9aa5fa318cd0de28944edfdf5fb08fa4853a2`).
- On 13/08/2026 the four current official webhook schemas/examples were read
  from Paddle's transaction-completed and subscription-created/updated/canceled
  documentation and pinned under `packages/server/tests/fixtures/paddle/`.
  `subscription.created.data.transaction_id` is genuinely required; updated and
  canceled omit it. Canonical canceled sends `current_billing_period: null`, so
  the normalizer now preserves the stored paid period rather than inventing a
  date. `paddle-canonical-fixtures.spec.ts` validates every consumed path and
  retains fail-closed unknown-price coverage. Source URLs and exact adaptations
  are recorded in `plan.md`. Focused receipt
  `/tmp/proso-157-paddle-canonical-fixtures-2.log`, SHA-256
  `16b986205c74f019b6f9821e30f359592ced09c4f17bfcb00ea91bbf5c9a0604`.
  The schema-realistic real-PostgreSQL HTTP run is
  `/tmp/proso-157-postgres-schema-realistic-2.log`, SHA-256
  `c6d225dc1ecccc08b0b7c4323623b2ddc9ceff4d58edce026ee56ddcf4e0cb56`.
- Both plants were restored byte-for-byte and Prisma regenerated. The full raw
  AppModule/PostgreSQL journey passed 11/11
  (`/tmp/proso-157-postgres-green-5.log`, SHA-256
  `5bf2293c44a5d57720aaa0d9bd64ecfbdcef77c8f73bdfe2e838241066778d24`).
- Native DeepSeek's immutable-head review of `b5ef72f` found that a pairless
  `subscription.created` row could not later accept the complete canonical
  transaction/hash pair from `transaction.completed`. The new real AppModule/
  PostgreSQL journey reproduced the old branch red
  (`/tmp/proso-157-pairfill-mutation-red.log`, SHA-256
  `4e46300d01ee4ad87f83e48341f797aaeb3f1df071d687f7cb658d325f195670`), then
  proved atomic rollback/retry, pair fill, exactly-one allocation/key, incomplete-
  pair 503, and conflict preservation green
  (`/tmp/proso-157-pairfill-focused-green-final2.log`, SHA-256
  `71b4a59e43ec1d3d6cc46f9f442141c7c63d339d05581624a9d033050325092b`).

## Residual LOW notes from DeepSeek review

- Paddle pause/resume/activation/past-due/trialing event types remain marker-only;
  Proso currently has no pause/resume surface and later subscription updates
  converge state.
- The webhook-event ledger has no retention job yet; operations must define one
  before ledger growth becomes material.
- Missing webhook-secret configuration deliberately returns 403 at the guard,
  so Paddle retries configuration faults; the Paddle dashboard remains the
  operator-visible signal.
- `paddleLastTransactionId` is retained as write-only renewal provenance.
- Equal-timestamp ordering is now pinned through event-type precedence and the
  final event-id tie-break unit oracle.

## Non-goals

- Real Paddle sandbox or live delivery, business verification, KYC, or live
  credentials.
- Deploying the server or applying the schema to production.
- Editing the site or extension, changing checkout presentation, or proving
  Paddle's hosted card flow.
- Email delivery, account recovery, customer-portal cancellation, refunds, or
  support recovery when the browser loses its claim secret.
