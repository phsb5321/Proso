# Feature 152 — Paid identity reaches the request

## Goal

Make a licence key that a customer presents actually identify them, without
making a key a precondition for reading.

## The defect

`docs/money-path.md` records it as one line of the money path: *"the server
never reads the `X-License-Key` header at all, because the guard that would read
it is never registered."* Three facts, each independently true on `main`
(`8ad9539`):

1. `AuthModule` binds `LicenseKeyGuard` as `APP_GUARD` and **nothing imports
   `AuthModule`** — `grep -rn AuthModule packages/server/src` returned only its
   own declaration. A guard no module registers never runs.
2. The guard, had it run, stored `request.licenseKey` and never resolved a user.
   `SubscriptionController`, `CreditsController` and `TTSController` all read
   `req.userId`, which nothing in the server ever assigned.
3. So every request is anonymous. `GET /api/v1/subscription` and
   `GET /api/v1/credits/balance` answer 401 to everyone, `POST
   /api/v1/subscription/checkout` answers `400 Authentication required for
   checkout` to everyone, and a perfectly paid key meets the free tier's 402 at
   synthesis.

This is the "method exists and is never called" shape. Every unit test of the
pieces passes; the assembled system has no paid users because it has no users.

Importing the module as written would have been the wrong fix: the guard threw
`UnauthorizedException` on a missing header, so registering it globally would
have required an account for every request — a direct violation of INV-001 and
of the account-free reading journey the product ships.

## Requirements

- **FR-001:** The licence-key guard is registered in the module graph the
  deployable actually bootstraps, and runs before every non-`@Public()` route.
- **FR-002:** A request with no `X-License-Key` header proceeds with no identity
  attached. The free tier still requires no account (INV-001), and an empty or
  whitespace-only header value counts as no key rather than as a bad one.
- **FR-003:** A request presenting a key is identified by SHA-256 of the key
  resolved through `UserRepositoryPort.findByLicenseKeyHash`; on a match the
  user's id is attached to the request as `userId`. The raw key never reaches a
  repository query.
- **FR-004:** A presented key that resolves to no user is answered `401`. A
  silent downgrade to Free is forbidden: it is indistinguishable, from the
  reader's side, between a typo and a lapsed subscription.
- **FR-005:** `@Public()` routes — the Paddle webhook and
  `POST /api/v1/license/validate` — bypass the guard entirely, performing no
  repository lookup even when a key is present. `GET /health` answers without a
  key.
- **FR-006:** The proof runs through Nest's real module graph over a listening
  socket. A test that instantiates the guard directly cannot fail on the defect
  this feature fixes, and therefore does not count as evidence.

## Non-goals

This slice repairs identity propagation *once a key exists*. It does not pretend
one exists yet. Untouched, and still broken exactly as `docs/money-path.md`
records: checkout (the Paddle adapter returns a stub URL), webhook signature
verification (throws unconditionally), licence issuance (no key is ever minted),
and the extension's missing key field. Each is a separate slice.

The guard does not deduplicate its SHA-256 with `LicenseController`'s. Feature
148 introduces a hashing helper; a one-line `node:crypto` call is preferable to
coupling this branch to an unmerged one, and the duplication ratchet can be
satisfied after both merge.

## Routes whose semantics change

| Route | Before | After |
|---|---|---|
| `GET /api/v1/subscription`, `/api/v1/credits/*`, `POST /api/v1/subscription/checkout` | 401/400 for everyone, including paid | Unchanged with no key; serves the identified user with a valid key |
| `POST /api/v1/tts/synthesize` | Free tier for everyone; a paid key 402s | Unchanged with no key; the key's tier and credits apply with a valid key |
| Any non-`@Public()` route with an unrecognised key | Header ignored, request served anonymously | `401` |
| `@Public()` routes, `GET /health` | — | Unchanged |

The last row is the only new rejection. The extension sends `X-License-Key` only
when a key is configured (`proso-api.adapter.ts:176`, `:256`), so an
account-free reader never presents one and never meets it.

## Acceptance

```bash
cd packages/server && npx jest --runInBand tests/integration/license-key-identity.spec.ts
```

Falsifier: delete `AuthModule` from `AppModule.imports` and the four
identity assertions go red while the account-free assertions stay green.
