# Feature 175 — the doctor must reject a stale Prisma client, not just a missing one

Date: 14/08/2026

## Problem

`make verify` on `main` at `528f178` exited 2 with ~30 server type errors:

```
src/adapters/persistence/prisma-paddle-provisioner.ts(216,16): error TS2339:
  Property 'licenseClaimHash' does not exist on type 'SubscriptionUpdateInput'.
src/adapters/persistence/prisma-user.repository.ts(13,33): error TS2345:
  Property 'paddleCustomerId' is missing in type ...
```

That reads like broken source on `main`. It was not. `packages/server/prisma/schema.prisma`
declares every one of those fields — `paddleCustomerId` at line 41, `paddleTransactionId` at 61,
`licenseClaimHash` at 65, `paddleLastTransactionId` at 68, `paddleOccurredAt`/`paddleEventType`/
`paddleEventId` at 75-77 — added on 13/08 by `de57d29` (PR #156). The *generated client* under
`packages/server/src/generated/prisma/` was dated 11/02 and 04/03: five months stale, predating
the entire Paddle schema.

`scripts/delivery-doctor.sh` is the gate whose stated job is to "fail when required local delivery
tools or generated Prisma types are missing", and it passed, because line 25 tested only that
`client.ts` *existed*:

```bash
if [[ ! -f packages/server/src/generated/prisma/client.ts ]]; then
  printf 'Prisma client is missing; run make bootstrap\n' >&2
  exit 1
fi
```

Existence is not freshness. The drift therefore surfaced 20 lines later in the `verify` chain, as
`typecheck` output that points at application code rather than at the build artifact that is
actually wrong. `scripts/generate-prisma.sh` already fixes the condition in one command — including
a working NixOS engine fallback — so the entire cost of this failure was diagnosis.

This matters more than an ordinary papercut right now: GitHub Actions has produced nothing but
`startup_failure` since `2026-08-05T20:52Z`, and this repository has no branch protection (both
unavailable on a free plan for a private repo). Local `make verify` is not the best verification
surface, it is the only one. A local gate that passes on a stale artifact is the failure mode this
repository can least afford.

## Requirements

- **FR-001** The doctor rejects a generated Prisma client that does not match the current schema,
  not merely one that is absent.
- **FR-002** The rejection names the drift and the remedy, so the message is actionable without
  reading `tsc` output.
- **FR-003** A client generated before this feature — one carrying no drift record at all — is
  rejected rather than assumed fresh. Fail closed on unknown provenance.
- **FR-004** The freshness record is written on every generation path, including the NixOS engine
  fallback, which is the path that actually runs on this host.
- **FR-005** The record is a build artifact, never committed. It lives inside the already-ignored
  generated directory, so wiping the client wipes its record with it.

## Non-goal, stated explicitly

**This does not make CI green, and cannot.** The Actions outage is account-level billing
(`[pending] Pedro`); nothing in this repository's diff reaches it. This feature makes the *local*
floor honest, which is a strictly smaller claim.

It also covers the Prisma client only — not `packages/shared/dist`, which the server likewise
consumes as a built artifact and which the doctor still cannot tell stale from fresh. That gap is
recorded as next-slice #23 rather than silently widened here.

## Acceptance

`make doctor` exits 0 on a freshly generated client; exits non-zero naming both digests when
`schema.prisma` changes; exits non-zero naming missing provenance when the record is absent; and
returns to 0 when either is restored. `make verify` exits 0 on the branch.
