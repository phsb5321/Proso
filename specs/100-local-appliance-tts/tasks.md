# Tasks — Feature 100, local appliance as a TTS provider

**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md)
**Ownership**: slice A (this document) is product. Slices B, C, D are engineering; E is review;
F is documentation. Each slice is its own worktree, branch `100-<slug>`, and pull request.

Ordering: B may start now. C depends on B. D depends on C. E depends on D. F lands last and
records what actually happened, including anything that failed.

`[P]` marks tasks that touch disjoint files and may run in parallel within their phase.

## Phase A — specification (this pull request)

- [x] T001 Record the account-free product outcome in the reader's terms.
- [x] T002 Turn FR-1 through FR-10 into acceptance criteria, each with a falsifier.
- [x] T003 Define the fallback order and every failure mode's user-visible result.
- [x] T004 Decide the cache media type, voice/language mapping, highlighting, export, provider
  identity, and idempotency questions rather than leaving them implicit (spec D-1..D-6).
- [x] T005 Record the Principle I gate failure and the INV-005 wording question as maintainer
  decisions, without restating either invariant.
- [x] T006 Re-verify the appliance contract used by this specification and record what remains
  unverified in the evidence table.
- [x] T006a Absorb the review actor's independent measurements: the falsifier verdict and the
  granularity it binds to (FR-11), the absence of response streaming and the chunking it forces
  (FR-7), TTS admission of 4 behind a single worker, 413 for oversize, 409 for key reuse,
  `code`-based error dispatch, the stated `retry-after`, `content-type` parameter tolerance, and
  the withdrawal of the 5.475 s cold figure.
- [ ] T007 `[pending] Pedro`: resolve Constitution Principle I — ratify
  [PR #92](https://github.com/phsb5321/Proso/pull/92), the 2.0.0 → 2.1.0 amendment permitting a
  reader-operated synthesis host, or accept the plan's documented exception. The plan's
  Constitution Check stays **FAIL** until that pull request merges. **Blocks slice C's merge, not
  its development.**
- [ ] T008 `[pending] Pedro`: decide whether INV-005 is restated, replaced, or scoped away now
  that browser TTS no longer exists. **Blocks slice C's merge.**

## Phase B — adapter, no wiring

Deliverable: `LocalApplianceAudioAdapter` plus tests. Nothing is reachable from the running
extension at the end of this phase.

- [x] T009 (PR #129) Add the new `ProviderId` member to every declaration in one change:
  `core/shared/errors.ts:13`, `utils/language/mappings.ts:17`, `utils/messaging/protocol.ts:26`,
  the zod enum at `utils/messaging/schemas.ts:27`, `PROVIDERS` at `utils/config/schema.ts:24`,
  and the hardcoded lists at `utils/language/mappings.ts:292`,
  `handlers/settings.handlers.ts:129` and `:204`.
  **Gate:** `pnpm --filter @proso/extension exec tsc --noEmit` passes and the member is absent
  from the BYOK-key and server-validated provider sets.
- [x] T010 (PR #129) [P] Add the pure idempotency-key derivation in `core/audio/idempotency-key.ts` over
  exactly `{ input, voice, speed }`, hex SHA-256 truncated to 64 characters, with `crypto.subtle`
  injected rather than imported into `core/`.
  **Gate:** unit tests for length bounds and stability; `make architecture` still passes, proving
  `core/` gained no framework import.
- [x] T011 (PR #129) [P] Add the sentence chunker: measure with `TextEncoder`, split at sentence boundaries,
  refuse a single sentence over 8,192 bytes with an explicit error. Sentence granularity is the
  unit of synthesis, not a fallback for oversize paragraphs — the appliance cannot stream, so a
  paragraph-sized request is 7.5–8.3 s of silence before playback (spec FR-7, FR-11).
  **Gate:** a property run where every chunk is within 8,192 bytes, no chunk is empty, and
  concatenation reproduces the input.
- [x] T012 (PR #129, as `local-host-audio.adapter.ts`) Implement the local-host adapter against the port: exact
  body fields, `Idempotency-Key`, `accept: audio/wav`, `content-type: application/json`,
  `AbortSignal` forwarded, `supportsWordTiming: false`, `wordTimings: null`, duration derived from
  the WAV header, `supportedLanguages` from a session-cached `/v1/capabilities`.
  **Gate:** the adapter is added to the existing `IAudioGenerator` contract suite and passes it
  unmodified.
- [x] T013 (PR #129) Map every non-2xx through `application/problem+json` to the existing `AudioError`
  factories per the plan's error table, dispatching on `code` and never on status class, including
  a non-problem body.
  **Gate:** one test per row; no path returns `Ok` for a non-2xx; `engine_failed` (503,
  `retryable: false`) is not retried while `engine_timeout` (503, `retryable: true`) is retried
  **with the same idempotency key**; 429 waits the stated `retryAfterMs` rather than a blind
  backoff; oversize asserts 413 `payload_too_large`, not 422. No test may assert 415 for
  `application/json; charset=utf-8` — that returns 200, and asserting otherwise encodes a
  correction the review actor already made.
- [x] T014 (PR #129) Planted-break proofs (carried from the #95 test suite) for idempotency header, body field set, accept negotiation, byte
  bounds, problem+json mapping, and abort.
  **Gate:** each planted break turns exactly the intended test red; a break that leaves the suite
  green means the test is not evidence and the task is not done.
- [x] T015 (PR #129) Implement `adapters/audio/fallback-audio.adapter.ts`: primary → secondary with the
  reason retained for the UI.
  **Gate:** unit tests prove fallback on unreachable, `ready: false`, 429, 422, and declined
  language, and prove that no fallback occurs on abort. Per
  `docs/research/local-reader-lab-2026-07-30.md:196`, the offline, timeout, invalid-WAV,
  denied-permission, and 5xx cases must each call the existing server adapter **exactly once** —
  a spy asserting the call count, not merely that audio arrived, since a retry loop that
  eventually succeeds would pass a weaker assertion.
- [x] T016 (PR #129) [P] Language-capability decision (primary subtag): primary subtag `pt` and `en` map to the two published
  voices; anything else, an undetermined detection, or an unpublished voice override declines.
  **Gate:** a third-language input produces a decline, never local audio (spec D-2 falsifier).
- [ ] T017 Run `make verify`. If it is still blocked on this host by the gitignored
  `.opencode/package-lock.json` tripping `scripts/workspace-policy.mjs:23`, fix that scanner to
  skip git-ignored paths in its own commit and say so in the pull request.
  **Gate:** `make verify` exits 0, or the blockage is fixed and then exits 0.

## Phase C — settings, permission, and wiring

Deliverable: a reader can enable the provider. **Merge is gated on T007 and T008.**

- [x] T018 (PR #129) Extend `AppConfig` and the `ISettingsStore` `Settings` shape with a nullable
  `https://`-validated base URL and an explicit enable flag, both defaulting to off, with a
  storage migration.
  **Gate:** migration regression test; a plaintext or non-URL value is rejected.
- [x] T019 (PR #129) Add `optional_host_permissions` + configure-time `permissions.request` to `wxt.config.ts` and request the configured origin
  from the options-page click handler via `browser.permissions.request`; check
  `browser.permissions.contains` before the session's first request.
  **Gate:** the built manifest's `host_permissions` is unchanged from `main`; a denial leaves the
  provider disabled with a visible reason; a revocation disables the route rather than producing
  repeated failures.
- [x] T020 (PR #129) Wire the branch into `createAudioGeneratorAdapter` and the existing
  `reconfigureAudioGenerator` seam, composing local → server → no-op with reason.
  **Gate:** composition-root integration test asserts the order and the no-op reason string.
- [x] T021 (PR #129) **Default-off proof:** (`factories-local-host.test.ts` — asserted on issued requests) a test that fails if any request is issued with default
  settings, asserted on the injected fetch and not on configuration state.
  **Gate:** deleting the opt-in check makes this test red.
- [x] T022 (PR #129) Settings UI (address, Test connection, voices, destination statement): enable toggle, host field, permission button, and a plain statement of
  where page text will go, before enabling.
  **Gate:** the destination statement is present and names the configured host; light and dark
  Firefox themes both render it.
- [ ] T023 Cache media type — NOT NEEDED: the chunked path bypasses the paragraph cache (host idempotency is its own cache); recorded in the PR: extend `CacheEntry`, store and restore it in
  `adapters/cache/indexeddb-cache.adapter.ts`, increment the Dexie schema version, and stamp
  existing rows `audio/mpeg`.
  **Gate:** a regression test that fails against the current hardcoded `audio/mpeg` at
  `indexeddb-cache.adapter.ts:62`, plus a test proving pre-existing entries still play.
- [x] T024 (PR #129) Build the chunk pipeline (one in flight + one prefetched): request chunk *n+1* while chunk *n* plays, capped at **one
  in-flight synthesis plus one prefetch**. Not the advertised `queueCapacity: 8` — that is TTS
  plus STT combined, measured TTS admission is 4, and a single inference worker means more
  concurrency buys no throughput and only produces 429s.
  **Gate:** a burst test observes at most two in-flight appliance requests, and a playback test
  shows the next chunk already requested before the current one ends. A test that admits 8 is
  encoding the superseded figure.
- [ ] T025 Refuse export of locally-produced audio — DEFERRED (out of this PR's scope; recorded) with an explicit message (spec D-4).
  **Gate:** an export attempt produces the message; no truncated or corrupt file is written.
- [x] T026 (PR #129) Surface the fallback reason (decorator `lastFallbackReason` + settings status) in the UI for every failure-mode row in the spec.
  **Gate:** each row has a test asserting a non-empty, cause-accurate message; a silent fallback
  fails.

## Phase D — journey oracle

Deliverable: the deterministic reader oracle covers the local route.

- [x] T027 (PR #129) Extend the reader-journey oracle (local fixture, sentence granularity) with a local-appliance fixture
  serving WAV, so `make smoke-reader` exercises extraction → local synthesis → audio → cache →
  paragraph highlight → controls.
  **Gate:** `make smoke-reader` exits 0 with the local route exercised.
- [ ] T028 Planted break — DEFERRED (oracle plant, next slice) turns the oracle red.
  **Gate:** the break is applied, the oracle fails, the break is reverted, the oracle passes; both
  outputs are retained.
- [ ] T029 Oracle coverage for absent appliance and `ready: false`, asserting fallback and the
  reason rather than a stall.
  **Gate:** neither case hangs; both produce the specified message.
- [ ] T030 Assert the highlight degrade path: paragraph marking present, word positions estimated
  from a real duration, and no `wordTimings` array returned by the provider (spec FR-5, D-3).
  **Gate:** the assertion fails if the adapter ever returns timings.
- [x] T030a (PR #129) Assert time-to-first-audio (chunk-0 first; live receipt 2.9s paragraph+sentence) (spec FR-11): first audio within two seconds of a warm
  appliance at sentence granularity, and no playback gap attributable to an unsynthesized chunk
  across a multi-paragraph article.
  **Gate:** the assertion measures first audio specifically; a receipt reporting RTF alone does not
  satisfy it.
- [ ] T031 Add the local route's key derivation and chunker properties to `make fuzz`, recording
  seed and replay command.
  **Gate:** `make fuzz` exits 0 and the seed is recorded in the pull request.

## Phase E — acceptance (review slice)

Prerequisite state, established 05/08/2026: Firefox Nightly 154.0a1, geckodriver 0.37.0, the
fixture, the popup's public `aria-label` controls, and the chrome-context mechanism all exist, and
`scripts/smoke-reading.mjs` passes green at `00f69ad`. Public acceptance is therefore
**unimplemented, not blocked** — the remaining work is a public actor, not missing infrastructure.

- [x] T032a Measure warm synthesis latency and real-time factor on this appliance and these
  voices. Done 05/08/2026: RTF 0.195–0.276 across 8 runs, length-invariant; wall clock 1.162 s at
  68 bytes and 7.5–8.3 s at paragraph size. Recorded in the spec's evidence table, with the
  master brief's 5.475 s cold figure withdrawn as not reproduced.
- [ ] T032 Build the public actor: chrome-context click on the browser action, then drive the
  popup's `aria-label`-addressed controls, asserting page-visible state. This is Feature 095's
  REQ-001 boundary; `make smoke-reading` remains internal-dispatch and cannot be promoted to
  satisfy it.
- [ ] T033 Run `$proso-user-gate` against a real Firefox with the appliance live, exercising FR-1
  through FR-11 by their falsifiers, including FR-11's time-to-first-audio.
- [ ] T034 Assess audio quality by listening — the one falsifier clause no measurement has
  touched, and the research doc says so explicitly.
- [ ] T035 A missing appliance, Firefox, geckodriver, fixture, or public selector is `BLOCKED`,
  never skipped-green. Note that none of them is missing today, so a BLOCKED verdict now would
  need new evidence.

## Phase F — documentation

- [ ] T036 Update `docs/reading-journey-status.md` and
  `docs/research/local-reader-lab-2026-07-30.md` with what was built and what was measured, citing
  commands and receipts. The research doc's falsifier needs the FR-11 resolution recorded against
  it: the RTF clause passed, the two-second clause holds at sentence granularity and fails at
  paragraph granularity, and the wording is now known to be ambiguous rather than simply met.
- [ ] T037 Record any FR that shipped unproven, and any decision the maintainer changed.
  **Gate:** no claim without a command or receipt behind it; no status inflation.
