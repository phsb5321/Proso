# Feature 175 — harness gates that currently fail open must fail closed

Date: 14/08/2026

Two parts, one thesis. The first was found by running the floor; the second was
found by the adversarial review of the first. Both are gates that pass when they
should not, which is the only direction a gate must never fail — and the failure
matters more than usual right now, because CI has produced nothing for nine days
and this repository has no branch protection, so these local gates are the whole
verification surface.

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

---

# Part 2 — three more gates that fail open

The different-family adversarial review of Part 1 returned `FAIL`. It passed the requirement
covering this change (REQ-6: "modifies only documentation, scripts, and specs ... no workflow,
production, release, or deploy file is changed") and instead found three pre-existing holes in the
surrounding harness. They were verified against the code before being accepted, and all three are
real.

## P2-1 — a baseline with no expiry never expires

`knip-ratchet.mjs:83` and `osv-ratchet.mjs:57` both expired their baseline with:

```js
if (Date.parse(`${baseline.expires}T00:00:00Z`) < Date.now()) { throw ... }
```

When `expires` is absent the template is `"undefinedT00:00:00Z"`, `Date.parse` returns `NaN`, and
`NaN < Date.now()` is **`false`** — so the ratchet does not expire, it silently stops ratcheting.
Neither top-level schema check required `expires` to be present, so nothing else caught it. The
same `NaN` bypass sits at `check-active-docs.mjs:27` for a malformed (rather than absent) value.

A second, quieter case: the pattern alone is not enough. Measured on this Node, `2026-13-01` parses
to `NaN`, but `2026-02-30` parses **finite** and rolls forward to `2026-03-02` — so an impossible
date is accepted and means a later day than the one written. The validator round-trips the parsed
date back to `YYYY-MM-DD` and rejects any value that does not survive.

## P2-2 — blank ownership satisfies the ownership contract

Every baselined finding must carry an owner, reason and issue, checked as `typeof x !== 'string'`.
That accepts `''`. A finding could be baselined with a blank owner and reason and still satisfy the
contract that says tracked debt is owned debt.

## P2-3 — a gate receipt bound to the wrong base validates

`validate-gate-receipt.sh:39` compared the receipt's `baseRef` **only when `DIFF_BASE_REF` was
set**, and `adversarial-review.sh:106` calls it without that variable. `write-gate-receipt.sh:14`
honours `DIFF_BASE_REF`, so a receipt recorded against `HEAD^` passed validation, and
`adversarial-review.sh:108` then reads that same `baseRef` back to build the change bundle —
showing the reviewer a fraction of the change while still reporting a valid gate. The two bundles
are demonstrably different artifacts: the `HEAD^` receipt records `diff_sha256 41dc533d`, the
`origin/main` receipt `99caf4f3`.

The validator now defaults the expected base to `origin/main` instead of skipping the check. That
was necessary but not sufficient, and the second review round said so: defaulting still let an
*inherited* `DIFF_BASE_REF=HEAD^` select the base at both ends — the writer records it, the
validator then expects that same value and agrees with itself. The delivery review is therefore
pinned to `origin/main` in `adversarial-review.sh`, for both receipt validation and bundle
construction, rather than inherited from the environment or read back from the receipt it is
supposed to be checking.

## P2-4 — a receipt's verification time is unchecked

The receipt schema validated `verifiedAt` as `type == "string"`, so a receipt could record a
nonsense verification time and still pass. It is now round-tripped through `date -u`: the value
must parse as UTC *and* re-render to exactly what was recorded, which rejects `not-a-time`, the
empty string, `2026-13-45T99:99:99Z`, and the parseable-but-non-canonical `2026-08-14 17:00:00`.

## Part 2 acceptance

Each hole is planted and observed red, then reverted green: baseline `expires` removed, set to
`soon`, and set to `2026-02-30`; a blank `owner`/`reason` on a baselined finding; a malformed
`expires` and blank `owner` in `docs/active-docs.json`; and a receipt written against `HEAD^`.

The last plant is run through the whole adversarial path, which is what the second review round
asked for: `GENERATOR_FAMILY=anthropic DIFF_BASE_REF=HEAD^ make adversarial` exits non-zero with
`Gate receipt base mismatch: expected origin/main, got HEAD^`. The bundle built during that run
hashes to `2a3dfefd`, identical to the legitimate `origin/main` bundle — evidence that the pin
covers construction as well as validation, so the reviewer cannot be handed a truncated diff even
while the receipt is being rejected.

Each of the four `verifiedAt` values above is planted and observed red, with the receipt restored
green between plants.
