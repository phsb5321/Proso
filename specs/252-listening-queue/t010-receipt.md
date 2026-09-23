# T010 — queue envelope, port and InMemory adapter

Verified on desktop, 23/09/2026. Base: `c1bbd67cd0ba26ba935fef8c4e0d05a5aa838040`.
Worktree: `proso-252-t010`; branch: `252-t010-queue-store`. Local commit only;
no push, production composition, live source requests or deployment.

## Scope and design

Hypothesis: source-tuple keys, immutable transitions and a serialized whole-envelope
compare-and-swap boundary can preserve ordering and a single owner without using
URLs as identity or allowing a failed write to publish partial state.
Falsifier: URL collisions, nondeterministic ties, manual refresh reordering old
entries, two playing owners, or any rejected transaction changing the snapshot.

- `packages/extension/src/core/listening-queue/`: readonly queue-envelope v1
  records (including future evidence/audio/ack/purge/migration fields), empty
  defaults, validated item creation, settings, deterministic ordering, membership
  refresh, manual reorder, owner replacement, Stop and paused session recovery.
- `packages/extension/src/ports/listening-queue-store.port.ts`: `load` and
  synchronous pure `transact`; sequence/session/generation/all connection epochs
  are checked before the transition. Only the store increments commitSequence.
- `packages/extension/src/adapters/listening-queue/`: test-only InMemory adapter,
  serialized writes, awaited snapshot digest checks, immutable detached input/output,
  failure injection before publication, redacted errors, no volatile fallback.
- `packages/extension/tests/unit/core/listening-queue/queue.test.ts`: 26 tests.
  `unwrap` throws on unexpected Err; no assertions silently return on failure.

Ordering uses oldest/newest publication time, unknown timestamps last in both
modes, then code-unit source-tuple comparison (not locale-dependent collation).
Manual refresh preserves existing order and appends only new tuples, sorted
oldest-first with the same tie-break. Conflicting duplicate new revisions/dates
fail rather than choose a page-dependent winner. Missing unread entries do not
erase local work. Existing snapshots/checkpoints/expiry remain pinned; adopting
changed content is deliberately reserved for T018's explicit restart flow.
Manual reorder cannot move the current owner or listened records.

Session IDs are supplied as 32 lowercase hexadecimal characters by a future
coordinator's cryptographically random 128-bit generator. This pure module does
not generate randomness or claim to prove entropy. Recovery requires a different
ID, retains queue selection, pauses playing records and clears stale page ownership.
No transition here creates completion evidence, acknowledgement intent or network
work. Whole-envelope atomicity is modeled, not durable disk persistence.

## Executed checks and review rubric

`[V]` means directly executed; it does not mean complete Feature 252 acceptance.

| Check | Oracle / negative case | Result |
|---|---|---|
| Tuple identity | Same URL across items/connections; URL-key mutation plant | [V] PASS; plant failed with expected 3 entries, received 1 |
| Deterministic ordering | Reversed arrival order, equal dates, unknown dates; remove tie-break plant | [V] PASS; plant failed exact order assertion |
| Manual refresh append | Existing reordered entries, nonzero source checkpoint, fixed expiry, absent unread entry; forced-sort plant | [V] PASS; plant failed exact order assertion |
| Single owner | Queue → queue → page → Stop, generation fences, paused recovery; omit-pause plant | [V] PASS; plant returned Err on invalid two-owner state |
| Atomic store boundary | Concurrent same-sequence writers, stale session/generation/epochs, injected failure, overflow, async callback, immutable snapshots | [V] PASS; failed writes leave previous envelope intact |
| Invalid input | Bad settings, conflicting duplicates, 101 entries, corrupt digest, future version, malformed ownership | [V] PASS; no truncation or empty-default success |
| Existing source behavior | Focused reading-source unit + contract tests alongside T010 | [V] PASS: 6 suites / 99 tests, no skips |
| Delivery floor | Unchanged `make verify` in nix-shell | [V] PASS, exit 0; actual verdict lines below |

Replay from this worktree:

```sh
NODE_OPTIONS=--experimental-vm-modules pnpm --filter @proso/extension exec jest \
  --selectProjects unit --selectProjects contract --maxWorkers="$(nproc)" \
  tests/unit/core/listening-queue/ tests/unit/core/reading-source/ \
  tests/unit/adapters/reading-source/ tests/contract/reading-source.contract.test.ts
nix-shell --option min-free 0 --option max-free 0 --run 'make verify'
```

The Nix options prevent host-wide automatic GC during tool resolution. Initial
`make doctor` failed with `Prisma client is missing; run make bootstrap`.
`make bootstrap && make build && make doctor` then exited 0. No gate changes.
Extension `tsc --noEmit`, scoped Biome and `git diff --check` also exited 0.
The new suite initially failed because the adapter module did not exist. Four
independent negative plants above then failed for their named assertions; all
plants were removed and the complete focused selection passed again.

Actual delivery output (23/09/2026):

```text
Delivery prerequisites ready (node v22.23.2, pnpm 10.30.3).
Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
smoke-server-boot: the built server starts and serves HTTP
Test Suites: 4 passed, 4 total
Tests:       44 passed, 44 total
no leaks found
no leaks found
dependency audit: 2 high/critical advisory(ies), 2 allowlisted path(s), 0 failures
brand assets: PASS
art provenance PASS — every image traces to its prompt
all icons fresh
preflight self-test: 45 assertions passed
AMO publication self-test PASS — 7 false-green plants caught
```

The server smoke accepts HTTP 503 on `/health` as routing evidence, not production
health. Existing lint warnings and two allowlisted dependency advisory paths were
not weakened or hidden. Full machine logs are in this worktree's `.artifacts/t010/`;
this tracked receipt preserves the deliverable evidence independently of scratch.

| Receipt | SHA-256 |
|---|---|
| `focused.log` | `0f74c5585e903a8a56b317ed0b8f9fc1e150dbc9241a19ab2342ad42465fbd1e` |
| `verify.log` | `4e8be8e9406c64ded5db8661c6815606f5d6b41cc6be8901f19f01ea5913017e` |
| `plant-identity.log` | `ea863784dcbc5fcb8c51d378a652e18ebb04068bea5e7c069a43f299f6996f6a` |
| `plant-ordering.log` | `af75d562b39c951b7229f814896dc5af90a7945c9915d4d87337e900fbb899fb` |
| `plant-manual.log` | `76ba59447b8b971abc8a1f02bac9623a5ec292184677df63b9854e94a29ea77f` |
| `plant-owner.log` | `3407ee5544cb56d98fae44d3c8735d8d4963244eb72cd318b58c423426ad5462` |

## Not implemented / not claimed

T011 IndexedDB, strict durability/crash tests and common persistent-store contract;
T012/T034 actual purge/migrations/backups; T014 persisted general-settings integration;
T018 playback/checkpoint cadence and changed-content adoption; T020 prefetch scheduler;
T021–T023 completion, acknowledgement and continuation; T033 full evidence/audio/
manifest schema and transition authorization; T036 expiry execution and purge cleanup;
production composition, credential storage, UI, browser acceptance and fuzz/soak.

Structural checks here are not a complete untrusted persisted-envelope decoder or
completion authority. Future lifecycle consumers must implement T033 before using
persisted evidence or dispatching acknowledgements. Migration or tombstone state
conservatively blocks mutations until its dedicated implementation exists. No
IndexedDB files, shared contracts, legacy `queue:*` data or product wiring changed.
