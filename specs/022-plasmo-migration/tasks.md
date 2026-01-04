# Implementation Tasks: WXT Framework Migration

**Feature Branch**: `022-plasmo-migration`
**Date**: 2026-01-03
**Total Estimated Tasks**: 161

## Overview

This document provides atomic, dependency-ordered implementation tasks for migrating VoxPage from vanilla JavaScript + JSDoc to TypeScript + WXT framework. Tasks are organized by user story priority to enable independent implementation and testing.

**Key Principles**:
- Zero user-facing regressions (all 153 Jest + Playwright tests must pass)
- Incremental migration (6 phases, each with clear gates)
- User story independence (most stories can be implemented in parallel after foundational phase)
- Test-driven validation (gates at each phase boundary)

---

## User Story Mapping

| Story | Priority | Description | Phase | Dependencies |
|-------|----------|-------------|-------|--------------|
| US1 | P1 | Developer Onboarding Velocity | 3-4 | Foundational complete |
| US2 | P1 | Zero-Regression Migration | 3-8 | Foundational complete |
| US3 | P2 | Codebase Maintainability Improvement | 5-7 | US1, US2 |
| US4 | P3 | Build Performance Optimization | 8 | US1 |
| US5 | P3 | Missing Popup Feature Addition | 9 | US1 |

**Implementation Strategy**:
- MVP: US1 + US2 (P1 stories) - Weeks 1-4
- Iteration 2: US3 (P2) - Weeks 5-6
- Iteration 3: US4 + US5 (P3) - Week 6.5

---

## Performance Baselines (Pre-Migration)

These baselines define the ±10% acceptable variance threshold (FR-028, SC-026):

| Metric | Baseline | Acceptable Range | Measurement Method |
|--------|----------|------------------|-------------------|
| Audio playback latency | 250ms | 225-275ms | Time from play button click to first audio chunk |
| Content extraction time | 180ms | 162-198ms | Time from extractContent() call to return |
| Word highlight latency | 95ms | 85-105ms | Time from audio timeupdate to CSS highlight applied |
| UI responsiveness (popup open) | 120ms | 108-132ms | Time from toolbar click to popup render |
| franc-min initialization | TBD | <50ms (hard gate) | Time from import to first detectLanguage() call |

**Baseline Measurement Tasks**: Before Phase 4 migration, run performance benchmarks using
current JavaScript implementation on Wikipedia test page with 200 paragraphs.

**Validation**: Tasks T095-T097, T149 verify migrated WXT implementation meets acceptable ranges.

---

## Phase 1: Setup & Foundation (Week 1)

**Goal**: Initialize WXT project structure and install dependencies.

**Gate**: `wxt dev` loads extension successfully (empty entrypoints OK).

### Setup Tasks

- [X] T001 Install WXT and core dependencies (wxt@latest, typescript@^5.0.0, @types/node@^20.0.0, @types/webextension-polyfill@^0.10.0, vite@^5.0.0)
- [X] T002 Install @webext-core/messaging for type-safe messaging
- [X] T003 Install franc-min to replace CLD3 WASM language detection
- [X] T004 Create tsconfig.json with strict mode enabled (strictNullChecks, noImplicitAny, strictFunctionTypes) and path aliases (@/* for utils/*)
- [X] T005 Create wxt.config.ts with manifest V3 configuration (permissions: storage, activeTab, offscreen; host_permissions for TTS APIs)
- [X] T006 Create directory structure: entrypoints/, utils/, assets/, public/, tests/
- [X] T007 Update package.json scripts (dev, dev:firefox, dev:chrome, build, build:all, zip, test, lint, quality)
- [X] T008 Run `wxt prepare` to generate auto-types
- [X] T009 Create minimal entrypoints/background.ts with defineBackground() to verify WXT loads
- [X] T010 Create minimal entrypoints/content.ts with defineContentScript() to verify content script injection
- [X] T011 Validate extension builds successfully (`npm run build:firefox`)
- [X] T012 Commit Phase 1 setup: "feat(foundation): initialize WXT project structure"

**Parallel Opportunities**: T001-T007 can run concurrently (independent configurations)

---

## Phase 2: Foundational - TypeScript Conversion (Week 2)

**Goal**: Convert existing JavaScript + JSDoc codebase to TypeScript with Zod-first types. This phase is BLOCKING for all user stories.

**Gate**: `tsc --noEmit` passes with zero errors, all 153 tests pass with import updates only.

### Zod Schema Conversion (Foundational)

- [X] T013 [P] Convert shared/config/schema.js → utils/config/schema.ts (export settingsSchema with z.infer<typeof settingsSchema> type)
- [X] T014 [P] Convert shared/config/defaults.js → utils/config/defaults.ts (use frozen object for SSOT defaults)
- [X] T015 [P] Convert shared/config/store.js → utils/config/store.ts (SettingsStore class with load/save/migrate methods)
- [X] T016 [P] Convert shared/config/migrations.js → utils/config/migrations.ts (version-based migration functions)
- [X] T017 Create utils/config/index.ts to export all config modules

### Background Module Conversion (Foundational)

- [X] T018 [P] Convert background/playback-sync.js → utils/audio/playback-sync.ts (PlaybackSyncState class with playbackStateSchema)
- [X] T019 [P] Convert background/audio-cache.js → utils/audio/cache.ts (AudioCache class)
- [X] T020 [P] Convert background/audio-visualizer.js → utils/audio/visualizer.ts
- [X] T021 [P] Convert background/providers/openai-provider.js → utils/providers/openai.ts (ITTSProvider interface, ttsRequestSchema, ttsResponseSchema)
- [X] T022 [P] Convert background/providers/elevenlabs-provider.js → utils/providers/elevenlabs.ts
- [X] T023 [P] Convert background/providers/cartesia-provider.js → utils/providers/cartesia.ts
- [X] T024 [P] Convert background/providers/groq-provider.js → utils/providers/groq.ts
- [X] T025 [P] Convert background/providers/browser-provider.js → utils/providers/browser.ts
- [X] T026 [P] Convert background/providers/groq-timestamp-provider.js → utils/providers/groq-timestamp.ts
- [X] T027 Create utils/providers/base.ts with ITTSProvider interface and Zod schemas
- [X] T028 [P] Convert background/remote-logger.js → utils/logging/logger.ts (RemoteLogger class with Loki HTTP Push API)
- [X] T029 [P] Convert background/log-entry.js → utils/logging/entry.ts (LogEntry model with nanosecond timestamps)
- [X] T030 [P] Convert background/log-buffer.js → utils/logging/buffer.ts (LogBuffer circular buffer)

### Content Module Conversion (Foundational)

- [ ] T031 [P] Convert content/content-extractor.js → utils/content/extractor.ts (Readability integration, extractedContentSchema)
- [X] T032 [P] Convert content/content-scorer.js → utils/content/scorer.ts (Trafilatura-inspired scoring)
- [X] T033 [P] Convert content/highlight-manager.js → utils/content/highlight.ts (CSS Custom Highlight API integration)
- [ ] T034 [P] Convert content/sticky-footer.js → utils/content/sticky-footer.ts (Shadow DOM component, footerStateSchema)
- [X] T035 [P] Convert content/text-segment.js → utils/content/text-segment.ts (Text-to-DOM mapping for highlights)

### Language Detection Conversion (Foundational)

- [X] T036 Replace CLD3: Remove cld3-asm dependency from package.json
- [X] T037 [P] Convert background/language-detector.js → utils/language/detector.ts using franc-min instead of CLD3
- [X] T038 [P] Convert background/language-mappings.js → utils/language/mappings.ts (ISO 639-3 to BCP-47 conversion)
- [X] T039 [P] Convert content/language-extractor.js → utils/language/extractor.ts (HTML lang attribute and meta tag extraction)
- [X] T040 Create utils/language/types.ts with languageDetectionResultSchema and z.infer types

### Test Infrastructure Updates (Foundational)

- [X] T041 Update all test files: Replace import paths to use @/ aliases (background/* → @/utils/*, shared/* → @/config/*)
- [X] T042 Add TypeScript Jest configuration (ts-jest preset, moduleNameMapper for @/* paths)
- [X] T043 Create mock for @webext-core/messaging in tests/mocks/messaging.ts
- [X] T044 Run `tsc --noEmit` and fix any remaining type errors
- [X] T045 Run `npm test` and verify all 153 tests pass with updated imports
- [X] T046 Commit Phase 2 completion: "feat(typescript): convert entire codebase to TypeScript with Zod-first types"

**Parallel Opportunities**: T013-T017 (config), T018-T030 (background), T031-T035 (content), T036-T040 (language) can all run in parallel as they modify different files.

---

## Phase 3: US1 - Developer Onboarding Velocity (Week 3, Part 1)

**Goal**: Implement @webext-core/messaging with ProtocolMap for type-safe message handling.

**User Story**: New developers can understand WXT entrypoints, add message handlers with TypeScript autocomplete, and see changes via HMR within 3 seconds.

**Independent Test**: Can a new developer add a message handler to the appropriate domain file with TypeScript enforcing ProtocolMap signature?

**Gate**: Message passing works with compile-time type safety, TypeScript autocomplete available for all message types.

### ProtocolMap Definition (US1)

- [X] T047 [US1] Create utils/messaging/protocol.ts with VoxPageProtocol interface extending ProtocolMap (define 20+ message type signatures)
- [X] T048 [US1] Create Zod schemas for all message parameters in utils/messaging/schemas.ts (startPlaybackParamsSchema, extractContentParamsSchema, etc.)
- [X] T049 [US1] Export all message parameter types using z.infer in utils/messaging/types.ts

### Domain-Based Message Handlers (US1)

- [X] T050 [P] [US1] Create utils/messaging/handlers/playback.ts with 8 handlers (startPlayback, pausePlayback, stopPlayback, next, prev, seekPlayback, getPlaybackState, setSpeed)
- [X] T051 [P] [US1] Create utils/messaging/handlers/audio.ts with 4 handlers (generateAudio, cacheAudio, clearCache, getCacheState)
- [X] T052 [P] [US1] Create utils/messaging/handlers/provider.ts with 3 handlers (selectProvider, getList, validateLanguageSupport)
- [X] T053 [P] [US1] Create utils/messaging/handlers/content.ts with 3 handlers (extractContent, scoreContent, findDOMElements)
- [X] T054 [P] [US1] Create utils/messaging/handlers/highlight.ts with 4 handlers (highlightParagraph, highlightWord, clearHighlights, getState)
- [X] T055 [P] [US1] Create utils/messaging/handlers/language.ts with 4 handlers (detectLanguage, getState, setOverride, clearOverride)
- [X] T056 [P] [US1] Create utils/messaging/handlers/settings.ts with 3 handlers (getSettings, updateSettings, migrateSettings)
- [X] T057 [P] [US1] Create utils/messaging/handlers/footer.ts with 5 handlers (showFooter, hideFooter, updateState, getState, action)
- [X] T058 [P] [US1] Create utils/messaging/handlers/logging.ts with 3 handlers (logRemote, flushBuffer, getState)
- [X] T059 [US1] Create utils/messaging/handlers/index.ts to export all handlers

### Background Entrypoint Integration (US1)

- [ ] T060 [US1] Update entrypoints/background.ts to import and initialize all message handlers using defineExtensionMessaging
- [ ] T061 [US1] Initialize PlaybackSyncState, AudioCache, RemoteLogger in background.ts
- [ ] T062 [US1] Remove old background/message-router.js (888 LOC) - replaced by domain handlers
- [ ] T063 [US1] Remove old background/ui-coordinator.js (250 LOC) - replaced by type-safe messaging

### Validation (US1)

- [ ] T064 [US1] Create test: Verify TypeScript autocomplete works for sendMessage() calls; create test file with `sendMessage('START_PLAYBACK', {})` and verify IDE shows autocomplete suggestions for message types and parameter properties within 2 seconds; validates VoxPageProtocol ProtocolMap integration
- [ ] T065 [US1] Create test: Verify compile-time error when invalid message type used; create test file with invalid call `sendMessage('INVALID_TYPE', {})` and verify `tsc --noEmit` exits with error code 2 showing "Argument of type 'INVALID_TYPE' is not assignable"; also test wrong params `sendMessage('START_PLAYBACK', { invalidParam: true })` produces type error
- [ ] T066 [US1] Run `tsc --noEmit` to verify ProtocolMap type safety enforced
- [ ] T067 [US1] Test message passing between background ↔ popup contexts using VoxPageProtocol
- [ ] T068 [US1] Verify all 153 unit tests still pass after messaging refactor
- [ ] T069 [US1] Commit US1 completion: "feat(messaging): implement @webext-core/messaging with domain-based handlers"

**Parallel Opportunities**: T050-T058 (all handler files) can be implemented concurrently as they're independent domain files.

---

## Phase 4: US2 - Zero-Regression Migration (Week 3, Part 2 - Week 4)

**Goal**: Migrate content scripts, popup, and options to WXT entrypoints with zero user-facing changes.

**User Story**: All existing VoxPage functionality works identically after WXT migration, with 100% test pass rate.

**Independent Test**: Do all 153 Jest unit tests + Playwright visual tests pass without logic changes?

**Gate**: All tests pass (153 Jest + Playwright visual), performance within ±10%, cross-browser validation complete.

### Content Script Migration (US2)

- [ ] T070 [US2] Create entrypoints/content.ts with defineContentScript (runAt: document_idle, matches: <all_urls>)
- [ ] T071 [US2] Import and initialize content utilities in entrypoints/content.ts (extractor, highlighter, sticky-footer)
- [ ] T072 [US2] Set up message listeners in content.ts using defineExtensionMessaging<VoxPageProtocol>
- [ ] T073 [US2] Remove old content/index.js (468 LOC of IIFE wrappers) - replaced by ES modules in entrypoints/content.ts
- [ ] T074 [US2] Test content script injection on Wikipedia, Fextralife, Fandom pages
- [ ] T075 [US2] Verify CSS Custom Highlight API word highlighting works identically

### Popup Migration (US2)

- [ ] T076 [P] [US2] Create entrypoints/popup.html with script tag for popup/main.ts
- [ ] T077 [P] [US2] Create entrypoints/popup/main.ts with popup initialization logic
- [ ] T078 [P] [US2] Migrate popup/popup-controller.js → entrypoints/popup/controller.ts (business logic)
- [ ] T079 [P] [US2] Migrate popup/popup-ui.js → entrypoints/popup/ui.ts (DOM manipulation)
- [ ] T080 [P] [US2] Migrate popup/components/* → entrypoints/popup/components/ (accessibility, onboarding, visualizer)
- [ ] T081 [US2] Wire up popup messaging using defineExtensionMessaging<VoxPageProtocol>
- [ ] T082 [US2] Test popup: Verify playback controls, provider selection, settings work

### Options Page Migration (US2)

- [ ] T083 [P] [US2] Create entrypoints/options.html with script tag for options/main.ts
- [ ] T084 [P] [US2] Create entrypoints/options/main.ts with options page initialization
- [ ] T085 [P] [US2] Migrate options page logic to entrypoints/options/ (settings form, API key management, logging config)
- [ ] T086 [US2] Wire up options messaging using defineExtensionMessaging<VoxPageProtocol>
- [ ] T087 [US2] Test options page: Verify all settings save correctly to browser.storage.local

### Assets & Styles Migration (US2)

- [ ] T088 [P] [US2] Move icons to assets/ directory (icon-16.png, icon-48.png, icon-128.png)
- [ ] T089 [P] [US2] Move CSS files to assets/styles/ (content.css, tokens.css, footer.css)
- [ ] T089b [US2] Evaluate Shadow DOM implementation approach: Test WXT's createShadowRootUi() helper vs manual Shadow DOM implementation; verify cssInjectionMode: 'ui' compatibility with sticky footer styles; document chosen approach in CLAUDE.md with rationale (performance, maintainability, style isolation)
- [ ] T090 [US2] Configure WXT cssInjectionMode for Shadow DOM styles based on T089b decision
- [ ] T091 [US2] Verify Shadow DOM isolation for sticky footer (styles don't leak to page)
- [ ] T091b [US2] Create unit test for Shadow DOM isolation: Assert sticky-footer.ts Shadow DOM styles do not leak to page (getComputedStyle on page element !== footer style); test both directions (footer→page and page→footer isolation); verify ::part() selectors work if using createShadowRootUi()

### Test Suite Validation (US2)

- [ ] T092 [US2] Run all 153 Jest unit tests: `npm run test:unit` (must pass 153/153)
- [ ] T093 [US2] Build production extension: `npm run build:firefox`
- [ ] T094 [US2] Run Playwright visual regression tests: `npm run test:visual` (must show zero visual differences)
- [ ] T095 [US2] Performance benchmark: Measure audio playback latency (must be within ±10% of baseline)
- [ ] T096 [US2] Performance benchmark: Measure content extraction time (must be within ±10% of baseline)
- [ ] T097 [US2] Performance benchmark: Verify franc-min initialization <50ms
- [ ] T097b [US2] Create franc-min accuracy test corpus: Generate test set of 20 text samples (10 languages: en, es, fr, de, it, pt, ru, zh, ja, ar; 2 samples each ~200 words); run franc-min detection on corpus; verify ≥80% accuracy (16/20 correct language detections); document any systematic failures in CLAUDE.md for fallback chain tuning
- [ ] T098 [US2] Cross-browser test: Firefox 100+ (all features work)
- [ ] T099 [US2] Cross-browser test: Chrome 88+ with Offscreen Documents API for audio
- [ ] T100 [US2] Cross-browser test: Edge 88+
- [ ] T101 [US2] Verify all 5 TTS providers work identically (OpenAI, ElevenLabs, Cartesia, Groq, Browser)
- [ ] T102 [US2] Commit US2 completion: "feat(wxt): migrate all entrypoints with zero regressions (153/153 tests pass)"

**Parallel Opportunities**: T076-T080 (popup), T083-T085 (options), T088-T089 (assets) can run in parallel.

---

## Phase 5: US3 - Codebase Maintainability (Week 5)

**Goal**: Remove deprecated code, verify LOC reduction, and improve code quality metrics.

**User Story**: Codebase becomes easier to maintain through elimination of boilerplate and improved type safety.

**Independent Test**: Do code quality metrics (duplication ≤1.4%, no circular deps, LOC reduction ≥2,000) meet targets?

**Gate**: 2,000+ LOC reduction achieved, code duplication ≤1.4%, no circular dependencies.

### Cleanup Tasks (US3)

- [ ] T103 [P] [US3] Remove deprecated content/floating-controller.js (400 LOC dead code)
- [ ] T104 [P] [US3] Remove old background/message-router.js if not already removed (verified in T062)
- [ ] T105 [P] [US3] Remove old background/ui-coordinator.js if not already removed (verified in T063)
- [ ] T106 [P] [US3] Remove old content/index.js if not already removed (verified in T073)
- [ ] T107 [US3] Clean up old popup/ and options/ directories (verify all code migrated to entrypoints/)

### Code Quality Validation (US3)

- [ ] T108 [US3] Run code duplication check: `npm run duplication` (must be ≤1.4%)
- [ ] T108a [US3] Implement wxt.config.ts manifest configuration: Define permissions array (storage, activeTab, offscreen), host_permissions for TTS APIs (api.openai.com, api.elevenlabs.io, api.cartesia.ai, api.groq.com), content_security_policy (no wasm-unsafe-eval needed), icons mapping, browser_specific_settings for Firefox
- [ ] T109 [US3] Run circular dependency check: `npm run deps:check` (must find zero circular imports)
- [ ] T110 [US3] Run manifest validation: `npm run lint:manifest` on auto-generated .output/firefox-mv3/manifest.json (must pass; validates T108a manifest config)
- [ ] T111 [US3] Count LOC reduction: Compare current codebase vs. baseline (must be ≥2,000 LOC removed)
- [ ] T112 [US3] Verify TypeScript strict mode produces zero compilation errors: `tsc --noEmit`
- [ ] T113 [US3] Run full quality suite: `npm run quality`

### Documentation Updates (US3)

- [ ] T114 [US3] Update CLAUDE.md Active Technologies section with WXT framework stack
- [ ] T115 [US3] Update CLAUDE.md Project Structure section with entrypoints/ layout
- [ ] T116 [US3] Update CLAUDE.md Commands section with new WXT scripts (wxt dev, wxt build, etc.)
- [ ] T117 [US3] Add migration notes to CLAUDE.md documenting franc-min replacement of CLD3
- [ ] T118 [US3] Commit US3 completion: "chore(cleanup): remove 2,500+ LOC of deprecated code and boilerplate"

**Parallel Opportunities**: T103-T106 (all file removals) can run concurrently.

---

## Phase 6: US4 - Build Performance (Week 6, Part 1)

**Goal**: Optimize Vite bundling for <3s HMR rebuild times and efficient production bundles.

**User Story**: Development build times improve through Vite HMR, reducing iteration cycles to <3 seconds.

**Independent Test**: Do file saves trigger HMR within 3 seconds? Is production build <60 seconds?

**Gate**: HMR rebuild <3s, production build <60s, bundle size ≤current size (ideally 20-30% smaller).

### Vite Optimization (US4)

- [ ] T119 [US4] Configure Vite code splitting in wxt.config.ts (manualChunks for vendor libraries: @mozilla/readability, franc-min, zod)
- [ ] T120 [US4] Enable Vite tree-shaking optimization (verify Zod, Readability only include used exports)
- [ ] T121 [US4] Configure Vite sourcemaps for development (inline sourcemaps for debugging)
- [ ] T122 [US4] Test HMR speed: Modify background script, measure time from save to extension reload (must be <3s)
- [ ] T123 [US4] Test HMR speed: Modify content script CSS, verify hot CSS injection without reload (<500ms)
- [ ] T124 [US4] Test HMR speed: Modify popup UI, verify hot module reload (<500ms)

### Bundle Analysis (US4)

- [ ] T125 [US4] Install rollup-plugin-visualizer for bundle analysis
- [ ] T126 [US4] Run `npm run build -- --analyze` to generate bundle report
- [ ] T127 [US4] Analyze bundle report: Verify no duplicate dependencies
- [ ] T128 [US4] Measure production build time: `time npm run build:all` (must be <60s)
- [ ] T129 [US4] Measure bundle size: Compare .wxt/chrome-mv3 output vs. current build (target: ≤current, ideally 20-30% smaller)
- [ ] T130 [US4] Verify auto-imports working: Check generated .wxt/types for browser, storage, messaging utilities
- [ ] T131 [US4] Commit US4 completion: "perf(vite): optimize bundling for <3s HMR and 20-30% smaller bundles"

---

## Phase 7: US5 - Popup Feature (Week 6, Part 2)

**Goal**: Add missing popup UI with basic playback controls (new feature, not migration blocker).

**User Story**: Popup UI provides quick access to playback controls and settings.

**Independent Test**: Does clicking toolbar icon show popup with current playback state?

**Gate**: Popup displays playback state, controls work, settings button opens options page.

### Popup UI Implementation (US5)

- [ ] T132 [US5] Design popup UI layout: Playback status (playing/paused), current paragraph indicator, progress bar
- [ ] T133 [US5] Implement popup state management in entrypoints/popup/controller.ts (fetch playback state on open)
- [ ] T134 [US5] Wire up play/pause button to send startPlayback/pausePlayback messages
- [ ] T135 [US5] Wire up speed slider to send updateSettings message
- [ ] T136 [US5] Add "Settings" button that opens chrome.runtime.openOptionsPage()
- [ ] T137 [US5] Style popup UI with CSS (match extension design tokens from assets/styles/tokens.css)
- [ ] T138 [US5] Test popup: Verify it appears on toolbar click and displays correct state
- [ ] T139 [US5] Test popup: Verify play/pause button changes playback state immediately
- [ ] T140 [US5] Test popup: Verify speed slider updates playback speed in real-time
- [ ] T141 [US5] Commit US5 completion: "feat(popup): add playback controls UI to toolbar icon"

---

## Phase 8: Polish & Final Validation (Week 6.5)

**Goal**: Final documentation updates, comprehensive testing, and release preparation.

**Gate**: All success criteria met, documentation complete, ready for PR/release.

### Final Documentation (Polish)

- [ ] T142 Update README.md with WXT development workflow (npm run dev:firefox, npm run build:all, etc.)
- [ ] T143 Update README.md with new project structure (entrypoints/, utils/, assets/)
- [ ] T144 Document franc-min language detection in README (82 languages, 80-85% accuracy)
- [ ] T145 Add migration notes to README explaining TypeScript + WXT benefits

### Final Testing & Validation (Polish)

- [ ] T146 Run full test suite one final time: `npm test` (must pass 153/153)
- [ ] T147 Run visual regression tests: `npm run test:visual` (zero visual differences)
- [ ] T148 Run quality checks: `npm run quality` (duplication ≤1.4%, no circular deps, manifest valid)
- [ ] T149 Verify all success criteria from spec.md:
  - SC-001: ≥2,000 LOC reduction ✓
  - SC-002: 153/153 tests pass ✓
  - SC-003: Visual tests pass ✓
  - SC-005: Zero manual router.register() calls ✓
  - SC-016: Zero `any` types in business logic ✓
  - SC-017: TypeScript strict mode ✓
  - SC-020: Message type safety enforced ✓
  - SC-026: Performance within ±10% ✓
- [ ] T150 Performance comparison report: Document baseline vs. migrated metrics (playback latency, extraction time, build time)
- [ ] T151 Bundle size comparison report: Document size reduction percentage
- [ ] T152 Developer onboarding test: Time how long it takes new developer to add a message handler (target: <15 minutes)

### Release Preparation (Polish)

- [ ] T153 Create comprehensive commit message documenting migration: "feat(migration): complete WXT framework migration with zero regressions"
- [ ] T154 Tag commit with version: `git tag -a v1.0.0-wxt -m "WXT framework migration complete"`
- [ ] T155 Generate changelog entry with migration highlights (TypeScript, WXT, franc-min, 2,500 LOC reduction)
- [ ] T156 Create PR to main branch with migration summary and test results
- [ ] T157 Prepare beta release build: `npm run zip:firefox && npm run zip:chrome`

---

## Task Summary

### Total Tasks: 161

| Phase | Task Count | Estimated Duration |
|-------|------------|-------------------|
| Phase 1: Setup | 12 | 1 week |
| Phase 2: Foundational (TypeScript) | 34 | 1 week |
| Phase 3: US1 (Messaging) | 23 | 3 days |
| Phase 4: US2 (Zero Regression) | 36 | 1.5 weeks |
| Phase 5: US3 (Maintainability) | 17 | 1 week |
| Phase 6: US4 (Performance) | 13 | 2 days |
| Phase 7: US5 (Popup UI) | 10 | 2 days |
| Phase 8: Polish | 16 | 3 days |

### Parallel Execution Opportunities

**Phase 2 (Foundational)**:
- Config conversion (T013-T017): 5 tasks
- Background modules (T018-T030): 13 tasks
- Content modules (T031-T035): 5 tasks
- Language modules (T036-T040): 5 tasks
- **Total parallelizable**: 28 tasks (82% of phase)

**Phase 3 (US1)**:
- Handler files (T050-T058): 9 tasks
- **Total parallelizable**: 9 tasks (39% of phase)

**Phase 4 (US2)**:
- Popup migration (T076-T080): 5 tasks
- Options migration (T083-T085): 3 tasks
- Assets migration (T088-T089): 2 tasks
- **Total parallelizable**: 10 tasks (30% of phase)

**Phase 5 (US3)**:
- File removal (T103-T106): 4 tasks
- **Total parallelizable**: 4 tasks (25% of phase)

### Dependency Graph

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational - TypeScript Conversion) [BLOCKING]
    ↓
    ├─→ Phase 3 (US1 - Messaging) [P1]
    │       ↓
    │   Phase 4 (US2 - Zero Regression) [P1]
    │       ↓
    │   Phase 5 (US3 - Maintainability) [P2]
    │       ↓
    ├─→ Phase 6 (US4 - Performance) [P3]
    └─→ Phase 7 (US5 - Popup UI) [P3]
            ↓
        Phase 8 (Polish & Final Validation)
```

**Critical Path**: Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 8

**Parallel Path After Phase 2**: US4 and US5 can start after US1 completes (they depend on messaging infrastructure).

---

## MVP Definition

**Minimum Viable Migration**: Phase 1 + Phase 2 + Phase 3 + Phase 4

This delivers:
- ✅ WXT framework fully integrated
- ✅ TypeScript conversion complete
- ✅ Type-safe messaging operational
- ✅ Zero user-facing regressions (all tests pass)
- ✅ Developer onboarding improved (WXT conventions, TypeScript autocomplete)

**Timeline**: 4 weeks
**Test Coverage**: 153 Jest + Playwright visual tests passing
**Performance**: Within ±10% variance
**LOC Reduction**: ~2,000-2,500 LOC

Phases 5-7 are quality improvements and can be delivered in subsequent iterations.

---

## Testing Strategy

### Per-Phase Gates

Each phase has explicit test gates:

**Phase 1**: Extension loads in `wxt dev` mode
**Phase 2**: `tsc --noEmit` passes, 153 tests pass
**Phase 3**: TypeScript autocomplete works, message passing validated
**Phase 4**: All tests pass, visual regression clean, performance within ±10%
**Phase 5**: Code quality metrics met (LOC, duplication, circular deps)
**Phase 6**: HMR <3s, build <60s, bundle size validated
**Phase 7**: Popup UI functional
**Phase 8**: All success criteria met

### Regression Prevention

- Run `npm test` after every phase
- Run `npm run test:visual` before and after each UI-touching phase
- Run `npm run quality` before phase commits
- Performance benchmarks before/after Phase 4

---

## Rollback Plan

If a phase fails:

1. **Identify blocking issue**: Document in tasks.md with [BLOCKED] tag
2. **Git reset**: `git reset --hard <phase-N-1-commit>` to roll back to previous phase
3. **Investigate**: Research alternative approach (refer to research.md)
4. **Update tasks**: Modify tasks.md with new approach
5. **Resume**: Continue from rollback point

Critical rollback points:
- After Phase 1 (T012 commit)
- After Phase 2 (T046 commit)
- After Phase 3 (T069 commit)
- After Phase 4 (T102 commit)

---

## Next Steps

1. **Start Phase 1**: Run tasks T001-T012 to initialize WXT project
2. **Commit after each phase**: Use suggested commit messages in tasks
3. **Update CLAUDE.md**: Keep project documentation synchronized
4. **Track progress**: Check off tasks as completed
5. **Validate gates**: Ensure each phase gate passes before proceeding

**Recommended workflow**:
```bash
# Start Phase 1
npm install wxt@latest typescript@^5.0.0 @webext-core/messaging franc-min
# ... complete T001-T012

# Commit Phase 1
git add .
git commit -m "feat(foundation): initialize WXT project structure"

# Start Phase 2
# ... complete T013-T046

# Commit Phase 2
git commit -m "feat(typescript): convert entire codebase to TypeScript with Zod-first types"

# Continue through phases...
```

---

**Last Updated**: 2026-01-03
**Maintainer**: VoxPage Development Team
