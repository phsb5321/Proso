# Tasks — Feature 097, local appliance as a TTS provider

**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md)
**Ownership**: slice A (this document) is product. Slices B, C, D are engineering; E is review;
F is documentation. Each slice is its own worktree, branch `097-<slug>`, and pull request.

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
- [ ] T007 `[pending] Pedro`: resolve Constitution Principle I — ratify an amendment naming a
  reader-operated destination, or accept the plan's documented exception. **Blocks slice C's
  merge, not its development.**
- [ ] T008 `[pending] Pedro`: decide whether INV-005 is restated, replaced, or scoped away now
  that browser TTS no longer exists. **Blocks slice C's merge.**

## Phase B — adapter, no wiring

Deliverable: `LocalApplianceAudioAdapter` plus tests. Nothing is reachable from the running
extension at the end of this phase.

- [ ] T009 Add the new `ProviderId` member to every declaration in one change:
  `core/shared/errors.ts:13`, `utils/language/mappings.ts:17`, `utils/messaging/protocol.ts:26`,
  the zod enum at `utils/messaging/schemas.ts:27`, `PROVIDERS` at `utils/config/schema.ts:24`,
  and the hardcoded lists at `utils/language/mappings.ts:292`,
  `handlers/settings.handlers.ts:129` and `:204`.
  **Gate:** `pnpm --filter @proso/extension exec tsc --noEmit` passes and the member is absent
  from the BYOK-key and server-validated provider sets.
- [ ] T010 [P] Add the pure idempotency-key derivation in `core/audio/idempotency-key.ts` over
  exactly `{ input, voice, speed }`, hex SHA-256 truncated to 64 characters, with `crypto.subtle`
  injected rather than imported into `core/`.
  **Gate:** unit tests for length bounds and stability; `make architecture` still passes, proving
  `core/` gained no framework import.
- [ ] T011 [P] Add the UTF-8 byte-bound splitter: measure with `TextEncoder`, split at sentence
  boundaries, refuse a single over-long sentence with an explicit error.
  **Gate:** a property run where every produced part is within 8,192 bytes and concatenation
  reproduces the input.
- [ ] T012 Implement `adapters/audio/local-appliance-audio.adapter.ts` against the port: exact
  body fields, `Idempotency-Key`, `accept: audio/wav`, `content-type: application/json`,
  `AbortSignal` forwarded, `supportsWordTiming: false`, `wordTimings: null`, duration derived from
  the WAV header, `supportedLanguages` from a session-cached `/v1/capabilities`.
  **Gate:** the adapter is added to the existing `IAudioGenerator` contract suite and passes it
  unmodified.
- [ ] T013 Map every non-2xx through `application/problem+json` to the existing `AudioError`
  factories per the plan's error table, including a non-problem body.
  **Gate:** one test per row; no path returns `Ok` for a non-2xx.
- [ ] T014 Planted-break proofs for idempotency header, body field set, accept negotiation, byte
  bounds, problem+json mapping, and abort.
  **Gate:** each planted break turns exactly the intended test red; a break that leaves the suite
  green means the test is not evidence and the task is not done.
- [ ] T015 Implement `adapters/audio/fallback-audio.adapter.ts`: primary → secondary with the
  reason retained for the UI.
  **Gate:** unit tests prove fallback on unreachable, `ready: false`, 429, 422, and declined
  language, and prove that no fallback occurs on abort. Per
  `docs/research/local-reader-lab-2026-07-30.md:196`, the offline, timeout, invalid-WAV,
  denied-permission, and 5xx cases must each call the existing server adapter **exactly once** —
  a spy asserting the call count, not merely that audio arrived, since a retry loop that
  eventually succeeds would pass a weaker assertion.
- [ ] T016 [P] Language-capability decision: primary subtag `pt` and `en` map to the two published
  voices; anything else, an undetermined detection, or an unpublished voice override declines.
  **Gate:** a third-language input produces a decline, never local audio (spec D-2 falsifier).
- [ ] T017 Run `make verify`. If it is still blocked on this host by the gitignored
  `.opencode/package-lock.json` tripping `scripts/workspace-policy.mjs:23`, fix that scanner to
  skip git-ignored paths in its own commit and say so in the pull request.
  **Gate:** `make verify` exits 0, or the blockage is fixed and then exits 0.

## Phase C — settings, permission, and wiring

Deliverable: a reader can enable the provider. **Merge is gated on T007 and T008.**

- [ ] T018 Extend `AppConfig` and the `ISettingsStore` `Settings` shape with a nullable
  `https://`-validated base URL and an explicit enable flag, both defaulting to off, with a
  storage migration.
  **Gate:** migration regression test; a plaintext or non-URL value is rejected.
- [ ] T019 Add `optional_host_permissions` to `wxt.config.ts` and request the configured origin
  from the options-page click handler via `browser.permissions.request`; check
  `browser.permissions.contains` before the session's first request.
  **Gate:** the built manifest's `host_permissions` is unchanged from `main`; a denial leaves the
  provider disabled with a visible reason; a revocation disables the route rather than producing
  repeated failures.
- [ ] T020 Wire the branch into `createAudioGeneratorAdapter` and the existing
  `reconfigureAudioGenerator` seam, composing local → server → no-op with reason.
  **Gate:** composition-root integration test asserts the order and the no-op reason string.
- [ ] T021 **Default-off proof:** a test that fails if any request is issued with default
  settings, asserted on the injected fetch and not on configuration state.
  **Gate:** deleting the opt-in check makes this test red.
- [ ] T022 Options UI: enable toggle, host field, permission button, and a plain statement of
  where page text will go, before enabling.
  **Gate:** the destination statement is present and names the configured host; light and dark
  Firefox themes both render it.
- [ ] T023 Cache media type: extend `CacheEntry`, store and restore it in
  `adapters/cache/indexeddb-cache.adapter.ts`, increment the Dexie schema version, and stamp
  existing rows `audio/mpeg`.
  **Gate:** a regression test that fails against the current hardcoded `audio/mpeg` at
  `indexeddb-cache.adapter.ts:62`, plus a test proving pre-existing entries still play.
- [ ] T024 Concurrency cap across playback and prefetch at the published queue capacity of 8.
  **Gate:** a burst test observes at most 8 in-flight appliance requests.
- [ ] T025 Refuse export of locally-produced audio with an explicit message (spec D-4).
  **Gate:** an export attempt produces the message; no truncated or corrupt file is written.
- [ ] T026 Surface the fallback reason in the UI for every failure-mode row in the spec.
  **Gate:** each row has a test asserting a non-empty, cause-accurate message; a silent fallback
  fails.

## Phase D — journey oracle

Deliverable: the deterministic reader oracle covers the local route.

- [ ] T027 Extend `tests/integration/reader-journey.test.ts` with a local-appliance fixture
  serving WAV, so `make smoke-reader` exercises extraction → local synthesis → audio → cache →
  paragraph highlight → controls.
  **Gate:** `make smoke-reader` exits 0 with the local route exercised.
- [ ] T028 Planted break in the local path turns the oracle red.
  **Gate:** the break is applied, the oracle fails, the break is reverted, the oracle passes; both
  outputs are retained.
- [ ] T029 Oracle coverage for absent appliance and `ready: false`, asserting fallback and the
  reason rather than a stall.
  **Gate:** neither case hangs; both produce the specified message.
- [ ] T030 Assert the highlight degrade path: paragraph marking present, word positions estimated
  from a real duration, and no `wordTimings` array returned by the provider (spec FR-5, D-3).
  **Gate:** the assertion fails if the adapter ever returns timings.
- [ ] T031 Add the local route's key derivation and splitter properties to `make fuzz`, recording
  seed and replay command.
  **Gate:** `make fuzz` exits 0 and the seed is recorded in the pull request.

## Phase E — acceptance (review slice)

- [ ] T032 Run `$proso-user-gate` against a real Firefox with the appliance live, exercising FR-1
  through FR-10 by their falsifiers.
- [ ] T033 Measure warm synthesis latency and real-time factor on this appliance and these voices,
  and report the result against the research doc's falsifier — including if it fails. The existing
  benchmark used a different node and a different English voice, so it does not transfer.
- [ ] T034 A missing appliance, Firefox, geckodriver, fixture, or public selector is `BLOCKED`,
  never skipped-green.

## Phase F — documentation

- [ ] T035 Update `docs/reading-journey-status.md` and
  `docs/research/local-reader-lab-2026-07-30.md` with what was built and what was measured, citing
  commands and receipts.
- [ ] T036 Record any FR that shipped unproven, and any decision the maintainer changed.
  **Gate:** no claim without a command or receipt behind it; no status inflation.
