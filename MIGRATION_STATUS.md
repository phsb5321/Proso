# WXT Framework Migration Status

**Feature**: 022-plasmo-migration
**Branch**: `022-plasmo-migration`
**Last Updated**: 2026-01-03
**Overall Progress**: 27 of 161 tasks complete (16.8%)

## Executive Summary

The VoxPage browser extension is being migrated from vanilla JavaScript + JSDoc to TypeScript + WXT framework. This is a **5-6 week project** with 161 tasks across 8 phases. The foundation is established with WXT configured, TypeScript working, and core modules converted.

**Status**: Phase 1 complete ✅ | Phase 2 in progress 🔄 (59% done)

---

## Commits Pushed (12 total)

### Commit 1: `5914c86` - Phase 1 Foundation
**Date**: 2026-01-03
**Tasks**: T001-T012 (12 tasks)

```
feat(foundation): initialize WXT project structure

- Install WXT, TypeScript 5.x, @webext-core/messaging, franc-min
- Create tsconfig.json with strict mode enabled
- Create wxt.config.ts with Manifest V3 configuration
- Update package.json with WXT dev/build/zip scripts
- Create entrypoints/ directory with minimal background.ts and content.ts
- Update .gitignore and .eslintignore for WXT outputs
- Validate extension builds successfully (18.04 kB bundle)
```

**Gate Passed**: ✅ Extension builds without errors

### Commit 2: `1102cc0` - Config Modules
**Date**: 2026-01-03
**Tasks**: T013-T017 (5 tasks)

```
feat(typescript): convert config modules to TypeScript with Zod

Created:
- utils/config/schema.ts - Zod schemas (settingsSchema, footerStateSchema, detectedLanguageSchema)
- utils/config/defaults.ts - Typed frozen defaults
- utils/config/store.ts - SettingsStore class with full type safety
- utils/config/migrations.ts - Version-based migration logic
- utils/config/index.ts - Centralized exports
```

**Key Achievement**: Zod-first type architecture established

### Commit 3: `1ded842` - Core Audio Modules
**Date**: 2026-01-03
**Tasks**: T018, T027 (2 tasks)

```
feat(typescript): convert playback-sync and provider base

Created:
- utils/audio/playback-sync.ts - PlaybackSyncState class with Zod schemas
- utils/providers/base.ts - ITTSProvider interface + abstract base class
```

**Key Achievement**: Core playback engine converted with type safety

### Commit 4: `bb2f6ec` - Migration Documentation
**Date**: 2026-01-03
**Tasks**: Documentation only

```
docs: add comprehensive migration tracking documentation

Created MIGRATION_STATUS.md with:
- All 3 commit details and progress tracking
- Phase 2 breakdown into 6 batches
- Quick resume guide from Task T019
```

**Key Achievement**: Comprehensive tracking document for future sessions

### Commit 5: `1e25229` - Audio Modules
**Date**: 2026-01-03
**Tasks**: T019, T020 (2 tasks)

```
feat(typescript): convert audio modules to TypeScript with Zod

Created:
- utils/audio/segment.ts - AudioSegment class with Zod metadata validation
- utils/audio/cache.ts - AudioCache LRU cache with configurable limits
- utils/audio/visualizer.ts - AudioVisualizer class for Web Audio API
```

**Key Achievement**: Complete audio infrastructure with Zod schemas and TypeScript types

### Commit 6: `8571fbc` - Provider Infrastructure
**Date**: 2026-01-03
**Tasks**: T021 (partial), infrastructure

```
feat(providers): add pricing model and OpenAI provider TypeScript stubs

Created:
- utils/providers/pricing.ts - Zod-based pricing model
- utils/providers/openai.ts - OpenAI provider implementation
```

**Key Achievement**: Pricing model foundation with Zod validation

### Commit 7: `e81b047` - Complete TTS Providers
**Date**: 2026-01-03
**Tasks**: T021-T026 (6 tasks)

```
feat(providers): complete all 6 TTS provider TypeScript conversions

Created:
- utils/providers/openai.ts - OpenAI with auto-language detection
- utils/providers/elevenlabs.ts - ElevenLabs 29+ languages
- utils/providers/cartesia.ts - Cartesia English voices
- utils/providers/groq.ts - Groq free-tier TTS
- utils/providers/browser.ts - Web Speech API
- utils/providers/groq-timestamp.ts - Whisper word timing
```

**Key Achievement**: Complete provider ecosystem with type-safe API integrations

### Commit 8: `e81b047` - Update Documentation
**Date**: 2026-01-03
**Tasks**: Documentation only

```
docs: update MIGRATION_STATUS.md with Batch 2 completion

Updated MIGRATION_STATUS.md with:
- Commit 7 details for TTS providers
- Progress tracking: 16/161 tasks complete (9.9%)
- Phase 2 status: 35% done
```

**Key Achievement**: Comprehensive tracking of provider conversion progress

### Commit 9: `15ece9b` - Logging Infrastructure
**Date**: 2026-01-03
**Tasks**: T028-T030 (3 tasks)

```
feat(logging): complete logging infrastructure TypeScript conversion

Created:
- utils/logging/entry.ts - LogEntry model with nanosecond timestamps
- utils/logging/buffer.ts - Circular buffer with LRU eviction
- utils/logging/logger.ts - RemoteLogger with Loki HTTP Push API
```

**Key Achievement**: Complete remote logging infrastructure with Loki integration

### Commit 10: `f84b032` - Partial Content Modules
**Date**: 2026-01-03
**Tasks**: T032, T033, T035 (3 of 5 tasks)

```
feat(content): convert 3 of 5 content modules to TypeScript (partial batch 4)

Created:
- utils/content/scorer.ts - Content scoring heuristics (Trafilatura-inspired)
- utils/content/highlight.ts - Highlight manager with CSS Custom Highlight API
- utils/content/text-segment.ts - Text-to-DOM mapping for word highlighting

Note: content-extractor.ts (1167 lines) and sticky-footer.ts (994 lines)
deferred to next session due to size/complexity.
```

**Key Achievement**: Core content processing modules with type safety (3/5 complete)

### Commit 11: `3d8c8fc` - Language Detection Modules
**Date**: 2026-01-03
**Tasks**: T036-T040 (5 tasks)

```
feat(language): complete language detection TypeScript conversion with franc-min

Created:
- utils/language/types.ts - Zod schemas and type definitions
- utils/language/codes.ts - BCP-47 parsing and language code utilities
- utils/language/extractor.ts - Page language extraction from DOM
- utils/language/mappings.ts - Provider-specific language code mappings
- utils/language/detector.ts - Language detection with franc-min (replaces CLD3)

Key Changes:
- Replaced CLD3 WASM with franc-min (pure JavaScript, 82 languages)
- ISO 639-3 to ISO 639-1 mapping
- Full type safety with Zod validation
```

**Key Achievement**: Complete language detection infrastructure with franc-min

---

## Phase 2: TypeScript Conversion Status

**Goal**: Convert entire JavaScript + JSDoc codebase to TypeScript with Zod-first types
**Gate**: `tsc --noEmit` passes + all 153 tests pass
**Progress**: 27 of 46 tasks (59%)

### ✅ Completed (27 tasks)

**Config Modules**:
- [X] T013 - Config schema.ts
- [X] T014 - Config defaults.ts
- [X] T015 - Config store.ts
- [X] T016 - Config migrations.ts
- [X] T017 - Config index.ts

**Audio Modules**:
- [X] T018 - Audio playback-sync.ts
- [X] T019 - Audio cache.ts + segment.ts
- [X] T020 - Audio visualizer.ts

**Provider Modules**:
- [X] T021 - Provider openai.ts + pricing.ts
- [X] T022 - Provider elevenlabs.ts
- [X] T023 - Provider cartesia.ts
- [X] T024 - Provider groq.ts
- [X] T025 - Provider browser.ts
- [X] T026 - Provider groq-timestamp.ts
- [X] T027 - Provider base.ts

**Logging Modules**:
- [X] T028 - Logging logger.ts
- [X] T029 - Logging entry.ts
- [X] T030 - Logging buffer.ts

**Content Modules** (partial):
- [X] T032 - Content scorer.ts
- [X] T033 - Content highlight.ts
- [X] T035 - Content text-segment.ts

**Language Detection Modules**:
- [X] T036 - Remove CLD3 dependency
- [X] T037 - Language detector.ts (with franc-min)
- [X] T038 - Language mappings.ts
- [X] T039 - Language extractor.ts
- [X] T040 - Language types.ts

### 📋 Next Batch: Complete Content Modules (2 tasks remaining) OR Test Infrastructure (6 tasks)

**Option 1 - Complete Content Modules**:
- [ ] T031 - content-extractor.js → utils/content/extractor.ts (1167 lines - complex Readability integration)
- [ ] T034 - sticky-footer.js → utils/content/sticky-footer.ts (994 lines - Shadow DOM component)

**Estimated Time**: 2 hours (large/complex files)

**Option 2 - Test Infrastructure** (recommended - unblocks Phase 2 completion):
- [ ] T041 - Update all test imports (@/ path aliases)
- [ ] T042 - Add TypeScript Jest configuration
- [ ] T043 - Create mock for @webext-core/messaging
- [ ] T044 - Run `tsc --noEmit` and fix type errors
- [ ] T045 - Run `npm test` and verify 153 tests pass
- [ ] T046 - Commit Phase 2 completion

**Estimated Time**: 2 hours
**Commit After**: Phase 2 Gate passed

---

## Remaining Phases (3-8)

### Phase 3: US1 - Developer Onboarding (T047-T069)
**Status**: Not started
**Tasks**: 23
**Goal**: Implement @webext-core/messaging with ProtocolMap

**Key Deliverables**:
- utils/messaging/protocol.ts with VoxPageProtocol interface
- 9 domain-based handler files (playback, audio, provider, content, highlight, language, settings, footer, logging)
- entrypoints/background.ts integration
- Remove old message-router.js (888 LOC)

**Estimated Time**: 1 week

### Phase 4: US2 - Zero Regression Migration (T070-T102)
**Status**: Not started
**Tasks**: 33
**Goal**: Migrate content scripts, popup, options to WXT entrypoints

**Key Deliverables**:
- entrypoints/content.ts with defineContentScript
- entrypoints/popup.html + popup/main.ts
- entrypoints/options.html + options/main.ts
- All 153 tests passing
- Performance within ±10%

**Estimated Time**: 1.5 weeks

### Phase 5: US3 - Maintainability (T103-T118)
**Status**: Not started
**Tasks**: 16
**Goal**: Remove deprecated code, verify LOC reduction

**Key Deliverables**:
- Remove 2,500+ LOC of deprecated code
- Code duplication ≤1.4%
- No circular dependencies
- Update CLAUDE.md with new structure

**Estimated Time**: 1 week

### Phase 6: US4 - Build Performance (T119-T131)
**Status**: Not started
**Tasks**: 13
**Goal**: Optimize Vite bundling

**Key Deliverables**:
- HMR rebuild <3s
- Production build <60s
- Bundle size analysis

**Estimated Time**: 2 days

### Phase 7: US5 - Popup Feature (T132-T141)
**Status**: Not started
**Tasks**: 10
**Goal**: Add missing popup UI

**Estimated Time**: 2 days

### Phase 8: Polish & Final Validation (T142-T157)
**Status**: Not started
**Tasks**: 16
**Goal**: Documentation, final testing, release prep

**Estimated Time**: 3 days

---

## Quick Resume Guide

### To Continue Migration:

1. **Ensure branch is current**:
   ```bash
   git checkout 022-plasmo-migration
   git pull origin 022-plasmo-migration
   ```

2. **Run `/speckit.implement` to continue from T031** (or skip to T036 for language modules)

3. **Batch Workflow**:
   - Convert files in batch
   - Update tasks.md to mark [X] completed
   - Run `npm run build:firefox` to verify
   - Commit batch with descriptive message
   - Push to remote
   - Repeat for next batch

4. **Phase 2 Completion Gate**:
   ```bash
   # Must pass before proceeding to Phase 3
   npx tsc --noEmit        # Zero errors required
   npm test                # All 153 tests pass
   ```

### Key Commands:

```bash
# Development
npm run dev:firefox      # Start WXT dev server
npm run build:firefox    # Build production extension

# Testing
npm test                 # Run all tests
npm run test:unit        # Jest only
npm run test:visual      # Playwright visual regression

# Quality
npm run lint             # ESLint
npm run quality          # Circular deps + duplication + manifest lint

# TypeScript
npx tsc --noEmit         # Type checking (no output)
```

---

## Architecture Decisions

### Zod-First Approach ✅
All TypeScript types derived from Zod schemas using `z.infer<typeof schema>`:
- Runtime validation at boundaries
- Single source of truth for types
- Default value handling

### Module Organization ✅
- `entrypoints/` - WXT auto-discovery (background, content, popup, options)
- `utils/` - Shared code (config, audio, providers, content, language, logging)
- Path aliases: `@/*` maps to `utils/*`

### Provider Pattern ✅
- `ITTSProvider` interface for all providers
- `BaseTTSProvider` abstract class
- Zod validation for requests/responses

---

## Known Issues / Notes

### CLD3 → franc-min Migration (T036-T040)
- CLD3 WASM requires complex bundling (vite-plugin-wasm)
- franc-min is pure JavaScript (282KB, 82 languages)
- 80-85% accuracy sufficient for voice filtering UX
- Remove `cld3-asm` from package.json dependencies

### Browser Compatibility
- Target: Chrome 88+, Firefox 100+, Edge 88+
- CSS Custom Highlight API required (Firefox 119+)
- Offscreen Documents API for Chrome audio

### Test Updates Required
- Import paths: `background/*` → `@/utils/*`
- Mock `@webext-core/messaging` for tests
- Jest config needs TypeScript support (ts-jest)

---

## Success Metrics

### Phase 2 Gate (Foundational)
- ✅ `tsc --noEmit` passes with zero errors
- ✅ All 153 Jest unit tests pass
- ✅ No new ESLint errors

### Final Migration Success (Phase 8)
- ✅ 2,000-3,000 LOC reduction (20-30%)
- ✅ All 153 tests + Playwright visual tests pass
- ✅ Performance within ±10% variance
- ✅ Code duplication ≤1.4%
- ✅ No circular dependencies
- ✅ Bundle size ≤current (ideally 20-30% smaller)

---

## Resources

- **Tasks**: `specs/022-plasmo-migration/tasks.md` (161 tasks, dependency-ordered)
- **Plan**: `specs/022-plasmo-migration/plan.md` (architecture, tech stack)
- **Data Model**: `specs/022-plasmo-migration/data-model.md` (Zod schemas, entities)
- **Contracts**: `specs/022-plasmo-migration/contracts/messaging-protocol.md`
- **Research**: `specs/022-plasmo-migration/research.md` (decisions, alternatives)
- **Quickstart**: `specs/022-plasmo-migration/quickstart.md` (phase-by-phase guide)

---

**Last Updated**: 2026-01-03
**Maintainer**: VoxPage Development Team
