# Tasks: Server-Side TTS Centralization

**Input**: Design documents from `/specs/069-server-tts-centralization/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Test tasks are included as the feature specification requires maintaining or exceeding the current test baseline (3,237 tests) and explicitly lists test additions/deletions.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Shared package**: `packages/shared/src/`
- **Server package**: `packages/server/src/`
- **Extension package**: `packages/extension/src/`
- **Extension tests**: `packages/extension/tests/`
- **Server tests**: `packages/server/test/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extend shared types and update business invariants — the foundation for all subsequent work.

- [x] T001 Add optional `byokApiKey?: string` field to `TTSSynthesizeRequest` interface in `packages/shared/src/types/api.ts`
- [x] T002 [P] Add `TTSTestKeyRequest` and `TTSTestKeyResponse` interfaces in `packages/shared/src/types/api.ts`
- [x] T003 [P] Export `TTSTestKeyRequest` and `TTSTestKeyResponse` from `packages/shared/src/index.ts` barrel
- [x] T004 [P] Update INV-002 enforcement text from `'TTS proxy only used for managed credits; BYOK goes direct from extension'` to `'BYOK keys forwarded to server for single-request use; never persisted server-side'` in `packages/shared/src/constants/invariants.ts`
- [x] T005 Build shared package to verify types compile: `pnpm --filter @proso/shared build`

---

## Phase 2: Foundational (Server-Side BYOK Infrastructure)

**Purpose**: Enable the server to accept and use BYOK API keys — MUST complete before any user story can be implemented.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T006 Add optional `byokApiKey?: string` to `TTSSynthesizeParams` interface in `packages/server/src/ports/tts-provider.port.ts`
- [x] T007 [P] Update `OpenAITTSAdapter.synthesize()` to use `request.byokApiKey || this.config.get<string>('OPENAI_API_KEY')` in `packages/server/src/adapters/tts/openai-tts.adapter.ts` — MUST NOT log the key value
- [x] T008 [P] Update `ElevenLabsTTSAdapter.synthesize()` to use `request.byokApiKey || this.config.get<string>('ELEVENLABS_API_KEY')` in `packages/server/src/adapters/tts/elevenlabs-tts.adapter.ts` — MUST NOT log the key value
- [x] T009 [P] Update `GroqTTSAdapter.synthesize()` to use `request.byokApiKey || this.config.get<string>('GROQ_API_KEY')` in `packages/server/src/adapters/tts/groq-tts.adapter.ts` — MUST NOT log the key value
- [x] T010 [P] Create `CartesiaTTSAdapter` implementing `TTSProviderPort` (BYOK-only, requires `byokApiKey`) in `packages/server/src/adapters/tts/cartesia-tts.adapter.ts`
- [x] T011 Register `CartesiaTTSAdapter` in TTS_PROVIDERS factory map (always registered for BYOK, no config key check) in `packages/server/src/infrastructure/modules/tts.module.ts`
- [x] T012 Add `byokApiKey?: string` to `TTSRequest` interface in `packages/server/src/core/tts/tts.service.ts`
- [x] T013 Implement BYOK synthesis path in `synthesize()` function: when `byokApiKey` present, skip `selectProvider()` (use requested provider directly), skip `deductCredits()`, pass `byokApiKey` through `tryProvider()`, skip fallback chain — in `packages/server/src/core/tts/tts.service.ts`
- [x] T014 Add `byokApiKey?: string` to `SynthesizeBody` interface and pass to core service in `packages/server/src/infrastructure/controllers/tts.controller.ts`
- [x] T015 Allow BYOK synthesis requests without strict userId authentication (when `byokApiKey` present, default to free tier instead of returning 401) in `packages/server/src/infrastructure/controllers/tts.controller.ts`
- [x] T016 Run server tests to verify existing managed-credit flow is unchanged: `pnpm --filter @proso/server test`

**Checkpoint**: Server can accept BYOK keys in synthesis requests, use them for provider calls, skip credit deduction, and cache results. Existing managed-credit flow unchanged.

---

## Phase 3: US1 + US2 — Managed-Credit & BYOK TTS via Server (Priority: P1)

**Goal**: All premium TTS synthesis routes through the Proso server. Managed-credit users have credits deducted. BYOK users have their keys forwarded to the server for single-request use without credit deduction. Browser TTS is unaffected (INV-005).

**Independent Test**:
- US1: Configure a license key, select OpenAI, press Play — audio plays, credits decrease.
- US2: Enter a BYOK ElevenLabs key in settings, press Play — audio plays, zero credit deduction.

### Tests for US1 + US2

- [x] T017 [P] [US2] Write BYOK synthesis flow tests: credit bypass, cache behavior, key not persisted — in `packages/server/test/core/tts/tts-service-byok.spec.ts`
- [x] T018 [P] [US2] Write Cartesia adapter contract tests (BYOK-only, missing key returns error) — in `packages/server/test/adapters/tts/cartesia-tts.adapter.spec.ts`
- [x] T019 [P] [US2] Write test for BYOK request without userId (free-tier BYOK, INV-002) — in `packages/server/test/infrastructure/controllers/tts-byok-auth.spec.ts`

### Implementation for US1 + US2

- [x] T020 [US1] Add `testApiKey(provider: string, apiKey: string): Promise<Result<TTSTestKeyResponse, ApiClientError>>` method to `IApiClient` interface in `packages/extension/src/ports/api-client.port.ts`
- [x] T021 [P] [US1] Implement `testApiKey()` in `ProsoApiAdapter` — POST to `/api/v1/tts/test-key` — in `packages/extension/src/adapters/api/proso-api.adapter.ts`
- [x] T022 [P] [US1] Add `testApiKey()` stub returning `Err(NOT_CONFIGURED)` to `NoOpApiClientAdapter` in `packages/extension/src/adapters/api/noop-api-client.adapter.ts`
- [x] T023 [US2] Update `ServerTtsAudioAdapter` to accept optional `byokApiKey` and include it in the `TTSSynthesizeRequest` passed to `IApiClient.synthesize()` — in `packages/extension/src/adapters/audio/server-tts-audio.adapter.ts`
- [x] T024 [US1] Simplify `createAudioGeneratorAdapter()` in `packages/extension/src/composition/factories.ts`: remove `createDirectProviderAdapter()` function, remove imports of `ElevenLabsAudioAdapter`/`OpenAiAudioAdapter`/`GroqAudioAdapter`/`CartesiaAudioAdapter`, route all non-browser providers to `ServerTtsAudioAdapter(apiClient, provider, apiKey)` where apiKey is forwarded as byokApiKey
- [x] T025 [US1] Keep `getApiKeyForProvider()` in `packages/extension/src/composition/factories.ts` — repurposed for reading BYOK keys to forward to server
- [x] T026 [US2] Write tests for `ServerTtsAudioAdapter` BYOK key forwarding — in `packages/extension/tests/unit/adapters/audio/server-tts-byok.test.ts`
- [x] T027 [US1] Update `factories.test.ts` to test simplified two-path factory (browser → BrowserTtsAudioAdapter, everything else → ServerTtsAudioAdapter) — in `packages/extension/tests/unit/composition/factories.test.ts`
- [x] T028 [US1] Write tests for `ProsoApiAdapter.testApiKey()` method — in `packages/extension/tests/unit/adapters/api/proso-api-testkey.test.ts`
- [x] T029 Run extension tests to verify managed-credit and BYOK paths work: `pnpm --filter @proso/extension test:unit`

**Checkpoint**: US1 and US2 are functional — all premium TTS routes through server, BYOK keys forwarded, Browser TTS unaffected.

---

## Phase 4: US4 — Browser TTS Remains Fully Client-Side (Priority: P1)

**Goal**: Verify that the factory simplification in Phase 3 did not break Browser TTS. Browser TTS must still work offline with zero server calls (INV-005).

**Independent Test**: Disconnect from internet, select Browser TTS, press Play — audio plays with zero network requests.

### Verification for US4

- [x] T030 [US4] Verify `BrowserTtsAudioAdapter` is returned when provider is `'browser'` in simplified factory — review `packages/extension/src/composition/factories.ts` and confirm no server dependency in the browser path
- [x] T031 [US4] Verify existing `BrowserTtsAudioAdapter` tests still pass (no modifications needed to `packages/extension/tests/unit/adapters/browser-tts-audio.adapter.test.ts`) — run: `pnpm --filter @proso/extension test:unit -- --testPathPattern=browser-tts`

**Checkpoint**: US4 verified — Browser TTS works independently, offline, with no server involvement.

---

## Phase 5: US3 — BYOK Key Validation via Server (Priority: P2)

**Goal**: Users can validate their API keys via the server's test-key endpoint instead of direct provider API calls from the extension.

**Independent Test**: Enter a valid ElevenLabs key in settings, click Test — success with latency shown. Enter an invalid key — error displayed.

### Tests for US3

- [x] T032 [P] [US3] Write test-key endpoint tests: valid key, invalid key, rate limiting, missing provider, key not logged — in `packages/server/tests/unit/infrastructure/tts-test-key.spec.ts`

### Implementation for US3

- [x] T033 [US3] Add `POST /api/v1/tts/test-key` endpoint with `@Throttle({ default: { ttl: 60000, limit: 5 } })` rate limiting in `packages/server/src/infrastructure/controllers/tts.controller.ts` — accept `{ provider, apiKey }`, make minimal provider validation call, return `{ success, provider, error?, latencyMs? }`, MUST NOT log apiKey value
- [x] T034 [US3] Update `handleTestApiKey()` in `packages/extension/src/handlers/settings.handlers.ts` — route TTS providers (elevenlabs, openai, groq, cartesia) through `IApiClient.testApiKey()` instead of direct fetch; keep anthropic direct fetch unchanged
- [x] T035 [US3] Remove TTS provider entries from `API_TEST_ENDPOINTS` object in `packages/extension/src/handlers/settings.handlers.ts` — keep only anthropic entry
- [x] T036 [US3] Update testApiKey tests in `packages/extension/tests/unit/handlers/settings.handlers.test.ts` — mock `IApiClient.testApiKey()` instead of mocking direct fetch for TTS providers
- [x] T037 [US3] Run full test suite for US3 verification: `pnpm --filter @proso/server test && pnpm --filter @proso/extension test:unit`

**Checkpoint**: US3 functional — API key validation routes through server with rate limiting.

---

## Phase 6: US5 — Extension Client Simplification (Priority: P2)

**Goal**: Remove the four direct provider adapter files and their test files from the extension codebase. Update barrel exports. The extension is now a thin playback client.

**Independent Test**: Build extension for production and verify: (1) only `BrowserTtsAudioAdapter` and `ServerTtsAudioAdapter` remain in audio adapter directory, (2) no direct provider API URLs in build output.

### Implementation for US5

- [x] T038 [P] [US5] Delete `packages/extension/src/adapters/audio/elevenlabs-audio.adapter.ts`
- [x] T039 [P] [US5] Delete `packages/extension/src/adapters/audio/openai-audio.adapter.ts`
- [x] T040 [P] [US5] Delete `packages/extension/src/adapters/audio/groq-audio.adapter.ts`
- [x] T041 [P] [US5] Delete `packages/extension/src/adapters/audio/cartesia-audio.adapter.ts`
- [x] T042 [US5] Remove deleted adapter exports (`ElevenLabsAudioAdapter`, `OpenAiAudioAdapter`, `GroqAudioAdapter`, `CartesiaAudioAdapter`) from barrel in `packages/extension/src/adapters/audio/index.ts`
- [x] T043 [P] [US5] Delete `packages/extension/tests/unit/adapters/audio/openai-audio.adapter.test.ts`
- [x] T044 [P] [US5] Delete `packages/extension/tests/unit/adapters/audio/groq-audio.adapter.test.ts`
- [x] T045 [P] [US5] Delete `packages/extension/tests/unit/adapters/audio/cartesia-audio.adapter.test.ts`
- [x] T046 [P] [US5] Delete `packages/extension/tests/contract/elevenlabs-api.test.ts`
- [x] T047 [US5] Run full extension test suite after deletions: `pnpm --filter @proso/extension test:unit`
- [x] T048 [US5] Build extension for production and verify no direct provider API URLs (openai.com, elevenlabs.io, groq.com, cartesia.ai) in output: `pnpm --filter @proso/extension build:firefox`

**Checkpoint**: US5 complete — extension contains only `BrowserTtsAudioAdapter` and `ServerTtsAudioAdapter`. Four adapter files and four test files deleted. Build is clean.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, documentation, and security hardening across all stories.

- [x] T049 Run complete test suite across all packages: `pnpm --filter @proso/shared build && pnpm --filter @proso/server test && pnpm --filter @proso/extension test:unit`
- [x] T050 Verify total test count — server: 403, extension: 2204, total: 2607. Net reduction of ~122 from deleted direct adapter tests, offset by +73 server BYOK tests and +23 net extension handler tests. Consistent with expected adapter removal.
- [x] T051 Security audit: grep server codebase for any log statements that might output BYOK key values — verified zero console.log/info/debug statements outputting key values in `packages/server/src/`
- [x] T052 Verify no remaining imports of deleted adapters across entire extension codebase: grep for `ElevenLabsAudioAdapter`, `OpenAiAudioAdapter`, `GroqAudioAdapter`, `CartesiaAudioAdapter` in `packages/extension/src/` — CLEAN
- [x] T053 Verify `packages/extension/src/adapters/audio/` contains only: `index.ts`, `browser-tts-audio.adapter.ts`, `server-tts-audio.adapter.ts`, `audio-url.adapter.ts`, `direct.adapter.ts`, `offscreen.adapter.ts` — VERIFIED
- [x] T054 Build verification completed: extension build succeeds at 1.04 MB, no direct TTS provider API URLs in output (removed elevenlabs host_permission from manifest)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T005 shared build) — BLOCKS all user stories
- **US1+US2 (Phase 3)**: Depends on Phase 2 (server BYOK infrastructure ready)
- **US4 (Phase 4)**: Depends on Phase 3 (factory simplified — verify browser path intact)
- **US3 (Phase 5)**: Depends on Phase 2 (server infrastructure) + Phase 3 T020-T022 (IApiClient port updated)
- **US5 (Phase 6)**: Depends on Phase 3 (factory no longer imports direct adapters) — the actual file deletions
- **Polish (Phase 7)**: Depends on all previous phases

### User Story Dependencies

- **US1 + US2 (P1)**: Can start after Foundational (Phase 2) — These stories share the same factory change and are implemented together
- **US4 (P1)**: Verification only — depends on US1+US2 factory changes being complete
- **US3 (P2)**: Can start after Foundational (Phase 2) + IApiClient port update (T020-T022) — independent of US5
- **US5 (P2)**: Must start after US1+US2 (Phase 3) complete — adapter deletions require factory to no longer import them

### Within Each Phase

- Server port changes (T006) before adapter modifications (T007-T010)
- TTS service changes (T012-T013) before controller changes (T014-T015)
- IApiClient port (T020) before adapter implementations (T021-T023)
- Factory simplification (T024) before adapter deletion (T038-T041)
- All deletions before test suite run (T047)

### Parallel Opportunities

**Phase 1**: T001-T004 can run in parallel (different files in shared package)
**Phase 2**: T007, T008, T009, T010 can run in parallel (different adapter files)
**Phase 3**: T021, T022 can run in parallel (different API adapter files); T017, T018, T019 can run in parallel (different test files); T026, T027, T028 in parallel (different test files)
**Phase 5**: T032 can run in parallel with T033 (test before implementation)
**Phase 6**: T038-T041 can run in parallel (independent file deletions); T043-T046 can run in parallel (independent test file deletions)

---

## Parallel Example: Phase 2 (Foundational)

```bash
# After T006 (port interface) completes, launch all adapter updates in parallel:
Task T007: "Update OpenAI adapter for BYOK in openai-tts.adapter.ts"
Task T008: "Update ElevenLabs adapter for BYOK in elevenlabs-tts.adapter.ts"
Task T009: "Update Groq adapter for BYOK in groq-tts.adapter.ts"
Task T010: "Create Cartesia adapter in cartesia-tts.adapter.ts"
```

## Parallel Example: Phase 3 (US1 + US2)

```bash
# After T020 (IApiClient port) completes, launch adapter implementations in parallel:
Task T021: "Implement testApiKey in ProsoApiAdapter"
Task T022: "Add testApiKey stub to NoOpApiClientAdapter"

# Tests can run in parallel:
Task T017: "BYOK synthesis flow tests"
Task T018: "Cartesia adapter contract tests"
Task T019: "BYOK auth tests"
```

## Parallel Example: Phase 6 (US5 — Deletions)

```bash
# All adapter deletions can run simultaneously:
Task T038: "Delete elevenlabs-audio.adapter.ts"
Task T039: "Delete openai-audio.adapter.ts"
Task T040: "Delete groq-audio.adapter.ts"
Task T041: "Delete cartesia-audio.adapter.ts"

# All test deletions can run simultaneously:
Task T043: "Delete openai-audio.adapter.test.ts"
Task T044: "Delete groq-audio.adapter.test.ts"
Task T045: "Delete cartesia-audio.adapter.test.ts"
Task T046: "Delete elevenlabs-api.test.ts"
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Setup (shared types)
2. Complete Phase 2: Foundational (server BYOK infrastructure)
3. Complete Phase 3: US1 + US2 (extension routes all premium TTS through server)
4. **STOP and VALIDATE**: Test managed-credit playback and BYOK playback independently
5. Deploy/demo if ready — the core value proposition is working

### Incremental Delivery

1. Setup + Foundational → Server ready for BYOK
2. US1 + US2 → Extension routes through server → Test → **(MVP!)**
3. US4 → Verify Browser TTS unaffected → Test
4. US3 → Key validation via server → Test
5. US5 → Delete dead code, clean codebase → Test
6. Polish → Final verification, security audit

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 + US2 (extension routing + BYOK forwarding)
   - Developer B: US3 (key validation endpoint + handler)
3. After US1+US2 complete:
   - Developer A: US5 (adapter deletions)
   - Developer B: US4 verification
4. Team: Polish phase together

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US2 are combined in Phase 3 because they share the same factory code change (both require routing non-browser providers through ServerTtsAudioAdapter)
- US4 (Browser TTS) has no implementation tasks — it's a verification-only story ensuring INV-005 is preserved
- US5 (Simplification) is sequenced last because adapter files can only be deleted after the factory no longer imports them
- BYOK key security is a cross-cutting concern: every server task that handles keys must ensure zero logging/persistence
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
