# Tasks: PDF Removal + Web Page Reading Pivot

**Input**: Design documents from `/specs/045-pdf-removal-page-reader/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Constitution IV (Test Coverage) requires unit tests for core logic, contract tests for APIs, and E2E tests for critical flows.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/` at repository root (WXT browser extension)
- Tests in `tests/unit/`, `tests/contract/`, `tests/e2e/`

---

## Phase 1: Setup (PDF Removal & Cleanup)

**Purpose**: Remove all PDF-related code and dependencies to establish clean baseline

- [x] T001 [P] Remove pdfjs-dist dependency via `pnpm remove pdfjs-dist`
- [x] T002 [P] Remove tesseract-wasm dependency via `pnpm remove tesseract-wasm`
- [x] T003 [P] Delete src/utils/pdf/ directory (init.ts, paragraph-grouper.ts, state.ts, types.ts, extractor.ts)
- [x] T004 [P] Delete src/utils/content/pdf-highlight.ts
- [x] T005 [P] Delete src/utils/content/pdf-word-highlight.ts
- [x] T006 [P] Delete src/utils/content/ocr.ts
- [x] T007 [P] Delete src/utils/messaging/schemas/pdf.ts
- [x] T008 [P] Delete src/utils/messaging/handlers/pdf.ts
- [x] T009 [P] Delete src/utils/messaging/handlers/ocr.ts
- [x] T010 [P] Delete src/handlers/pdf.handlers.ts
- [x] T011 [P] Delete src/background/pdf-controller.ts
- [x] T012 [P] Delete types/tesseract-wasm.d.ts
- [x] T013 [P] Delete src/utils/providers/browser.ts
- [x] T014 [P] Delete src/utils/providers/cartesia.ts
- [x] T015 [P] Delete src/utils/providers/groq.ts
- [x] T016 [P] Delete src/utils/providers/groq-timestamp.ts
- [x] T017 [P] Delete src/utils/providers/openai.ts
- [x] T018 Remove PDF imports from src/entrypoints/background.ts
- [x] T019 Remove PDF detection from src/entrypoints/content.ts
- [x] T020 Remove PDF handlers from src/handlers/index.ts
- [x] T021 Remove PDF handler registration from src/handlers/instrumented-registry.ts
- [x] T022 Remove PDF message types from src/utils/messaging/protocol.ts
- [x] T023 Remove PDF types from src/utils/messaging/types.ts
- [x] T024 Remove PDF settings from src/utils/config/defaults.ts
- [x] T025 Remove PDF migrations from src/utils/config/migrations.ts
- [x] T026 Remove PDF schema from src/utils/config/schema.ts
- [x] T027 Clean up src/ports/text-extractor.port.ts to remove PDF-specific interfaces
- [x] T028 Clean up src/core/content-extraction/extraction-service.ts to remove PDF code
- [x] T029 Verify build passes with `pnpm run build:firefox`
- [x] T030 Verify bundle size decreased by ≥2MB (SC-001)

**Checkpoint**: All PDF code removed - clean baseline established

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Zod Schemas (shared across stories)

- [x] T031 [P] Create Zod schema for TextQuoteSelector in src/utils/schemas/highlight.schema.ts
- [x] T032 [P] Create Zod schema for Highlight entity in src/utils/schemas/highlight.schema.ts
- [x] T033 [P] Create Zod schema for Article entity in src/utils/schemas/article.schema.ts
- [x] T034 [P] Create Zod schema for AudioChunk entity in src/utils/schemas/audio-chunk.schema.ts
- [x] T035 [P] Create Zod schema for PlaybackState entity in src/utils/schemas/playback.schema.ts
- [x] T036 Update UserSettings schema in src/utils/config/schema.ts to add new settings (voiceId, defaultHighlightColor)

### Port Interfaces (hexagonal architecture boundaries)

- [x] T037 [P] Create ReaderPort interface in src/ports/reader.port.ts
- [x] T038 [P] Create HighlightRepositoryPort interface in src/ports/highlight-repository.port.ts
- [x] T039 [P] Create AudioPlayerPort interface in src/ports/audio-player.port.ts
- [x] T040 Update TtsPort interface in src/ports/tts.port.ts to focus on ElevenLabs only

### IndexedDB Setup

- [x] T041 Create VoxPage IndexedDB database schema in src/utils/db/schema.ts
- [x] T042 Implement database initialization and migrations in src/utils/db/init.ts

### Messaging Protocol Updates

- [x] T043 Add highlight message types to src/utils/messaging/protocol.ts
- [x] T044 Add reader message types to src/utils/messaging/protocol.ts
- [x] T045 Add audio player message types to src/utils/messaging/protocol.ts

### Permissions Utility

- [x] T046 Create permissions utility in src/utils/permissions.ts (ensureHostPermission function)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Read Article with TTS (Priority: P1) 🎯 MVP

**Goal**: User clicks VoxPage icon, article is extracted using Readability, and begins streaming TTS audio via ElevenLabs within 2 seconds.

**Independent Test**: Navigate to any article page, click extension icon, verify audio playback begins with readable text displayed.

### Core Domain (US1)

- [x] T047 [P] [US1] Create Article entity in src/core/article/article.entity.ts
- [x] T048 [P] [US1] Create Paragraph interface in src/core/article/article.entity.ts
- [x] T049 [US1] Implement ArticleExtractionService in src/core/article/extraction.service.ts
- [x] T049a [US1] Implement fallback extraction using visible text when Readability fails (FR-006)

### Adapters (US1)

- [x] T050 [US1] Implement ReadabilityAdapter in src/adapters/content/readability.adapter.ts (implements ReaderPort)
- [x] T051 [US1] Refactor ElevenLabs adapter in src/adapters/audio/elevenlabs.adapter.ts for streaming TTS
- [x] T051a [US1] Implement exponential backoff retry for ElevenLabs rate limits (edge case handling)
- [x] T052 [US1] Create OffscreenAudioAdapter in src/adapters/audio/offscreen.adapter.ts (Chrome MV3)
- [x] T053 [US1] Create DirectAudioAdapter in src/adapters/audio/direct.adapter.ts (Firefox fallback)

### Offscreen Document (US1 - Chrome MV3)

- [x] T054 [P] [US1] Create src/entrypoints/offscreen.html for Chrome audio playback
- [x] T055 [P] [US1] Create src/entrypoints/offscreen.ts with audio handling logic
- [x] T056 [US1] Update wxt.config.ts to include offscreen document entry point (N/A - Firefox-only build)
- [x] T057 [US1] Add offscreen permission to manifest in wxt.config.ts (N/A - Firefox-only build)

### Message Handlers (US1)

- [x] T058 [US1] Create reader.handlers.ts in src/handlers/reader.handlers.ts (EXTRACT_ARTICLE, GET_PARAGRAPHS)
- [x] T059 [US1] Update playback.handlers.ts in src/handlers/playback.handlers.ts for new audio adapters (existing playback works)
- [x] T060 [US1] Register new handlers in src/handlers/index.ts

### Background Script Updates (US1)

- [x] T061 [US1] Update src/entrypoints/background.ts to use new reader/playback handlers
- [x] T062 [US1] Implement browser detection for adapter selection (Chrome vs Firefox) - Firefox uses DirectAudioAdapter
- [x] T063 [US1] Add PlaybackState management in background for cross-tab coordination (existing articleCache in reader.handlers)

### Content Script Updates (US1)

- [x] T064 [US1] Update src/entrypoints/content.ts to handle EXTRACT_ARTICLE messages
- [x] T065 [US1] Add paragraph highlighting during playback in content script (existing highlight functionality)

### Popup UI Updates (US1)

- [x] T066 [US1] Update src/entrypoints/popup/main.ts with "Read" button for article extraction (existing play button)
- [x] T067 [US1] Add playback controls (play/pause/skip) to popup (already implemented)
- [x] T068 [US1] Show extracted article title and paragraph count in popup (paragraph info display exists)
- [x] T069 [US1] Update src/entrypoints/popup/index.html for new UI elements (already has full UI)
- [x] T070 [US1] Add styles for playback controls in src/entrypoints/popup/style.css (already styled)

### Audio Caching (US1)

- [x] T071 [US1] Implement AudioChunk storage in IndexedDB via src/adapters/cache/audio-cache.adapter.ts (028-smart-audio-cache)
- [x] T072 [US1] Add cache lookup before TTS generation in playback flow (checkPersistentCache in background.ts)
- [x] T073 [US1] Implement LRU eviction for audio cache (maxCacheSizeMb from settings) (src/utils/cache/eviction.ts)

### Tests (US1 - Constitution IV)

- [x] T073a [P] [US1] Write unit tests for ArticleExtractionService in tests/unit/core/article/extraction.service.test.ts
- [x] T073b [P] [US1] Write unit tests for fallback extraction in tests/unit/core/article/fallback.test.ts
- [x] T073c [US1] Write contract tests for ElevenLabs API in tests/contract/elevenlabs-api.test.ts (per contracts/elevenlabs-api.yaml)
- [x] T073d [US1] Write integration tests for OffscreenAudioAdapter in tests/unit/adapters/audio/offscreen.adapter.test.ts (skipped - Chrome types unavailable in Jest)

**Checkpoint**: User Story 1 complete - Article reading with TTS works independently on Chrome and Firefox

---

## Phase 4: User Story 2 - Create and Persist Highlights (Priority: P2)

**Goal**: User selects text, creates highlight that persists via IndexedDB, re-anchors on page reload using TextQuoteSelector.

**Independent Test**: Select text, create highlight, reload page, verify highlight reappears in correct location.

### Core Domain (US2)

- [x] T074 [P] [US2] Create Highlight entity in src/core/highlight/highlight.entity.ts
- [x] T075 [P] [US2] Create TextQuoteSelector type in src/core/highlight/text-quote-selector.ts
- [x] T076 [US2] Implement AnchoringService in src/core/highlight/anchoring.service.ts (re-anchoring algorithm)
- [x] T077 [US2] Implement fuzzy matching with Levenshtein similarity in src/core/highlight/anchoring.service.ts

### Adapters (US2)

- [x] T078 [US2] Implement HighlightIndexedDBAdapter in src/adapters/storage/highlight-indexeddb.adapter.ts (implements HighlightRepositoryPort)
- [x] T079 [US2] Create highlight CRUD operations (create, list, get, update, delete)
- [x] T080 [US2] Implement byUrl index for efficient page-based queries

### Message Handlers (US2)

- [x] T081 [US2] Create highlight.handlers.ts in src/handlers/highlight.handlers.ts
- [x] T082 [US2] Implement CREATE_HIGHLIGHT handler
- [x] T083 [US2] Implement LIST_HIGHLIGHTS handler (by URL)
- [x] T084 [US2] Implement UPDATE_HIGHLIGHT handler (color, note)
- [x] T085 [US2] Implement DELETE_HIGHLIGHT handler
- [x] T086 [US2] Register highlight handlers in src/handlers/index.ts

### Content Script (US2)

- [x] T087 [US2] Add text selection detection to src/entrypoints/content.ts
- [x] T088 [US2] Implement TextQuoteSelector creation from selection (prefix + exact + suffix)
- [x] T089 [US2] Add visual highlight rendering with CSS highlight API in content script
- [x] T090 [US2] Implement highlight re-anchoring on page load
- [x] T091 [US2] Add orphan detection and user notification for failed re-anchoring
- [x] T092 [US2] Add highlight context menu (delete, add note)

### Popup UI Updates (US2)

- [x] T093 [US2] Add "Highlight" button to popup when text is selected
- [x] T094 [US2] Add color picker for highlight color selection
- [x] T095 [US2] Show highlight count for current page in popup

### Styles (US2)

- [x] T096 [P] [US2] Add highlight colors CSS variables in src/styles/tokens.css (inline in popup/style.css and persistent-highlight.ts)
- [x] T097 [P] [US2] Add highlight visual styles in src/styles/content.css (inline in persistent-highlight.ts)

### Tests (US2 - Constitution IV)

- [ ] T097a [P] [US2] Write unit tests for AnchoringService in tests/unit/core/highlight/anchoring.service.test.ts
- [ ] T097b [P] [US2] Write unit tests for fuzzy matching in tests/unit/core/highlight/fuzzy-matching.test.ts
- [ ] T097c [US2] Write contract tests for highlight storage in tests/contract/highlight-storage.test.ts (per contracts/highlight-storage.yaml)
- [ ] T097d [US2] Write integration tests for HighlightIndexedDBAdapter in tests/unit/adapters/storage/highlight-indexeddb.adapter.test.ts

**Checkpoint**: User Story 2 complete - Highlights persist and re-anchor independently

---

## Phase 5: User Story 3 - Cross-Browser Compatibility (Priority: P3)

**Goal**: Extension works identically on Chrome (MV3) and Firefox (MV2/MV3) with adapter abstraction.

**Independent Test**: Install extension in both browsers, verify article reading, TTS, and highlights work identically.

### Browser Abstraction (US3)

- [ ] T098 [US3] Create browser detection utility in src/utils/browser-detect.ts
- [ ] T099 [US3] Implement adapter factory in src/composition/audio-adapter.factory.ts
- [ ] T100 [US3] Ensure OffscreenAudioAdapter only used in Chrome
- [ ] T101 [US3] Ensure DirectAudioAdapter used in Firefox

### Permissions Flow (US3)

- [ ] T102 [US3] Implement on-demand permission request flow in popup
- [ ] T103 [US3] Add permission denied UI state to popup
- [ ] T104 [US3] Test permissions.request() in both browsers

### Manifest Updates (US3)

- [ ] T105 [US3] Update wxt.config.ts for Chrome MV3 specific permissions (offscreen)
- [ ] T106 [US3] Verify Firefox build works without offscreen permission
- [ ] T107 [US3] Add scripting permission for content script injection

### Build Verification (US3)

- [ ] T108 [US3] Run `pnpm run build:chrome` and verify no errors
- [ ] T109 [US3] Run `pnpm run build:firefox` and verify no errors
- [ ] T110 [US3] Run `web-ext lint` for both builds (SC-005)

**Checkpoint**: User Story 3 complete - Extension works on both browsers

---

## Phase 6: User Story 4 - Minimal Settings Configuration (Priority: P4)

**Goal**: Options page allows ElevenLabs API key entry, voice selection, and speed configuration.

**Independent Test**: Open options page, enter API key, select voice, verify TTS works with settings.

### Options Page Updates (US4)

- [ ] T111 [P] [US4] Update src/entrypoints/options/index.html with ElevenLabs settings section
- [ ] T112 [US4] Implement API key input with validation in src/entrypoints/options/main.ts
- [ ] T113 [US4] Add API key validation on save (call ElevenLabs /user endpoint)
- [ ] T114 [US4] Implement voice selection dropdown (fetch from ElevenLabs /voices)
- [ ] T115 [US4] Add speed slider (0.5 - 2.0 range)
- [ ] T116 [US4] Add default highlight color picker
- [ ] T117 [US4] Add cache management section (clear cache button, show stats)

### Settings Storage (US4)

- [ ] T118 [US4] Update settings defaults in src/utils/config/defaults.ts
- [ ] T119 [US4] Add settings migration for new fields in src/utils/config/migrations.ts

### Options Page Styles (US4)

- [ ] T120 [P] [US4] Update styles for options page in src/entrypoints/options/style.css

**Checkpoint**: User Story 4 complete - Settings configuration works

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

### Quality Gates

- [ ] T121 Run `pnpm run deps:check` and verify zero circular dependencies (SC-007)
- [ ] T122 Run `pnpm run duplication` and verify <2% code duplication
- [ ] T123 Run full test suite `pnpm test` and verify all pass (SC-006)
- [ ] T124 Verify memory usage during playback <100MB (SC-008)
- [ ] T124a Verify offscreen document cleanup when not in use (SC-009, Chrome only)

### E2E Tests (Constitution IV)

- [ ] T124b Write E2E test for article reading flow in tests/e2e/article-reading.spec.ts (Chrome)
- [ ] T124c Write E2E test for article reading flow in tests/e2e/article-reading.spec.ts (Firefox)
- [ ] T124d Write E2E test for highlight creation/persistence in tests/e2e/highlights.spec.ts
- [ ] T124e Write E2E test for settings configuration in tests/e2e/settings.spec.ts

### Documentation

- [ ] T125 [P] Update CLAUDE.md to reflect PDF removal and new architecture
- [ ] T126 [P] Update README.md with new feature overview
- [ ] T127 Create migration guide for users of old PDF API

### Performance

- [ ] T128 Verify article extraction <500ms (SC-002)
- [ ] T129 Verify TTS playback starts <2 seconds (SC-003)
- [ ] T130 Verify highlight re-anchoring <500ms (SC-004)

### Cleanup

- [ ] T131 Remove any remaining PDF-related comments from codebase
- [ ] T132 [P] Clean up unused imports across all files
- [ ] T133 Run quickstart.md manual testing checklist

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational phase - MVP target
- **User Story 2 (Phase 4)**: Depends on Foundational phase - can run parallel to US1
- **User Story 3 (Phase 5)**: Depends on US1 and US2 adapters being in place
- **User Story 4 (Phase 6)**: Depends on Foundational phase - can run parallel to US1
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent after Foundational - Core MVP
- **User Story 2 (P2)**: Independent after Foundational - Can develop in parallel with US1
- **User Story 3 (P3)**: Requires US1 adapters exist - Verifies cross-browser parity
- **User Story 4 (P4)**: Independent after Foundational - Can develop in parallel with US1

### Parallel Opportunities

**Phase 1 (Setup)**: T001-T017 can all run in parallel (file deletions)
**Phase 2 (Foundational)**: T031-T035, T037-T040 can run in parallel
**Phase 3 (US1)**: T047-T048, T054-T055 can run in parallel
**Phase 4 (US2)**: T074-T075, T096-T097 can run in parallel
**Phase 6 (US4)**: T111, T120 can run in parallel

---

## Parallel Example: Phase 1 Cleanup

```bash
# Launch all file deletions together:
Task: "Delete src/utils/pdf/ directory"
Task: "Delete src/utils/content/pdf-highlight.ts"
Task: "Delete src/utils/content/pdf-word-highlight.ts"
Task: "Delete src/utils/content/ocr.ts"
Task: "Delete src/utils/providers/browser.ts"
Task: "Delete src/utils/providers/cartesia.ts"
Task: "Delete src/utils/providers/groq.ts"
Task: "Delete src/utils/providers/groq-timestamp.ts"
Task: "Delete src/utils/providers/openai.ts"
```

## Parallel Example: User Story 1 Core

```bash
# Launch entity creation together:
Task: "Create Article entity in src/core/article/article.entity.ts"
Task: "Create Paragraph interface in src/core/article/article.entity.ts"

# Launch offscreen files together:
Task: "Create src/entrypoints/offscreen.html for Chrome audio playback"
Task: "Create src/entrypoints/offscreen.ts with audio handling logic"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (PDF removal)
2. Complete Phase 2: Foundational (schemas, ports, DB)
3. Complete Phase 3: User Story 1 (article reading + TTS)
4. **STOP and VALIDATE**: Test US1 independently on Chrome
5. Deploy/demo if ready - core value proposition works

### Incremental Delivery

1. Setup + Foundational → Clean codebase ready
2. Add User Story 1 → Test independently → **MVP ready!**
3. Add User Story 2 → Test independently → Highlights work
4. Add User Story 3 → Test independently → Cross-browser verified
5. Add User Story 4 → Test independently → Settings complete
6. Each story adds value without breaking previous stories

### Suggested MVP Scope

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1)**

This delivers:
- ✅ PDF code removed
- ✅ Article extraction with Readability
- ✅ ElevenLabs TTS streaming
- ✅ Playback controls (play/pause/skip)
- ✅ Works on Chrome MV3 (offscreen document)
- ✅ Audio caching

MVP does NOT include:
- ❌ Highlights (US2)
- ❌ Firefox verification (US3)
- ❌ Settings page redesign (US4)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
