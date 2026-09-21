# Tasks — Feature 252

This is an ordered implementation backlog, not a record of implemented code.
Each task includes a falsifiable check. Paths under `src/` and `tests/` below
refer to `packages/extension/` unless a package is named. Keep each production
change and its focused test in the same conventional commit. The current
drafting task writes only this directory; all implementation paths below are
future work.

## Product contract

- [x] T001 — Read the constitution, Feature 095, extraction/playback/ports,
  composition, spoken-plan, shared contracts, and existing URL queue; record
  actual seams in plan.md. Check: no claim that tabless playback, source-relative
  checkpoints, or reliable natural completion already exists.
- [x] T002 — Draft the four verbatim contracts, product outcomes, requirements,
  privacy note, and falsifiers. Check: spec.md covers REQ-001–013; the plan records
  the source-destination governance block and optional bridge boundary.
- [x] T003 — Resolve the constitution's reading-source destination allowance
  through its governance process in a separately authorized change. Check:
  reviewed exception or ratified amendment with rationale/impact/version and
  propagation, recorded governing commit; production real-adapter paths/probes/
  retries stay hard-disabled until then. Offline scaffolding and isolated
  synthetic-fixture builds may precede it under acceptance-and-privacy v1.
  **Receipt:** constitution amendment v2.2.0 ratified and merged in PR #255,
  governing merge `3718437`. The governance gate is satisfied; runtime consent,
  credentials, composition and delivery gates remain separate obligations.

## Source contracts and normalization

- [x] T004 — Add the four readonly domain types and boundary schemas to
  `packages/shared/src/`, with named exports. Check: focused schema tests accept
  valid nullable metadata and reject invalid offsets, duplicate block IDs,
  dangling/cyclic parents, and malformed source identities (REQ-003, REQ-006).
- [x] T005 — Add `src/ports/reading-source.port.ts`, typed Result errors,
  InMemory and disabled NoOp adapters. Check: a common
  `tests/contract/reading-source.contract.test.ts` runs against both; repeated
  set-read is idempotent and NoOp never reports a remote acknowledgement
  (REQ-001, REQ-008).
- [ ] T006 — Add a pure document normalizer around existing extraction output.
  Check: `tests/unit/core/reading-source/` covers short text, nested lists,
  headings, entities, repeated blocks, unsupported structures, empty content,
  and partial coverage without publisher fetches (REQ-003).
- [ ] T007 — Add deterministic document revisions and source-position mapping.
  Check: unchanged bodies with different fetch time/read state retain revision;
  changed text/order changes it; spoken expansion, emoji, and lexicon changes
  never turn source positions into paragraph/spoken offsets (REQ-003, REQ-006).
- [ ] T008 — Implement Miniflux list/get using injected fetch and synthetic HTTP
  responses, including pagination/de-duplication and normalization. Check:
  register the HTTP adapter in T005's shared contract suite; validate safe IDs,
  path-prefix URLs, size bounds, abort/timeout, 401/403, 404, 429, malformed JSON,
  and 5xx; list/get make no status write (REQ-001–003).
- [ ] T009 — Implement the adapter's one-item set-read acknowledgement. Check:
  contract records the exact entry/status request, accepts 204, and repeats a
  lost-response request without toggling or touching another item (REQ-008).

## Persistence and credentials

- [ ] T010 — Define the immutable queue envelope, defaults, transitions, and
  `src/ports/listening-queue-store.port.ts` with an InMemory adapter. Check:
  `tests/unit/core/listening-queue/` proves source-tuple identity, deterministic
  ordering, manual refresh append, and single current owner (REQ-004, REQ-009).
- [ ] T011 — Implement the single IndexedDB transactional queue store and
  serialized writes defined in queue-envelope v1; use Dexie where appropriate.
  Check: common
  `tests/contract/listening-queue-store.contract.test.ts` runs against persistent
  and InMemory adapters; completion plus intent is atomic, stale writes rejected,
  restart round-trips snapshots, corrupt/future versions preserved, and quota
  errors do not erase checkpoints or report saved (REQ-004, REQ-008).
- [ ] T012 — Add bounded retention and idempotent migration handling without
  changing `queue:*` data. Check: limit/eviction/migration unit tests retain
  active and pending-ack records and never derive a checkpoint from
  `lastParagraphIndex`; existing queue handler tests remain green (REQ-004, REQ-012).
- [ ] T013 — Add local connection credential storage and runtime permission
  validation; exclude secrets from normal settings exports. Check: unit/security
  tests prove no request while disabled/denied, exact HTTPS origin/port binding,
  redirect rejection, disconnect deletion, and no token in DTOs/logs/TTS
  requests. Gate live enabling on T003 (REQ-002, REQ-011).
- [ ] T014 — Persist the four queue settings with additive defaults. Check:
  settings unit tests cover missing old fields, invalid enum/range values,
  restart round-trip, and no retroactive acknowledgement when enabled
  (REQ-009, REQ-012).

## Playback reuse and progress

- [ ] T015 — Add the tab-independent document-start seam in PlaybackService,
  retaining the existing page-start signature. Check: focused playback unit
  tests observe speech with no tab/highlight messages; original page-start,
  footer, cancellation, and provider tests still pass (REQ-005).
- [ ] T016 — Publish source-aligned playback observations on serial, prefetch,
  and chunked paths independently of tab presence. Check: unit fixtures project
  expanded speech into originalText and reject stale session/generation events;
  prefetched timing is not silently lost (REQ-005–007).
- [ ] T017 — Add explicit successful-range and natural-terminal evidence;
  distinguish manual Next/seek/Stop from natural end and detect truncated or
  throwing chunk producers. Check: playback unit regressions prove these faults,
  duplicate ended events, and seek-to-end cannot complete an item (REQ-007).
- [ ] T018 — Implement periodic and transition checkpoint commits and paused
  restart recovery. Check: `tests/integration/listening-queue-resume.test.ts`
  uses a fake clock/recreated coordinator for five-second persistence, pause,
  stop, changed revision, changed voice/lexicon/chunks, missing timing/cache,
  and no block-zero audio before the recovered segment; assert awaited 5 s
  audio-time commits, ≤10 s segments, ≤15 s compatible replay, 0.5×/2× rates
  and stalled-write pause (REQ-004, REQ-006).
- [ ] T019 — Bind queue cache identity to source/revision while reusing existing
  cache methods and preserving page keys. Check: integration fixture proves
  repeat/restart cache hits avoid synthesis, changed content/voice misses,
  connections do not collide, and no token is part of a cache key; budget
  oscillation never reshapes canonical units, including chunked adapters
  (REQ-005, INV-006).
- [ ] T020 — Enforce prefetch budget on paragraph and chunk lookahead using the
  existing pipeline. Check: fake-clock unit/contract tests assert 0 disables
  speculation, reservations never exceed budget, cache hits do not synthesize,
  lowering budget/pause/Stop invalidates work, old/new item overlap shares a
  global reservation, expanded text is trued up, handoff releases consumption,
  cancelled in-flight work retains reservation until settled, and future items
  are not prefetched (REQ-009).

## Completion and acknowledgement

- [ ] T021 — Derive eligibility from persisted heard ranges and full document
  coverage; atomically commit completion plus optional acknowledgement intent.
  Check: queue unit tests cover gaps, failed synthesis/decode, partial/unknown
  coverage, corrupt checkpoints, storage failure, and legacy progress/status
  messages; all produce zero unauthorized intents (REQ-007, REQ-008).
- [ ] T022 — Implement bounded acknowledgement recovery with persisted retry
  state and revision/connection validation. Check:
  `tests/integration/listening-queue-acknowledgement.test.ts` restarts before
  completion commit, before send, after remote success, and after a lost response;
  only committed intents send, retries have idempotent effect, and changed
  revision/auth failure/disconnect/disabled mark-read holds or cancels unsent work
  (REQ-008, REQ-009).
- [ ] T023 — Add once-only continuous advance and explicit Skip behavior.
  Check: queue integration tests prove completion starts the next item once,
  pending remote acknowledgement does not replay the previous item, synthesis
  failure pauses, and Skip/reorder/Remove never acknowledge (REQ-007–009).

## Composition and public surface

- [ ] T024 — Wire real/fallback source/store adapters and the coordinator in
  `src/composition/factories.ts` and the container. Check: integration exercises
  list → normalized document → real PlaybackService → cache → persisted
  completion → fixture acknowledgement, plus default-disabled startup and
  page/queue ownership replacement; no second audio engine (REQ-001, REQ-004–008).
- [ ] T025 — Add sender-validated queue/connection/settings messages. Check:
  handler unit tests reject malformed data and content-script credential access
  or fabricated completion; legacy `queue.*` requests remain compatible
  (REQ-010–012).
- [ ] T026 — Add connection/settings UI and the destination/privacy note.
  Check: DOM/unit accessibility tests cover masked token entry, visible addresses,
  all four settings, permission/auth errors, disconnect, both themes, and no
  first-connect synthesis (REQ-002, REQ-009–011).
- [ ] T027 — Add public queue playback and reorder/retry/remove controls.
  Check: DOM/unit accessibility tests verify roles/names, keyboard order, empty,
  loading, playing, resumable, changed-content, listened, pending/read/failed-ack
  states and truthful storage-failure feedback (REQ-010).

## Implementation proof

- [ ] T028 — Add seeded queue model properties with existing fast-check:
  start/pause/seek/skip/stop/reorder/restart, late events, revision changes,
  storage failures, and lost HTTP responses. Check: no acknowledgement without
  durable genuine completion, no cross-item progress, bounded work; retain seed,
  minimized trace, replay command, and replay first failures twice (REQ-006–009).
- [ ] T029 — Add the public Firefox journey using synthetic HTTPS Miniflux/TTS
  fixtures and the built extension. Check: actor uses role/name and keyboard,
  no article tabs/internal messages/storage writes; closes popup, restarts,
  resumes, changes settings, and observes ack/privacy states. Observer asserts
  network destinations, cache reuse, failure/no-mark-read and bounded soak;
  missing prerequisites block and Feature 095 receipt fields are complete.
- [ ] T030 — Run focused unit, contract, and integration projects, then unchanged
  `make verify`, `make fuzz`, and the applicable public user/delivery gates.
  Check: retain actual results; fix failures without skipping checks, requiring
  real vault credentials, or adding live Miniflux to verify. Record unrelated
  prerequisite failures honestly, including any still-blocked Feature 095 gate.
- [ ] T031 — Obtain the required review from an authorized different model
  family against the exact tested change; resolve findings and retain evidence.
  Update this feature's status/tasks with actual proof before delivery. Suggested
  commits use `feat(background): ...`, `feat(options): ...`, `test(background): ...`
  and `docs: ...`; no attribution trailers. This draft does not authorize a
  bridge deployment, credential retrieval, or changes outside its directory.

## Review-driven annex and migration work

- [x] T032-DOC — Specify exact digest/ID preimages, six golden vectors, Unicode
  positions, audio bindings and spoken-plan compatibility in document-identity
  v1; keep the four public contracts unchanged. Check: literal vectors recompute
  and metadata exclusions and revision-local ID stability are explicit.
- [x] T033-DOC — Specify queue-envelope v1 and single-store commit boundary,
  heard/session/generation invariants, 5 s cadence/10 s segments, ack lifecycle,
  global reservations and migration/downgrade semantics. Check: C/H/P findings
  each have a normative rule and a future implementation check.
- [x] T034-DOC — Add acceptance/privacy v1 and review-response mapping. Check:
  every REQ-001–013 and all 32 review finding IDs have a disposition; no server
  work is silently mandatory; threshold and physical-retention caveat are explicit.
- [ ] T032 — Implement identity annex/golden-vector adapter contract checks.
  Check: exact UTF-8 bytes and literal digests match in every adapter; repeats,
  parent changes, insertions, metadata mutations, surrogate repair, oversized
  offsets and expansion/lexicon/version mismatches behave as specified (REQ-003,
  REQ-006). Depends on T004/T006 and T032-DOC.
- [ ] T033 — Implement the complete envelope schema and atomic evidence/hint
  writes with transaction fault injection. Check: each interrupted put/commit
  restores whole old/new state, mismatched audio never seeks, stale session/
  generation is rejected, manifest/range limits fail closed, and cadence blocks
  playback until durable completion (REQ-004, REQ-006, REQ-007). Requires T010/T011.
- [ ] T034 — Add migration input/output fixtures, pure N→N+1 transform harness,
  versionchange rollback and startup validation/downgrade tests. No fictional
  legacy-v0 migration: start v1 empty. Check: interrupted upgrade, double run,
  future minReaderVersion, backup expiry, quota and explicit purge preserve or
  delete exactly the permitted data; URL queue remains separate (REQ-004, REQ-012).
- [ ] T035 — Implement persisted acknowledgement retry cycles/manual resend
  and global prefetch overlap properties. Check: restarting exhausted/sending
  never resets 3 attempts, Retry-After obeys limits, manual resend never plays
  audio, expansion true-up and 0→50000→0 budgets reuse canonical cached units,
  delayed cancelled A reservations constrain B (REQ-008, REQ-009).
- [ ] T036 — Implement the named parse5 allowlist, redirect/header confinement,
  exact mark-read body and purge/expiry protocol. Check: hostile HTML emits no
  requests; cross/same-origin 3xx never forwards token; disconnect/clear/remove
  delete the matrix across a crash, including backups/audio; expiry runs before
  access, with the documented suspended-browser limitation (REQ-002, REQ-003,
  REQ-011). Manifest/dependency edits belong to future implementation only.
- [ ] T037 — Implement per-control accessibility, consolidated error messages,
  local diagnostics and English/pt-BR catalog. Check: named public journey
  asserts all roles/names/states, keyboard/focus and live announcements, both
  themes/200% zoom/contrast, every error recovery, locale placeholder parity,
  diagnostics limits and no remote telemetry (REQ-010, REQ-011).
- [ ] T038 — Implement client source/epoch/sender isolation and all acceptance
  mappings. Check: `client-connection-binding` rejects substituted tuples and
  page-origin raw ack/credential requests; zero Proso source-bridge traffic;
  every named REQ-001–013 check is present. SERVER-252-001 is tracked only as a
  separate future spec (REQ-013).

## Dependencies and current handoff

T004–009/T032 establish source identity; T010–014/T033/T034 establish durable
persistence; T015–020 establish playback evidence. T021–023/T035 depend on both.
T036 establishes sanitization/retention before real-adapter assembly. T024–027/
T037/T038 assemble public/client boundaries. T028–031 run all named acceptance
checks, seed 252001 with 2,000 traces × 100 commands maximum and a 30-minute /
20-restart soak. Annex implementation tasks are required, not optional follow-up.

T003 gates **live source traffic** only; production must hard-disable that path
until the recorded governance decision lands. The v2.2.0 amendment is drafted,
not ratified; T003 remains open. Synthetic implementation can
proceed independently. REQ-013 is mandatory client validation; SERVER-252-001 is
explicitly outside this feature, with no implied server implementation task.

Only T001/T002 and T032-DOC/T033-DOC/T034-DOC document work is complete. The prior
draft's missing-Prisma doctor result is historical; runtime gates and a fresh
different-family verdict remain outstanding. The revision's document-only
validation is recorded in review-response.md. The next implementation work is
T004 with T032; no code, dependency or constitution change is authorized here.

### Amendment draft verification — 20/09/2026

The separately authorized branch `254-constitution-reading-source` updates only
the constitution and this feature's plan/tasks. PR #92 (`93a2e7e`) is the
standalone destination-amendment precedent; it required no separate governance
spec directory. Existing impact reports are retained and templates need no
destination-list propagation. This note supersedes the earlier scope statement
only for that constitution draft; no implementation or ratification is claimed.

`make help` passed. `make verify` exited 2 at `doctor`: "Prisma client is
missing; run make bootstrap". Bootstrapping would generate files outside this
documentation-only scope and was not performed. `make docs` passed (nine owned
documents; no expired reviews or broken links); its active-document registry
does not establish amendment correctness. Plain file checks passed for the
three-file scope, retained impact reports, unchanged Security/Governance rules,
draft version/T003 consistency and relative plan/task links. `git diff --check`
passed. Full verification, runtime
privacy/consent/completion checks, public-browser/fuzz gates and an independent
different-family verdict are not established by this draft. T003 stays open
pending Pedro H S Balbino's explicit ratification and the landed governing commit.
