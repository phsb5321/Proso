# Feature 157 — Implementation plan

## Constitution check

| Rule | Plan evidence |
|---|---|
| Security by default | Exact raw bytes are authenticated before JSON parsing; customer identity and tier come from signed Paddle fields plus operator price configuration; raw bodies and secrets never enter logs. |
| Hexagonal core | Webhook normalization and command creation are pure domain functions returning `Result`; signature and Prisma implementations sit behind ports; Nest remains the HTTP/composition boundary. |
| Fallible domain operations return `Result` | Payload/configuration and provisioning outcomes are typed results. Throws are confined to the HTTP and transaction boundaries. |
| Credit correctness | One unique source transaction funds one allocation, and the marker, subscription, allocation, and key commit together. |
| Critical paths are falsifiable | Real HMAC bytes, a real AppModule socket, real PostgreSQL, restart replay, delivery permutations, transactional fault injection, and source/schema plants exercise the binding claims. |
| Deployable schema reaches release path | The existing predeploy bridge gains only the additive/nullable columns, table, constraints, and indexes required here before normal Prisma reconciliation. Deployment itself remains out of scope. |

No Gherkin is added. This is a service boundary whose observable outcomes are
HTTP responses and database state, already executable through Jest and
PostgreSQL; an English-to-step-definition layer would duplicate the native
oracle.

## Verified Paddle contract

Canonical Paddle documentation was reached through the private SearXNG instance
and then read directly from `developer.paddle.com` on 13/08/2026:

- `Paddle-Signature` contains one `ts` and at least one `h1`; rotation may emit
  multiple `h1` values. The signed payload is exactly `ts + ':' + rawBody`,
  HMAC-SHA256 under the notification-destination secret. SDK default timestamp
  tolerance is five seconds.
- `transaction.completed` is the payment/fulfilment event and carries
  `data.id`, `customer_id`, `subscription_id`, `billing_period`, and item price
  ids. A recurring transaction creates a subscription before completion.
- `subscription.created` requires the linked `transaction_id`, `customer_id`,
  current billing period, recurring items, and status. `subscription.updated`
  and `subscription.canceled` do not have `transaction_id`. For canceled and
  paused subscriptions, the required `current_billing_period` field is nullable;
  the canonical canceled example sends `null`, so Proso preserves the last paid
  period rather than requiring or inventing dates.
- Delivery order is not guaranteed; Paddle explicitly says to compare
  `occurred_at` before changing state and retries non-200 responses.
- Checkout custom data is stored on the transaction and copied to the created
  subscription; it is supplied through Paddle.js by the buyer, so transport
  authenticity does not make tier/user metadata authoritative.

Source pages and checked-in adapted official examples:

- `https://developer.paddle.com/webhooks/transactions/transaction-completed/`
  → `tests/fixtures/paddle/transaction-completed.json`
- `https://developer.paddle.com/webhooks/subscriptions/subscription-created/`
  → `tests/fixtures/paddle/subscription-created.json`
- `https://developer.paddle.com/webhooks/subscriptions/subscription-updated/`
  → `tests/fixtures/paddle/subscription-updated.json`
- `https://developer.paddle.com/webhooks/subscriptions/subscription-canceled/`
  → `tests/fixtures/paddle/subscription-canceled.json`

`paddle-canonical-fixtures.spec.ts` consumes all four. Adaptation is limited to
mapping the first official price to the test catalog, marking additional
official recurring products one-time to satisfy Proso's exactly-one-plan rule,
and filling the canonical custom-data slot with Proso's claim hash and hostile
diagnostics. Every consumed official field and null stays schema-realistic.

## Layers

```text
HTTP raw request
  PaddleWebhookGuard
    -> WebhookVerifierPort
       -> PaddleAdapter (HMAC, tolerance, JSON envelope)
  WebhookController
    -> PaddleWebhookProcessor (configuration/composition)
       -> normalizePaddleWebhook (pure Result -> command)
       -> PaddleProvisioningPort
          -> PrismaPaddleProvisioner (one serializable transaction)
```

The existing repository ports remain available for reads, claim retrieval, and
licence validation. Fulfilment deliberately does not compose them: doing so
would create separate transactions and make partial success possible.

## Domain command

The normalizer accepts the verified envelope and an exact four-entry price
catalog. It returns one of:

1. **Provision paid period** for `transaction.completed`: customer,
   subscription, source transaction, tier, status, period, optional valid claim
   hash, and event ordering metadata. This is the sole allocation/key trigger.
2. **Synchronize subscription** for `subscription.created`,
   `subscription.updated`, or `subscription.canceled`: customer, subscription,
   exact-price tier, status, optional period, and ordering metadata, with no
   allocation before payment completion. Created also stages its schema-required
   transaction id with a canonical claim hash as a pair; updated/canceled carry
   neither. A null canceled/paused current period preserves stored dates.
3. **Record unsupported event** with only safe envelope metadata.

Recognized-event ambiguity is an error, never an ignored event. The normalizer
requires one recurring item, one configured price id, canonical Paddle ids,
valid dates with end after start, and a known status. It ignores buyer-authored
`custom_data.tier`, `user_id`, billing period, and passthrough.

A missing claim hash may pass normalization because renewal events can reach an
already-claimable subscription. The atomic adapter refuses to create a new paid
foundation unless either the existing subscription already has a complete pair
or the incoming command supplies a canonical hash with its transaction id.
Malformed hashes fail before persistence.

## Atomic provisioning algorithm

Before opening the database transaction, the processor validates the licence
derivation secret, generates a Keyforge id, derives the candidate plaintext in
memory, hashes it, and discards the plaintext. Only candidate id/hash/timestamp
cross the persistence port.

Inside one serializable Prisma transaction:

1. Insert the event through a database-unique event id with duplicate skipping.
   A zero insert count is a completed duplicate and performs no other write.
2. For an unsupported event, commit only the marker.
3. Upsert `User` by unique `paddleCustomerId`; never read buyer metadata for
   identity.
4. Create or converge `Subscription` by unique Paddle subscription id. Reject a
   different user, a partial/conflicting claim pair, or a new paid foundation
   without a claim credential.
5. Update tier/status/cancellation/period only when `(occurred_at, event-type
   precedence)` is semantically newer. Claim fields may fill independently from
   an older linked event, but only as an atomic matching pair.
6. Insert the credit allocation with unique source transaction id. On a
   duplicate source, read and verify that the existing allocation belongs to
   the same user/subscription and has the same amount and period.
7. Upsert the user's hash-only `LicenseKey`; reject an inactive existing row.
8. Run the pre-commit test seam, then commit all writes and the event marker.

Any throw aborts the transaction. The adapter converts it to a generic typed
persistence failure without serializing request bytes, database URLs, secrets,
or plaintext keys. The controller turns any processing `Err` into HTTP 503.

## Schema transition

- `User.paddleCustomerId String? @unique` binds existing/new users to Paddle.
- Legacy `User.licenseKey` becomes nullable and documented deprecated.
- `Subscription.paddleOccurredAt` and `paddleEventType` persist semantic-order
  state; existing rows remain nullable.
- `CreditAllocation.paddleTransactionId String? @unique` is nullable only for
  legacy rows; every new paid allocation supplies it.
- `PaddleWebhookEvent.eventId` is the persistent idempotency key.
- The predeploy SQL bridge adds the same nullable columns and unique indexes,
  creates the event table, and adds a fail-closed claim-pair check. It never
  deletes or rewrites existing production data.

## Test strategy and falsifiers

| Oracle | Decides | Plant/fault that must turn it red |
|---|---|---|
| Paddle adapter unit suite | Exact bytes, `ts:body`, five-second fake clock, multi-`h1`, parse-after-authentication | Mutate one body byte or move the fake clock six seconds |
| Domain normalizer unit suite | Exact price mapping, one recurring item, client metadata ignored, canonical ids/dates/status/claim | Remove Pro monthly from the catalog or trust `custom_data.tier` |
| Prisma adapter unit suite | One serializable unit of work, persistent marker, safe error translation | Move marker outside the transaction |
| Real AppModule/PostgreSQL journey | Signed raw HTTP -> user/subscription/allocation/key -> claim -> paid validation | Remove event uniqueness, allocation source uniqueness, price mapping, claim pair, or auth wiring |
| Restart and order campaigns | Durable duplicate handling and semantic convergence | Replace DB marker with memory or update state without `occurred_at` comparison |
| Pre-commit fault | Rollback truth and retry | Catch the fault and acknowledge it |
| Schema-deploy contract | Release surfaces apply this bridge before normal reconciliation | Remove a required table/index/nullable transition from the bridge |

Focused PostgreSQL runs use the repository's Feature 148 testcontainers helper
and NixOS Prisma engine fallback. The event-uniqueness/price-map mutation is
executed against a clean generated schema, recorded under `/tmp`, and restored
byte-for-byte before delivery.

## Out of scope and residual proof boundary

A local signed fixture proves the Proso boundary, not Paddle's infrastructure.
Real sandbox delivery, KYC/live configuration, production schema application,
and email/customer-portal recovery remain explicitly unproven and
Pedro/deployment-gated. No site, extension, workflow, release, or production
surface is changed.
