# Tasks: Production Readiness Sprint

**Input**: Design documents from `/specs/056-production-readiness-sprint/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md, contracts/

**Tests**: Test tasks ARE included per FR-009 through FR-012 in spec.md.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root (browser extension with hexagonal architecture)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Build configuration changes, environment setup, and gitignore updates required before any feature work.

- [X] T001 Add Vite `define` constants for `__TELEMETRY_GATEWAY_URL__` and `__TELEMETRY_GATEWAY_TOKEN__` in `wxt.config.ts` (see research.md RQ-1)
- [X] T002 [P] Create `.env.example` with `TELEMETRY_GATEWAY_URL` and `TELEMETRY_GATEWAY_TOKEN` placeholder variables
- [X] T003 [P] Add `.env` to `.gitignore` if not already present
- [X] T004 [P] Verify `esbuild.drop: ['console', 'debugger']` is configured for production in `wxt.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Type system changes, settings migration, and telemetry token removal that MUST complete before any user story work.

**CRITICAL**: No user story work can begin until this phase is complete.

### Type System — Provider Consolidation

- [X] T005 Add `'browser'` to `ProviderId` type union in `src/core/shared/errors.ts` (current: `type ProviderId = 'elevenlabs'` → target: `'elevenlabs' | 'browser'`)
- [X] T006 [P] Add `'browser'` to `PROVIDERS` tuple in `src/utils/config/schema.ts` (current: `['elevenlabs'] as const` → target: `['elevenlabs', 'browser'] as const`)
- [X] T007 [P] Add `'browser'` to `providerIdSchema` in `src/utils/messaging/schemas.ts` (current: `z.enum(['elevenlabs'])` → target: `z.enum(['elevenlabs', 'browser'])`)
- [X] T007b [P] Update duplicate `ProviderId` definitions in `src/utils/messaging/protocol.ts` and `src/utils/language/mappings.ts`

### Settings Migration

- [X] T008 Create settings migration v6 (`provider-consolidation`) in `src/utils/config/migrations.ts` — clean up orphaned API keys for removed providers (OpenAI, Groq, Cartesia, Anthropic), reset provider to `'browser'` if current provider was removed, update `CURRENT_CONFIG_VERSION` to 6 (see data-model.md)

### Telemetry Token Removal from Source

- [X] T009 Remove hardcoded telemetry gateway token fallback from `src/entrypoints/background.ts` (~line 2072) — adopt `content.ts` pattern: read from `browser.storage.local`, skip telemetry if missing
- [X] T010 [P] Remove hardcoded telemetry gateway token fallback from `src/entrypoints/popup/main.ts` (~line 1350) — read from `browser.storage.local`, skip if missing
- [X] T011 [P] Remove hardcoded telemetry gateway token fallback from `src/entrypoints/options/controller.ts` (~line 1694) — read from `browser.storage.local`, skip if missing
- [X] T012 Add telemetry config seeding in `src/entrypoints/background.ts` `runtime.onInstalled` handler — write `__TELEMETRY_GATEWAY_URL__` and `__TELEMETRY_GATEWAY_TOKEN__` to `browser.storage.local` if not already set

**Checkpoint**: Foundation ready — type system supports both providers, migration handles upgrades, no hardcoded tokens in source. User story implementation can now begin in parallel.

---

## Phase 3: User Story 1 — Clean and Honest User Interface (Priority: P1) MVP

**Goal**: Users see only functional providers (ElevenLabs, Browser TTS). Every visible button, input, and interactive element works. No phantom UI.

**Independent Test**: Install extension, open settings, confirm every visible element is functional. No dead buttons, no phantom providers, no broken interactions.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T013 [P] [US1] Write unit tests for `BrowserTtsAudioAdapter` in `tests/unit/adapters/browser-tts-audio.adapter.test.ts` — test providerId, supportsWordTiming, validateCredentials, getVoices, generateAudio (see contracts/provider-consolidation.yaml)
- [X] T014 [P] [US1] Write factory tests for `createAudioGeneratorAdapter` with `'browser'` provider in `tests/unit/composition/factories.test.ts` (see contracts/provider-consolidation.yaml)
- [X] T015 [P] [US1] Write migration v6 tests in `tests/unit/config/migrations.test.ts` — orphaned key cleanup, provider reset, idempotency, data preservation (see contracts/provider-consolidation.yaml)
- [X] T016 [P] [US1] Write contract test for `BrowserTtsAudioAdapter` implementing `IAudioGenerator` port in `tests/contract/browser-tts-audio-generator.contract.test.ts` (see contracts/provider-consolidation.yaml)

### Implementation for User Story 1

- [X] T017 [US1] Create `BrowserTtsAudioAdapter` in `src/adapters/audio/browser-tts-audio.adapter.ts` implementing `IAudioGenerator` — providerId `'browser'`, supportsWordTiming `false`, validateCredentials always `true`, getVoices maps `speechSynthesis.getVoices()`, generateAudio uses `speechSynthesis` directly (see research.md RQ-2)
- [X] T018 [US1] Update factory `createAudioGeneratorAdapter` in `src/composition/factories.ts` — add `case 'browser'` returning `BrowserTtsAudioAdapter` instance
- [X] T019 [US1] Add `'browser'` provider metadata to `PROVIDER_METADATA` in `src/handlers/provider.handlers.ts` — `{ id: 'browser', name: 'Browser TTS', requiresApiKey: false, type: 'free' }`
- [X] T020 [US1] Remove phantom provider cards (OpenAI, Groq, Cartesia) from `src/entrypoints/settings.html` — delete HTML sections for non-functional providers
- [X] T021 [US1] Add Browser TTS provider card to `src/entrypoints/settings.html` — voice selector only (no API key input), test button that calls `speechSynthesis.speak()`
- [X] T022 [US1] Update `PROVIDER_INPUT_IDS` in `src/entrypoints/options/controller.ts` — remove OpenAI/Groq/Cartesia entries, add `'browser'` mapping, ensure all test buttons have functional handlers
- [X] T023 [US1] Update popup provider dropdown in `src/entrypoints/popup/main.ts` — only list `'elevenlabs'` and `'browser'`, remove phantom options
- [X] T024 [US1] Add fallback logic: auto-select Browser TTS when no ElevenLabs API key is configured — update provider selection in `src/entrypoints/background.ts` or `src/composition/factories.ts`
- [X] T025 [US1] Remove dead UI sections (hidden defaults, legacy queue elements, no-op functions) from settings and popup HTML/JS per FR-004

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently. Settings and popup show only ElevenLabs and Browser TTS. Every button works.

---

## Phase 4: User Story 2 — Reliable Extension with Verified Quality (Priority: P1)

**Goal**: All hexagonal handlers have unit tests, telemetry has privacy tests, CI enforces coverage thresholds. Test suite catches regressions.

**Independent Test**: Run `pnpm run test:unit -- --coverage` and confirm all tests pass, coverage meets thresholds (70/60/70/70).

### Tests for User Story 2 — Handler Unit Tests (FR-009)

> **NOTE: Each handler file needs a test file with at least 2 tests per handler (happy path + error case)**

- [X] T026 [P] [US2] Write handler tests for `src/handlers/playback.handlers.ts` in `tests/unit/handlers/playback.handlers.test.ts` — 10 handlers, 20+ tests (see contracts/handler-tests.yaml)
- [X] T027 [P] [US2] Write handler tests for `src/handlers/audio.handlers.ts` in `tests/unit/handlers/audio.handlers.test.ts` — 4 handlers, 8+ tests
- [X] T028 [P] [US2] Write handler tests for `src/handlers/settings.handlers.ts` in `tests/unit/handlers/settings.handlers.test.ts` — 5 handlers, 10+ tests
- [X] T029 [P] [US2] Write handler tests for `src/handlers/provider.handlers.ts` in `tests/unit/handlers/provider.handlers.test.ts` — 3 handlers, 6+ tests
- [X] T030 [P] [US2] Write handler tests for `src/handlers/cache.handlers.ts` in `tests/unit/handlers/cache.handlers.test.ts` — 7 handlers, 14+ tests
- [X] T031 [P] [US2] Write handler tests for `src/handlers/content.handlers.ts` in `tests/unit/handlers/content.handlers.test.ts` — 4 handlers, 8+ tests
- [X] T032 [P] [US2] Write handler tests for `src/handlers/debug.handlers.ts` in `tests/unit/handlers/debug.handlers.test.ts` — 5 handlers, 5+ tests (min 1 per handler)
- [X] T033 [P] [US2] Write handler tests for `src/handlers/prefetch.handlers.ts` in `tests/unit/handlers/prefetch.handlers.test.ts` — 4 handlers, 8+ tests
- [X] T034 [P] [US2] Write handler tests for `src/handlers/queue.handlers.ts` in `tests/unit/handlers/queue.handlers.test.ts` — 11 handlers, 22+ tests
- [X] T035 [P] [US2] Write handler tests for `src/handlers/footer.handlers.ts` in `tests/unit/handlers/footer.handlers.test.ts` — 6 handlers, 12+ tests
- [X] T036 [P] [US2] Write handler tests for `src/handlers/reader.handlers.ts` in `tests/unit/handlers/reader.handlers.test.ts` — 6 handlers, 12+ tests
- [X] T037 [P] [US2] Write handler tests for `src/handlers/highlight.handlers.ts` in `tests/unit/handlers/highlight.handlers.test.ts` — 6 handlers, 12+ tests

### Tests for User Story 2 — Telemetry Privacy Tests (FR-010)

- [X] T038 [P] [US2] Write telemetry shipper tests in `tests/unit/telemetry/usage-shipper.test.ts` — Bearer token auth, network failure handling, opt-out, PII redaction, circuit breaker (see contracts/telemetry-tests.yaml)
- [X] T039 [P] [US2] Write telemetry tracker tests in `tests/unit/telemetry/usage-tracker.test.ts` — init from storage, event schema, missing config handling, opt-out (see contracts/telemetry-tests.yaml)
- [X] T040 [P] [US2] Write telemetry buffer tests in `tests/unit/telemetry/usage-buffer.test.ts` — capacity, FIFO eviction, flush behavior (see contracts/telemetry-tests.yaml)
- [X] T041 [P] [US2] Write telemetry event tests in `tests/unit/telemetry/usage-events.test.ts` — event factory, PII redaction (see contracts/telemetry-tests.yaml)
- [X] T042 [P] [US2] Write telemetry privacy tests in `tests/unit/telemetry/usage-privacy.test.ts` — email redaction, URL query stripping, API key masking, passthrough of non-sensitive data (see contracts/telemetry-tests.yaml)

### CI Coverage Enforcement (FR-011)

- [X] T043 [US2] Add `--coverage` flag to `pnpm run test:unit` command in `.github/workflows/ci.yml` (see research.md RQ-4)
- [X] T044 [P] [US2] Add `--coverage` flag to `pnpm run test:unit` command in `.github/workflows/test.yml` (see research.md RQ-4)
- [X] T045 [P] [US2] Change `fail_ci_if_error` to `true` for Codecov upload step in `.github/workflows/test.yml`

### Missing Port Contract Tests (FR-012)

- [X] T046 [P] [US2] Identify the 3 ports in `src/ports/` without contract tests and write contract tests in `tests/contract/` — each must verify adapter implements all port methods with correct signatures

**Checkpoint**: All 15 handler files have test files (137+ tests total). Telemetry has privacy tests. CI enforces coverage. `pnpm run test:unit -- --coverage` passes with thresholds met.

---

## Phase 5: User Story 3 — Secure Production Build (Priority: P1)

**Goal**: Production builds contain zero hardcoded credentials, zero console statements, zero source maps. Manifest has correct permissions and a real gecko ID.

**Independent Test**: Build production extension and scan artifacts for secrets, debug code, source maps. Run `pnpm run test:security`.

### Tests for User Story 3

> **NOTE: Write security scan tests FIRST, ensure they FAIL before fixes**

- [X] T047 [P] [US3] Write credential scan test in `tests/security/credentials.test.ts` — scan `src/**/*.ts` for hardcoded token `5Q0LlZ`, gateway URL as inline fallback, API key patterns (see contracts/security-validation.yaml)
- [X] T048 [P] [US3] Update build artifact tests in `tests/security/build-artifacts.test.ts` — verify zero console.log/debug/info/warn, zero debugger, zero source maps, package under 5MB in production output (see contracts/security-validation.yaml)
- [X] T049 [P] [US3] Write manifest permissions test in `tests/security/manifest-permissions.test.ts` — no `<all_urls>`, gecko ID is not placeholder, only required permissions declared (see contracts/security-validation.yaml)

### Implementation for User Story 3

- [X] T050 [US3] Replace placeholder gecko extension ID in `wxt.config.ts` with a real, unique ID (not `voxpage@example.com`) per FR-008
- [X] T051 [US3] Verify `.env` files are gitignored and `.env.example` documents all required variables (cross-check with T002, T003)
- [X] T052 [US3] Delete stale root `manifest.json` if it exists (only `.output/` manifest should exist, generated by WXT) per FR-024
- [X] T053 [P] [US3] Delete stale `package-lock.json` if it exists (only `pnpm-lock.yaml` should exist) per FR-025
- [X] T054 [US3] Run production build (`NODE_ENV=production pnpm run build:firefox`) and verify all security tests pass — zero tokens, zero console, zero source maps in `.output/`

**Checkpoint**: Production build is clean and secure. `pnpm run test:security` passes. No credentials in source or output.

---

## Phase 6: User Story 4 — Structured Debug and Diagnostic Capability (Priority: P2)

**Goal**: Developers can enable debug mode with structured logging (component-tagged prefixes, configurable levels) and a debug API. Production builds strip all debug code.

**Independent Test**: Enable debug mode in dev build, trigger playback, inspect structured logs. Build production, verify debug code is stripped.

### Tests for User Story 4

- [X] T055 [P] [US4] Write `createLogger` factory tests in `tests/unit/logging/logger.test.ts` — debug/info/warn/error methods, component tagging, LogBuffer integration, level filtering, message truncation, safe metadata serialization (see contracts/debug-infrastructure.yaml)
- [X] T056 [P] [US4] Write debug API tests in `tests/unit/debug/debug-api.test.ts` — exposes all documented state, does NOT expose API keys, returns serializable data (see contracts/debug-infrastructure.yaml)
- [X] T057 [P] [US4] Write E2E console capture helper tests in `tests/unit/e2e-helpers/console-capture.test.ts` — captures extension log output, included in failure reports, filters by extension origin (see contracts/debug-infrastructure.yaml)

### Implementation for User Story 4

- [X] T058 [US4] Create `createLogger(component)` factory in `src/utils/logging/logger.ts` — returns typed log methods (`debug()`, `info()`, `warn()`, `error()`) pre-bound to component tag, adds entries to global `LogBuffer`, respects configured log level (see data-model.md, contracts/debug-infrastructure.yaml)
- [X] T059 [US4] Create debug API in `src/utils/debug/debug-api.ts` — exposes extractedText, playbackState, cacheStats, logBuffer, handlerRegistry, providerConfig (NOT API keys). Wrap in `if (process.env.NODE_ENV !== 'production')` for tree-shaking (see contracts/debug-infrastructure.yaml)
- [X] T060 [US4] Create E2E console capture helper in `tests/e2e/helpers/console-capture.ts` — Playwright helper using `page.on('console')` to capture extension logs, attach to test failure reports, filter by `moz-extension://` origin (see contracts/debug-infrastructure.yaml)
- [X] T061 [US4] Verify production stripping: run `NODE_ENV=production pnpm run build:firefox` and confirm zero `createLogger`, `debugApi`, `console.*` in `.output/` (cross-validated by T048 security tests)

**Checkpoint**: Debug infrastructure is operational in dev builds. Production builds are clean. E2E failures include console output for diagnosis.

---

## Phase 7: User Story 5 — Complete Hexagonal Architecture Migration (Priority: P2)

**Goal**: All message types route through hexagonal handlers. Background script is under 500 LOC. No legacy handler stubs remain.

**Independent Test**: Check `MIGRATION_FLAGS` are all `false`, `wc -l background.ts` < 500, all message types dispatch through hexagonal handlers.

### Tests for User Story 5 — New Handler Tests

- [ ] T062 [P] [US5] Write handler tests for `export.*` in `tests/unit/handlers/export.handlers.test.ts` — 4 handlers (start, cancel, getProgress, download) (see contracts/handler-tests.yaml)
- [ ] T063 [P] [US5] Write handler tests for `summarize.*` in `tests/unit/handlers/summarize.handlers.test.ts` — 3 handlers (article, readSummary, getProviderStatus)
- [ ] T064 [P] [US5] Write handler tests for `language.*` in `tests/unit/handlers/language.handlers.test.ts` — 4 handlers (detect, getState, setOverride, clearOverride)
- [ ] T065 [P] [US5] Write handler tests for `logging.*` in `tests/unit/handlers/logging.handlers.test.ts` — 3 handlers (logRemote, flushBuffer, getState)

### Implementation for User Story 5 — Wave 1: Low Risk (Move Existing)

- [ ] T066 [US5] Create `src/handlers/export.handlers.ts` — wrap existing `export.*` logic from `src/utils/messaging/handlers/export.ts` into hexagonal handlers, register in `src/handlers/index.ts`
- [ ] T067 [US5] Create `src/handlers/summarize.handlers.ts` — wrap existing `summarize.*` logic from `src/utils/messaging/handlers/summarize.ts` into hexagonal handlers, register in `src/handlers/index.ts`
- [ ] T068 [US5] Add `settings.getTheme`, `settings.setTheme`, `settings.resetSection` handlers to `src/handlers/settings.handlers.ts` — move logic from `src/utils/messaging/handlers/settings.ts`

### Implementation for User Story 5 — Wave 2: Medium Risk (Implement from Scratch)

- [ ] T069 [US5] Create `src/handlers/language.handlers.ts` — implement `language.detect` (using `franc-min`), `language.getState`, `language.setOverride`, `language.clearOverride`, register in `src/handlers/index.ts`
- [ ] T070 [US5] Create `src/handlers/logging.handlers.ts` — implement `logging.logRemote`, `logging.flushBuffer`, `logging.getState` (integrate with `LogBuffer` and `UsageShipper`), register in `src/handlers/index.ts`

### Implementation for User Story 5 — Wave 3: High Risk (Playback Migration)

- [ ] T071 [US5] Migrate playback orchestration from `src/entrypoints/background.ts` to `src/handlers/playback.handlers.ts` — connect `PlaybackService` to `HTMLAudioElement`, migrate `speakCurrentParagraph`, blob URL management, word timing, prefetch integration, content script footer updates (~1500 LOC to move)
- [ ] T072 [US5] Set `USE_LEGACY_PLAYBACK: false` in `src/entrypoints/background.ts` MIGRATION_FLAGS — enable hexagonal playback routing
- [ ] T073 [US5] Delete pure stub files in `src/utils/messaging/handlers/` — remove `playback.ts` (8 stubs), `audio.ts` (4), `provider.ts` (3), `content.ts` (3), `highlight.ts` (4), `language.ts` (4), `footer.ts` (5), `logging.ts` (3) = ~34 stubs (see research.md RQ-3)
- [ ] T074 [US5] Refactor `src/entrypoints/background.ts` to composition root only — remove inline business logic, reduce to <500 LOC of wiring (adapters → ports → container initialization → handler registration → message routing)
- [ ] T075 [US5] Verify all MIGRATION_FLAGS in `src/entrypoints/background.ts` are `false` and all message types route through hexagonal handlers

**Checkpoint**: Background script is <500 LOC. All 88+ handlers registered. No legacy stubs. `USE_LEGACY_*` flags all `false`.

---

## Phase 8: User Story 6 — Accessibility and Settings Polish (Priority: P3)

**Goal**: Keyboard navigation works across all UI surfaces. Screen reader announces status changes. Touch targets meet minimum size. Accessible modals replace `confirm()`.

**Independent Test**: Run axe-core tests. Perform manual keyboard-only navigation through settings and popup. Verify no `confirm()` calls.

### Tests for User Story 6

- [ ] T076 [P] [US6] Write axe-core accessibility tests for settings page in `tests/unit/accessibility/settings.test.ts` — zero critical or serious violations (FR-027, FR-028)
- [ ] T077 [P] [US6] Write axe-core accessibility tests for popup in `tests/unit/accessibility/popup.test.ts` — zero critical or serious violations
- [ ] T078 [P] [US6] Write keyboard navigation tests for popup tab switching in `tests/unit/accessibility/popup-keyboard.test.ts` — Arrow key navigation, ARIA state updates (FR-030)

### Implementation for User Story 6

- [ ] T079 [US6] Ensure all interactive elements have minimum 44x44px touch targets in `src/styles/` CSS files (FR-027) — audit buttons, inputs, checkboxes, radio buttons
- [ ] T080 [US6] Add ARIA live regions for status changes (toasts, test results) in `src/entrypoints/settings.html` and `src/entrypoints/popup/index.html` (FR-028)
- [ ] T081 [US6] Replace all `confirm()` calls with accessible confirmation modals in `src/entrypoints/options/controller.ts` and `src/entrypoints/popup/main.ts` (FR-029)
- [ ] T082 [US6] Implement keyboard navigation (Arrow keys for tab switching, Enter/Space for activation) in `src/entrypoints/popup/main.ts` (FR-030)
- [ ] T083 [US6] Ensure theme (light/dark/system) is applied consistently across all UI surfaces — settings, popup, content script footer

**Checkpoint**: axe-core reports zero critical/serious violations. Keyboard navigation works. No `confirm()` dialogs. Theme is consistent.

---

## Phase 9: User Story 7 — Codebase Hygiene and Obsolete Spec Cleanup (Priority: P3)

**Goal**: 10 obsolete specs archived. Dead files removed. TODO markers reduced to <10 with tracked issue references.

**Independent Test**: `ls specs/_archived/` shows 10 directories. No stale root files. `grep -rn TODO src/ | wc -l` < 10.

### Implementation for User Story 7

- [ ] T084 [US7] Create `specs/_archived/` directory and add `README.md` explaining the archive convention (see research.md RQ-5)
- [ ] T085 [US7] Archive 10 obsolete specs via `git mv` to `specs/_archived/` — 044-tauri-pdf-reader, 024-settings-page-redesign, 042-firefox-e2e-real-user-simulation, 021-comprehensive-overhaul, 037-testing-completion-hardening, 010-ssot-architecture, 032-biome-linting, 023-feature-roadmap, 022-plasmo-migration, 018-ui-redesign
- [ ] T086 [P] [US7] Remove dead code: unused functions, unreachable code paths, stale imports across `src/` (FR-032)
- [ ] T087 [P] [US7] Reduce TODO markers to <10 in `src/**/*.ts` — resolve or convert to tracked issues with `TODO(#issue)` format (FR-033)
- [ ] T088 [US7] Update `AGENTS.md` to remove/note obsolete spec references and reflect current project state
- [ ] T089 [P] [US7] Update `CLAUDE.md` (if exists) to remove obsolete spec references
- [ ] T090 [US7] Delete stale local branches `024-settings-page-redesign` and `044-tauri-pdf-reader` (see research.md RQ-5)
- [ ] T091 [US7] Verify offscreen document files (`src/entrypoints/offscreen/`) are retained but NOT wired into the composition container — add comment: "Chrome support scaffolding, not actively used in Firefox builds"

**Checkpoint**: `specs/_archived/` contains 10 dirs. Root has no stale manifest.json or package-lock.json. <10 TODOs remain, each with issue reference.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, constitution amendment, and cross-cutting cleanup that affects multiple user stories.

- [ ] T092 Amend constitution Principle I to "Firefox-first, Chrome-ready architecture" per research.md RQ-6 recommendation
- [ ] T093 [P] Add `build:chrome` smoke-test step to `.github/workflows/ci.yml` — build succeeds for Chrome (no runtime tests) per research.md RQ-6
- [ ] T094 [P] Update CI install steps to use locked/frozen dependency installation (`pnpm install --frozen-lockfile`) in `.github/workflows/ci.yml` and `.github/workflows/test.yml` (FR-026)
- [ ] T095 Run full quickstart.md validation — all 10 scenarios (UI integrity, security, coverage, handlers, hex migration, Browser TTS, debug, accessibility, hygiene, migration)
- [ ] T096 Run `pnpm run test:unit -- --coverage` and verify all thresholds pass (70% statements, 60% branches, 70% functions, 70% lines)
- [ ] T097 Run `NODE_ENV=production pnpm run build:firefox` and verify package size <5MB, zero credentials, zero debug code
- [ ] T098 Verify `background.ts` line count is <500 (SC-007)
- [ ] T099 [P] Remove 100+ scattered `console.log` statements from `src/` that are not part of structured logging (replace with `createLogger` calls where appropriate)
- [ ] T100 Final review: confirm all 12 success criteria from spec.md (SC-001 through SC-012) are met

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001 for Vite define) — BLOCKS all user stories
- **User Stories (Phase 3-9)**: All depend on Foundational phase completion
  - US1 (P1), US2 (P1), US3 (P1) can proceed in parallel after Phase 2
  - US4 (P2) can start after Phase 2 (no US1 dependency)
  - US5 (P2) can start after Phase 2 (no US1 dependency, but benefits from US2 handler tests)
  - US6 (P3) depends on US1 completion (UI must be finalized before accessibility audit)
  - US7 (P3) can start after Phase 2 (independent of other stories)
- **Polish (Phase 10)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories (tests existing handlers)
- **User Story 3 (P1)**: Can start after Foundational (Phase 2) — Shares telemetry token work with Phase 2 but security scans are independent
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) — Independent (new files)
- **User Story 5 (P2)**: Can start after Foundational (Phase 2) — Benefits from US2 handler tests for regression safety but not blocked by them
- **User Story 6 (P3)**: Should start after US1 completion — UI must be finalized before accessibility audit
- **User Story 7 (P3)**: Can start after Foundational (Phase 2) — Independent (file/spec operations)

### Within Each User Story

- Tests MUST be written and FAIL before implementation (where test tasks are listed)
- Type system changes before adapters
- Adapters before factories
- Factories before UI wiring
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

**Phase 1** (4 tasks): T002, T003, T004 can run in parallel
**Phase 2** (8 tasks): T006+T007 in parallel; T009+T010+T011 in parallel
**Phase 3 / US1** (13 tasks): T013+T014+T015+T016 all in parallel (tests); T020+T023 in parallel (UI removals)
**Phase 4 / US2** (21 tasks): ALL handler test tasks (T026-T037) in parallel; ALL telemetry test tasks (T038-T042) in parallel; T043+T044+T045 in parallel (CI)
**Phase 5 / US3** (8 tasks): T047+T048+T049 in parallel (security tests); T052+T053 in parallel
**Phase 6 / US4** (7 tasks): T055+T056+T057 in parallel (tests)
**Phase 7 / US5** (14 tasks): T062+T063+T064+T065 in parallel (new handler tests); T066+T067 in parallel (Wave 1 handlers)
**Phase 8 / US6** (8 tasks): T076+T077+T078 in parallel (accessibility tests)
**Phase 9 / US7** (8 tasks): T086+T087+T089 in parallel
**Phase 10** (9 tasks): T092+T093+T094 in parallel; T095+T096+T097 sequentially

**Cross-story parallelism**: After Phase 2, US1 + US2 + US3 + US4 + US7 can all start simultaneously (if staffed).

---

## Parallel Example: User Story 2 (Handler Tests)

```bash
# Launch ALL 12 handler test files in parallel (different files, no dependencies):
Task: "Write handler tests for playback.handlers.ts in tests/unit/handlers/playback.handlers.test.ts"
Task: "Write handler tests for audio.handlers.ts in tests/unit/handlers/audio.handlers.test.ts"
Task: "Write handler tests for settings.handlers.ts in tests/unit/handlers/settings.handlers.test.ts"
Task: "Write handler tests for provider.handlers.ts in tests/unit/handlers/provider.handlers.test.ts"
Task: "Write handler tests for cache.handlers.ts in tests/unit/handlers/cache.handlers.test.ts"
Task: "Write handler tests for content.handlers.ts in tests/unit/handlers/content.handlers.test.ts"
Task: "Write handler tests for debug.handlers.ts in tests/unit/handlers/debug.handlers.test.ts"
Task: "Write handler tests for prefetch.handlers.ts in tests/unit/handlers/prefetch.handlers.test.ts"
Task: "Write handler tests for queue.handlers.ts in tests/unit/handlers/queue.handlers.test.ts"
Task: "Write handler tests for footer.handlers.ts in tests/unit/handlers/footer.handlers.test.ts"
Task: "Write handler tests for reader.handlers.ts in tests/unit/handlers/reader.handlers.test.ts"
Task: "Write handler tests for highlight.handlers.ts in tests/unit/handlers/highlight.handlers.test.ts"

# Then launch ALL 5 telemetry test files in parallel:
Task: "Write telemetry shipper tests in tests/unit/telemetry/usage-shipper.test.ts"
Task: "Write telemetry tracker tests in tests/unit/telemetry/usage-tracker.test.ts"
Task: "Write telemetry buffer tests in tests/unit/telemetry/usage-buffer.test.ts"
Task: "Write telemetry event tests in tests/unit/telemetry/usage-events.test.ts"
Task: "Write telemetry privacy tests in tests/unit/telemetry/usage-privacy.test.ts"
```

---

## Parallel Example: User Story 1 (Provider Consolidation)

```bash
# Launch all US1 tests in parallel (before implementation):
Task: "Write BrowserTtsAudioAdapter unit tests"
Task: "Write factory tests for browser provider"
Task: "Write migration v6 tests"
Task: "Write BrowserTtsAudioAdapter contract test"

# Then implement adapter + factory in parallel with UI changes:
# (adapter/factory are different files from UI HTML/JS)
Task: "Create BrowserTtsAudioAdapter in src/adapters/audio/"
Task: "Remove phantom provider cards from settings.html"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (4 tasks)
2. Complete Phase 2: Foundational (8 tasks)
3. Complete Phase 3: User Story 1 — Clean UI (13 tasks)
4. **STOP and VALIDATE**: Install extension, open settings, confirm only ElevenLabs and Browser TTS appear with all buttons functional
5. Deploy/demo if ready — this is the minimum viable release

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → **MVP!** (clean UI)
3. Add User Story 2 → Test independently → Deploy (verified quality)
4. Add User Story 3 → Test independently → Deploy (secure build)
5. Add User Story 4 → Test independently → Deploy (debug infrastructure)
6. Add User Story 5 → Test independently → Deploy (complete hex migration)
7. Add User Story 6 → Test independently → Deploy (accessibility)
8. Add User Story 7 → Test independently → Deploy (codebase hygiene)
9. Complete Polish → Final validation → **Production release**

### Recommended Execution Order (Single Developer)

Phase 1 → Phase 2 → Phase 3 (US1 MVP) → Phase 5 (US3 security) → Phase 4 (US2 tests) → Phase 6 (US4 debug) → Phase 7 (US5 hex) → Phase 8 (US6 a11y) → Phase 9 (US7 hygiene) → Phase 10 (polish)

**Rationale**: US3 (security) before US2 (tests) because the token removal in Phase 2 must be verified, and security tests validate the foundation. US2 (tests) then locks in the quality gate before the risky hex migration in US5.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD where test tasks are listed)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Offscreen document files (`src/entrypoints/offscreen/`) are RETAINED as Chrome scaffolding — do not delete
- Pre-existing TypeScript LSP errors in controller.ts (16 errors), content.ts (1 error), offscreen files (chrome namespace) are NOT caused by this sprint
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
