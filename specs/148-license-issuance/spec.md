# Feature 148 — Reusable licence issuance and account-free claim

## Scope

This feature supplies the smallest correct foundation a paid purchase can call:
one stable licence key per user, hash-only storage, buyer-secret claim
verification, and a rate-limited account-free claim endpoint.

It does **not** repair Paddle activation. `docs/money-path.md` proves the current
webhook boundary cannot safely create a purchase: signature verification throws,
no user row is created, client-controlled tier data defaults to Pro, failures are
acknowledged as processed, and event ordering is not durable. Plane #38 must
land signature verification, durable event idempotency, user creation, price-id
entitlements, ordering, and transactionality together. Feature 148 contains no
webhook production edit or webhook-specific test and does not claim that paying
now produces a key.

## Requirements

- **FR-001 — One row per user.** The database rejects a second `LicenseKey` row
  for the same user. Thirty-two concurrent issuance attempts converge on one
  stored row and all callers receive that row.
- **FR-002 — Stable, idempotent issuance.** Repeating issuance for a user
  returns the same customer-facing key. An inactive row is not treated as
  absence and is never exposed or silently replaced.
- **FR-003 — Key strength and recognisability.** Each row starts from 32 random
  bytes. The customer-facing key is `proso_live_` or `proso_test_` followed by
  the full lowercase-hex HMAC-SHA256 output.
- **FR-004 — Hash-only storage.** Persistence contains `sha256(licenceKey)`,
  never the plaintext key. Re-derivation is deterministic from the stored key
  id plus the deployment secret and is checked against the stored digest before
  disclosure.
- **FR-005 — Secret required, fail closed.** Production refuses to start unless
  `LICENSE_KEY_SECRET` contains at least 32 bytes. Domain issuance returns a
  typed error rather than deriving with a missing, short, or rotated secret.
- **FR-006 — Canonical claim transport.** The endpoint is exactly
  `POST /api/v1/license/by-transaction` with `{ transactionId, claimSecret }`
  and response types from merged main's `@proso/shared/schemas/checkout.ts`.
  Feature 148 does not add or modify a competing transport schema.
- **FR-007 — Transaction routes; secret authorises.** A key is returned only
  when `SHA-256(claimSecret)` matches the persisted claim hash using a
  constant-time digest comparison. A transaction id alone never authorises.
- **FR-008 — One unavailable observation.** Unknown transaction, purchase not
  recorded yet, missing/malformed stored claim credential, and wrong claim all
  return HTTP 202 with the same `{ status: 'pending', retryAfterMs }` body.
  Unknown and wrong claims execute the same application-level lookup, digest,
  schema-parse, and constant-time comparison path. No rejection-specific log or
  status is emitted.
- **FR-009 — Abuse bounded.** The real Nest module graph registers throttling
  for the public endpoint, including a five-request-per-minute limit.
- **FR-010 — Credential shape at persistence.** `license_claim_hash` is accepted
  only as exactly 64 lowercase hexadecimal characters. Malformed credential
  text rejects the write instead of creating an unclaimable purchase.
- **FR-011 — Claim can complete issuance.** Once a claim is proven, the claim
  path ensures the user's key and returns it. Reloading the success page returns
  the same key.
- **FR-012 — Schema reaches deployment.** Both checked-in Dokku release
  surfaces execute one predeploy script. Its idempotent SQL bridge adds exactly
  Feature 148's columns/indexes before the normal Prisma `db push`; unique-index
  creation refuses rollout if contradictory duplicate rows exist rather than
  deleting or choosing one.

## Key derivation decision

An independently random plaintext key cannot be both hash-only at rest and
recoverable after a success-page reload. The stable construction moves the
randomness into the stored key id:

```text
keyId     = randomBytes(32).toString('hex')
plaintext = prefix + HMAC-SHA256(LICENSE_KEY_SECRET,
                                 'proso.license.v1:' + keyId).hex
stored    = SHA-256(plaintext)
```

A database copy has the random id and digest but not the HMAC secret. A secret
without the database has no per-user id. Secret rotation without a matching
migration is detected because the re-derived key no longer matches the stored
digest; returning a key validation would reject is forbidden.

## Claim security model

Paddle deliberately appends `_ptxn=<transaction-id>` to checkout URLs. The id
therefore appears in browser history, logs, screenshots, and support messages;
it is routing metadata, not a bearer credential.

The site generates a 32-byte `claimSecret`, keeps it in `sessionStorage`, and
sends only `SHA-256(claimSecret)` as `custom_data.license_claim_hash`. The buyer
chose that hash. Paddle's signature later provides transport integrity for the
chosen value; it does not make the value unforgeable by the buyer, and no server
logic treats it as entitlement evidence. Plane #38 will derive entitlement from
the signed Paddle price id.

## Acceptance criteria

- WHEN 32 issuance attempts target one user concurrently against PostgreSQL THEN
  exactly one row exists and every attempt returns that row.
- WHEN a seeded paid purchase is claimed with its correct secret THEN the HTTP
  response contains a key that `POST /api/v1/license/validate` accepts with the
  seeded paid tier and credits.
- WHEN the same transaction is claimed with the wrong secret and an unknown
  transaction is claimed THEN both HTTP status and response body are identical
  and no key row exists.
- WHEN the claim request omits `claimSecret` THEN the canonical shared schema
  rejects it and no key is created.
- WHEN four claim requests arrive in one second THEN the real route guard blocks
  the fourth, and its rate-limit headers advertise the five-per-minute ceiling.
- WHEN a malformed claim hash reaches the persistence adapter THEN the write is
  rejected and no arbitrary credential text is stored.

## Explicit remaining gap

No production component in this feature writes `paddleTransactionId` or
`licenseClaimHash`. Real activation remains blocked on Plane #38, and the PR
must not be described as fixing completed purchases end to end. A production
rollout also requires setting a new 32-byte-or-longer `LICENSE_KEY_SECRET`
before the server starts; this PR does not deploy or rotate that secret.
