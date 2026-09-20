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
- [ ] T003 — Resolve the constitution's reading-source destination allowance
  through its governance process in a separately authorized change. Check:
  reviewed exception or ratified amendment with rationale/impact/version and
  propagation; live connection enablement remains blocked until then.

## Source contracts and normalization

- [ ] T004 — Add the four readonly domain types and boundary schemas to
  `packages/shared/src/`, with named exports. Check: focused schema tests accept
  valid nullable metadata and reject invalid offsets, duplicate block IDs,
  dangling/cyclic parents, and malformed source identities (REQ-003, REQ-006).
- [ ] T005 — Add `src/ports/reading-source.port.ts`, typed Result errors,
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
- [ ] T011 — Implement versioned `browser.storage.local` queue persistence and
  serialized writes. Check: common
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
  and no block-zero audio before the recovered segment (REQ-004, REQ-006).
- [ ] T019 — Bind queue cache identity to source/revision while reusing existing
  cache methods and preserving page keys. Check: integration fixture proves
  repeat/restart cache hits avoid synthesis, changed content/voice misses,
  connections do not collide, and no token is part of a cache key (REQ-005, INV-006).
- [ ] T020 — Enforce prefetch budget on paragraph and chunk lookahead using the
  existing pipeline. Check: fake-clock unit/contract tests assert 0 disables
  speculation, reservations never exceed budget, cache hits do not synthesize,
  lowering budget/pause/Stop invalidates work, and future items are not prefetched
  (REQ-005, REQ-009).

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

## Dependencies and current handoff

T004–009 establish the source boundary; T010–014 establish persistence/settings;
T015–020 establish playback evidence; T021–023 require both persistence and
playback evidence. T024–027 assemble those seams; T028–031 prove them. T003 is
required before enabling real source traffic, while synthetic implementation
checks can proceed independently. REQ-013 is a conditional bridge constraint,
not an untracked mandatory server implementation task.

Only T001 and T002 are complete in this drafting session. `make doctor` reports
the missing generated Prisma client; full verify and runtime gates are unrun.
The next implementation step is T004, with T003 tracked as an enablement gate.
