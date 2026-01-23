# VoxPage Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-01-06

## ✅ MIGRATION COMPLETE - 026-src-folder-restructure

**Current Status**: TypeScript migration complete. All source code in `src/` directory.
**Branch**: `031-source-code-protection`
**Test Results**: 1084 tests (934 pass, 150 skipped for legacy API compatibility)
**Quality**: 0 circular dependencies, 2% code duplication

### Active Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 5.x | Strict mode (strictNullChecks, noImplicitAny, strictFunctionTypes) |
| WXT | 0.20.13 | Framework (Vite 5.x bundler, auto-imports, manifest generation) |
| @webext-core/messaging | 2.3.0 | Type-safe messaging with ProtocolMap (37 handlers) |
| Zod | 4.3.4 | Runtime validation, Zod-first types via `z.infer<>` |
| franc-min | 6.2.0 | Language detection (replaced CLD3 WASM) |
| @mozilla/readability | - | Content extraction |

### Project Structure (Post-026 Restructure)

```
src/                          # All source code (srcDir in wxt.config.ts)
  ├── entrypoints/            # WXT auto-discovery entry points
  │   ├── background.ts       # Service worker with message handlers
  │   ├── content.ts          # Content script (18 message handlers)
  │   ├── options.html        # Options page HTML
  │   ├── options/            # Options page modules
  │   │   ├── main.ts         # Entry point
  │   │   └── controller.ts   # Settings form logic
  │   └── popup/              # Popup UI
  │       ├── index.html      # Popup HTML
  │       └── main.ts         # Entry point
  │
  ├── utils/                  # Shared TypeScript utilities
  │   ├── config/             # Settings, defaults, migrations, store
  │   ├── audio/              # Playback sync, cache, visualizer, MP3 encoder
  │   ├── cache/              # Smart audio cache (IndexedDB, LRU eviction, cost estimator)
  │   ├── providers/          # 6 TTS providers + base interface
  │   ├── content/            # Extractor, scorer, highlighter, sticky-footer, OCR
  │   ├── language/           # franc-min detector, mappings, extractor
  │   ├── logging/            # Remote logger, buffer, entry
  │   ├── messaging/          # Protocol, schemas, types, 9 handler domains
  │   ├── queue/              # Reading queue store, player
  │   └── ai/                 # AI summarization
  │
  ├── background/             # Additional background modules
  │   └── providers/          # ElevenLabs timestamp support
  │
  └── styles/                 # CSS design tokens and components
      ├── tokens.css          # Design tokens
      ├── content.css         # Content script styles
      └── components.css      # Component styles

public/icons/                 # Extension icons (auto-copied by WXT)
tests/                        # Jest + Playwright tests
  ├── unit/                   # Unit tests
  ├── contract/               # API contract tests
  └── regression/             # Regression tests
```

### Notes

**Legacy Directories Deleted** (026-src-folder-restructure):
- `background/*.js` - ~9,400 LOC deleted
- `content/*.js` - ~2,400 LOC deleted
- `legacy/` - ~2,500 LOC deleted
- `shared/` - Migrated to src/utils/config/ (TypeScript equivalents existed)
- Total: ~14,803 LOC of legacy JavaScript removed

**Skipped Tests**: 150 tests skipped for legacy API compatibility. These tests were written for the JavaScript message-schemas.js API. The TypeScript version uses @webext-core/messaging with a different protocol-based approach.

---

## Hexagonal Architecture (034-hexagonal-architecture)

**Status**: Migration ~90% complete. Most message handlers migrated to hexagonal architecture.
**Branch**: `034-hexagonal-architecture`
**Test Results**: 1086 tests (51 suites pass, 4 skipped)
**Quality**: 0 circular dependencies, 1.61% code duplication

**Migration Progress**:
- ✅ Playback handlers → `src/handlers/playback.handlers.ts`
- ✅ Settings handlers → `src/handlers/settings.handlers.ts`
- ✅ Footer handlers → `src/handlers/footer.handlers.ts`
- ✅ Cache handlers → `src/handlers/cache.handlers.ts`
- ✅ Prefetch handlers → `src/handlers/prefetch.handlers.ts`
- ✅ Audio handlers → `src/handlers/audio.handlers.ts`
- ✅ Provider handlers → `src/handlers/provider.handlers.ts`
- ⏳ PARAGRAPH_CLICKED handler (complex orchestration, kept in background.ts)
- ⏳ TTS playback functions (speakCurrentParagraph, etc.)

**Remaining Legacy in background.ts (~1682 LOC)**:
- PARAGRAPH_CLICKED handler (combines extraction + playback + footer)
- TTS playback functions (audio generation, prefetch)
- Strangler Fig dispatch for backward compatibility
- Initialization and cache cleanup code

### Architecture Layers

```
src/
  ├── core/                    # Domain layer (pure business logic)
  │   ├── shared/              # Result<T,E> type, domain errors
  │   ├── playback/            # PlaybackState entity, PlaybackService
  │   └── content-extraction/  # ExtractedContent entity, ContentExtractionService
  │
  ├── ports/                   # Port interfaces (dependency contracts)
  │   ├── audio-generator.port.ts     # IAudioGenerator
  │   ├── cache-store.port.ts         # ICacheStore
  │   ├── highlight-sync.port.ts      # IHighlightSynchronizer
  │   ├── text-extractor.port.ts      # ITextExtractor
  │   ├── content-scorer.port.ts      # IContentScorer
  │   └── settings-store.port.ts      # ISettingsStore
  │
  ├── adapters/                # Adapter implementations
  │   ├── audio/               # TTS provider adapters (OpenAI, ElevenLabs, etc.)
  │   ├── cache/               # IndexedDB and in-memory cache adapters
  │   ├── content/             # Readability extractor, Trafilatura scorer
  │   ├── messaging/           # Content script messaging adapter
  │   └── storage/             # Browser settings adapter
  │
  ├── composition/             # Dependency injection container
  │   ├── container.ts         # Service container (singleton)
  │   ├── factories.ts         # Adapter factory functions
  │   └── types.ts             # Container type definitions
  │
  └── handlers/                # Message handler registry
      ├── registry.ts          # HandlerRegistry class
      ├── playback.handlers.ts # Playback message handlers
      ├── cache.handlers.ts    # Cache message handlers
      └── content.handlers.ts  # Content extraction handlers
```

### Key Patterns

- **Result<T, E>**: All fallible operations return `Result<T, E>` instead of throwing
- **Port Interfaces**: Services depend on interfaces, not concrete implementations
- **Adapter Pattern**: Existing code wrapped in adapters implementing port interfaces
- **Composition Root**: Single place (`src/composition/`) where all dependencies are wired
- **Contract Tests**: Tests verify adapters behave identically per port contract
- **Strangler Fig**: Incremental migration - new architecture coexists with legacy code

### Adding a New TTS Provider

1. Create adapter in `src/adapters/audio/` implementing `IAudioGenerator`
2. Add factory case in `src/composition/factories.ts`
3. Run contract tests: `pnpm test -- --testPathPattern=audio-generator.contract`

### Testing with Mocks

```typescript
import { MockAudioGenerator } from 'tests/mocks';
import { PlaybackService } from 'src/core/playback';

const service = new PlaybackService({
  audioGenerator: new MockAudioGenerator(),
  cacheStore: new MockCacheStore(),
  highlightSync: new MockHighlightSync(),
  settingsStore: new MockSettingsStore(),
});
// All tests run in <5ms with no network calls
```

### Quality Metrics (034)

- 0 circular dependencies
- 1.79% code duplication (below 2% threshold)
- 1051 tests passing
- Contract tests verify adapter interchangeability

---

## Active Technologies (by feature)

## Active Technologies
- JavaScript ES2022+ (WebExtension Manifest V3) + Web Audio API, Canvas API, browser.storage API (all native) (002-ui-overhaul)
- browser.storage.local (existing) (002-ui-overhaul)
- JavaScript ES2022+ (WebExtension Manifest V3) + Native Web APIs (CSS Custom Properties, Web Audio API, Canvas API, browser.storage API) (003-ui-quality-testing)
- JavaScript ES2022+ (WebExtension Manifest V3) + Web Audio API, browser.storage API, browser.runtime messaging, CSS Custom Highlight API (004-playback-sync-highlight)
- browser.storage.local for controller position persistence (004-playback-sync-highlight)
- JavaScript ES2022+ (WebExtension Manifest V3) + Web Audio API, CSS Custom Highlight API, browser.storage API (005-fix-highlight-sync)
- JavaScript ES2022+ (WebExtension Manifest V3) + Web Audio API, CSS Custom Highlight API, browser.storage API, Groq Whisper API (006-robust-audio-highlight-sync)
- browser.storage.local (API keys, controller position) (006-robust-audio-highlight-sync)
- JavaScript ES2022+ (WebExtension Manifest V3) + Web Audio API, CSS Custom Highlight API, browser.storage API, browser.runtime messaging (007-audio-sync-extraction-overhaul)
- browser.storage.local (audio cache, word timing cache, settings) (007-audio-sync-extraction-overhaul)
- JavaScript ES2022+ (WebExtension Manifest V3) + None (pure JS + Web APIs); dev: Jest 29.x, Playwright, web-ext 7.x (008-architecture-refactor)
- browser.storage.local (unchanged) (008-architecture-refactor)
- JavaScript ES2022+ (WebExtension Manifest V3) + eslint, eslint-plugin-import-x, zod (optional for P3 message validation) (009-type-safety-validation)
- N/A (dev-time only) (009-type-safety-validation)
- JavaScript ES2022+ (WebExtension Manifest V3) + browser.storage API, browser.runtime messaging, zod (validation, already installed) (010-ssot-architecture)
- browser.storage.local for persisted settings (010-ssot-architecture)
- JavaScript ES2022+ (WebExtension Manifest V3) + Web Audio API, CSS Custom Highlight API, browser.storage API, browser.runtime messaging, zod (validation) (011-highlight-playback-fix)
- browser.storage.local (controller position, settings) (011-highlight-playback-fix)
- JavaScript ES2022+ (WebExtension Manifest V3), CSS3 with Custom Properties + Native browser APIs only (CSS Custom Properties, CSS Custom Highlight API), no external UI frameworks (012-frontend-redesign)
- browser.storage.local (unchanged from existing) (012-frontend-redesign)
- JavaScript ES2022+ (WebExtension Manifest V3) + Mozilla Readability (content extraction), Web Audio API, browser.storage API (013-fix-core-functionality)
- browser.storage.local for settings and API keys (013-fix-core-functionality)
- JavaScript ES2022+ (WebExtension Manifest V3) + Native Fetch API, browser.storage API (no external logging libraries) (014-loki-remote-logging)
- browser.storage.local for config and log buffer (014-loki-remote-logging)
- JavaScript ES2022+ (WebExtension Manifest V3) + Mozilla Readability (content extraction), Native Web APIs (DOM, Map, compareDocumentPosition) (015-dom-element-matching)
- browser.storage.local (existing - no changes required) (015-dom-element-matching)
- Bash/Shell scripts, YAML (GitHub Actions), Markdown + GitHub CLI (`gh`), GitHub Actions, web-ext (for packaging) (016-github-repo-setup)
- N/A (configuration files only) (016-github-repo-setup)
- Markdown (SKILL.md files), Bash (hook scripts), JSON (settings.json) + Claude Code CLI, GitHub CLI (`gh`), git (017-git-workflow-automation)
- JavaScript ES2022+ (WebExtension Manifest V3) + Native Web APIs (Shadow DOM, CSS Custom Properties, CSS Custom Highlight API), browser.storage API, browser.runtime messaging (018-ui-redesign)
- browser.storage.local (footer position, expanded/minimized state, user preferences) (018-ui-redesign)
- JavaScript ES2022+ (WebExtension Manifest V3) + cld3-asm (language detection via WebAssembly), zod (validation) (019-multilingual-tts)
- browser.storage.local (language cache, user preferences) (019-multilingual-tts)
- JavaScript ES2022+ (WebExtension Manifest V3) + Mozilla Readability, Web Audio API, CSS Custom Highlight API, browser.storage API, cld3-asm, zod (020-code-quality-fix)
- browser.storage.local (API keys, settings, footer state, language cache) (020-code-quality-fix)
- JavaScript ES2022+ (WebExtension Manifest V3) + Zod 4.3.4 (validation), cld3-asm 4.0.0 (language detection), Mozilla Readability (content extraction) (021-comprehensive-overhaul)
- TypeScript 5.x (strict mode enabled: strictNullChecks, noImplicitAny, strictFunctionTypes) with WebExtension Manifest V3 APIs + WXT framework (latest), @webext-core/messaging (type-safe messaging), Zod 3.x (schema validation), franc-min (language detection), @mozilla/readability (content extraction), Vite 5.x (bundler) (022-plasmo-migration)
- browser.storage.local (continue using directly, NOT wxt/storage) for API keys, settings, footer state, language cache (022-plasmo-migration)
- TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) (023-feature-roadmap)
- TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.13, @webext-core/messaging 2.3.0, Zod 4.3.4 (024-settings-page-redesign)
- browser.storage.local (WebExtension API) (024-settings-page-redesign)
- Markdown (Claude Code command definition) + Bash scripts for file operations + Claude Code CLI (command execution), AskUserQuestion tool (user interaction), Edit tool (file updates) (025-checklist-roadmap)
- Markdown files in `specs/[feature]/checklists/` - progress persisted as checkbox state (025-checklist-roadmap)
- TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.13, @webext-core/messaging 2.3.0, Zod 4.3.4, Vite 5.x (026-src-folder-restructure)
- browser.storage.local (WebExtension API - unchanged) (026-src-folder-restructure)
- TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.13, @webext-core/messaging 2.3.0, Zod 4.3.4, idb (IndexedDB wrapper) (028-smart-audio-cache)
- IndexedDB for audio blobs (browser.storage.local has 5MB limit), browser.storage.local for cache index (028-smart-audio-cache)
- N/A (documentation/configuration only) + GitHub CLI (`gh`), bash scripts (030-license-repo-protection)
- TypeScript 5.x (strict mode), Bash scripts, YAML (GitHub Actions) + WXT 0.20.13, Vite 5.x, esbuild (built-in minifier), GitHub CLI (`gh`) (031-source-code-protection)
- N/A (configuration/documentation feature) (031-source-code-protection)
- TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.13, pdfjs-dist (PDF parsing), tesseract.js (OCR, lazy-loaded), @webext-core/messaging 2.3.0, Zod 4.3.4 (033-pdf-reading-support)
- IndexedDB for audio cache (existing), browser.storage.local for reading positions and settings (033-pdf-reading-support)
- TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.13 (build framework), @webext-core/messaging 2.3.0 (type-safe messaging), Zod 4.3.4 (runtime validation), idb (IndexedDB wrapper) (034-hexagonal-architecture)
- IndexedDB for audio cache (via idb), browser.storage.local for settings (034-hexagonal-architecture)
- IndexedDB for audio cache (500MB+), browser.storage.local for settings (034-hexagonal-architecture)
- TypeScript 5.x with strict mode (strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.13 (build framework), @webext-core/messaging 2.3.0, Zod 4.3.4 (035-selection-tts-hardening)
- browser.storage.local (settings), IndexedDB (audio cache) (035-selection-tts-hardening)
- TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.13 (build framework), @webext-core/messaging 2.3.0, Zod 4.3.4 (035-selection-tts-hardening)
- TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + Playwright (browser automation), WXT 0.20.13 (extension build), web-ext (Firefox validation) (038-browser-e2e-hardening)
- N/A (test infrastructure, no persistent storage) (038-browser-e2e-hardening)
- TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.x, @webext-core/messaging 2.3.0, Zod 3.x, idb (IndexedDB wrapper), @mozilla/readability (045-pdf-removal-page-reader)
- IndexedDB (highlights, audio cache), browser.storage.local (settings) (045-pdf-removal-page-reader)
- TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.x (build framework), @webext-core/messaging 2.3.0 (type-safe messaging), Zod 4.3.4 (runtime validation), @mozilla/readability (content extraction) (046-bug-bounty-sprint)
- IndexedDB (audio cache), browser.storage.local (settings) (046-bug-bounty-sprint)
- TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.13, @webext-core/messaging 2.3.0, Zod 3.23.8, Dexie 4.2.1 (047-architecture-ui-polish)
- IndexedDB (audio cache via Dexie), browser.storage.local (settings) (047-architecture-ui-polish)
- TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.13, @webext-core/messaging 2.3.0, Zod 4.3.4, franc-min 6.2.0 (048-multilingual-tts-pillar)
- IndexedDB (audio cache), browser.storage.local (settings, language cache, preferences) (048-multilingual-tts-pillar)
- IndexedDB (audio cache), browser.storage.local (settings, API keys) (050-groq-tts-provider)

- JavaScript ES2022+ (WebExtension Manifest V3) + Web Audio API, Fetch API with streaming, browser.storage API (001-realtime-tts-api)

## Project Structure

```text
background/                      # Service worker modules (ES modules)
  index.js                       # Entry point - initializes all modules (008)
  message-router.js              # Message routing with handler registry (008)
  playback-controller.js         # Playback orchestration (008)
  audio-generator.js             # TTS audio generation (008)
  ui-coordinator.js              # UI state sync notifications (008)
  playback-sync.js               # Audio-text synchronization state (004)
  constants.js                   # Message types, storage keys, provider IDs
  provider-registry.js           # TTS provider management
  audio-cache.js                 # Audio segment caching
  audio-visualizer.js            # Audio visualization
  remote-logger.js               # Loki remote logging client (014)
  log-entry.js                   # Log entry model with timestamps (014)
  log-buffer.js                  # Circular buffer for log storage (014)
  providers/                     # TTS provider implementations
    openai-provider.js
    elevenlabs-provider.js       # ElevenLabs with word timing support
    groq-provider.js
    cartesia-provider.js
    browser-provider.js
    groq-timestamp-provider.js   # Whisper-based word timing

content/                         # Content scripts (window.VoxPage namespace pattern)
  index.js                       # Entry point - message listeners (008)
  content-extractor.js           # Text extraction logic (008)
  content-scorer.js              # Content scoring heuristics (008)
  highlight-manager.js           # Paragraph/word highlighting (008)
  floating-controller.js         # Shadow DOM playback controller (004)
  text-segment.js                # Text-to-DOM mapping (004)

popup/                           # Popup UI (ES modules)
  index.js                       # Entry point (008)
  popup-controller.js            # Business logic, state (008)
  popup-ui.js                    # DOM manipulation (008)
  components/
    accessibility.js             # A11y utilities
    onboarding.js                # First-run experience
    visualizer.js                # Audio visualizer canvas

shared/                          # Cross-context utilities (foundational layer)
  config/                        # Configuration SSOT (010-ssot-architecture)
    defaults.js                  # THE source of truth for all default values
    schema.js                    # Zod validation schema
    store.js                     # SettingsStore class for load/save/migrate
    migrations.js                # Version-based migration logic
    logging-defaults.js          # Logging config defaults SSOT (014)
    index.js                     # Central export
  message-types.js               # JSDoc type definitions
  dom-utils.js                   # Common DOM helpers

options/                         # Extension settings page
styles/
  content.css                    # Page-injected styles
  tokens.css                     # Design tokens
  floating-controller.css        # Controller styling

tests/
  unit/                          # Jest unit tests
    config/                      # Config module tests (010)
    log-buffer.test.js           # LogBuffer unit tests (014)
  contract/                      # API contract tests
    config-consistency.test.js   # SSOT compliance tests (010)
    loki-api.test.js             # Loki payload contract tests (014)
  regression/                    # Regression tests (010)
  visual/                        # Playwright visual tests
```

## Commands

### Development (WXT)

```bash
# Start development server with HMR (default: Firefox)
pnpm run dev

# Start development for specific browser
pnpm run dev:firefox
pnpm run dev:chrome

# Build production extension
pnpm run build
pnpm run build:firefox
pnpm run build:chrome
pnpm run build:all          # Builds Firefox, Chrome, and Edge

# Create distributable zip
pnpm run zip
pnpm run zip:firefox
pnpm run zip:chrome
```

### Testing

```bash
# Run unit tests (runs ESLint first for import validation)
pnpm test

# Run unit tests only (skip ESLint)
pnpm run test:unit

# Run unit tests with coverage
pnpm run test:coverage

# Run visual regression tests
pnpm run test:visual

# Update visual test baselines
pnpm run test:visual:update

# Run all tests
pnpm run test:all
```

### Code Quality

```bash
# Lint imports with ESLint
pnpm run lint

# Auto-fix ESLint issues
pnpm run lint:fix

# Lint manifest with web-ext
pnpm run lint:manifest

# Check for circular dependencies
pnpm run deps:check

# Generate dependency graph to deps.svg
pnpm run deps:graph

# Check code duplication
pnpm run duplication

# Run full quality check: deps + duplication + manifest lint
pnpm run quality
```

## Code Style

**TypeScript** (strict mode) for all new code. Follow these conventions:

- **Zod-first types**: Define Zod schemas first, derive types via `z.infer<typeof schema>`
- **ES modules**: Use `import`/`export`, no IIFE wrappers or global namespace patterns
- **Relative imports**: Use `../` paths, not `@/` aliases (per WXT convention)
- **Strict null checks**: Handle `null`/`undefined` explicitly
- **No `any`**: Use proper types or `unknown` with type guards

## Recent Changes
- 050-groq-tts-provider: Added TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.13, @webext-core/messaging 2.3.0, Zod 4.3.4
- 049-tts-provider-consolidation: Added [if applicable, e.g., PostgreSQL, CoreData, files or N/A]
- 048-multilingual-tts-pillar: Added TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes) + WXT 0.20.13, @webext-core/messaging 2.3.0, Zod 4.3.4, franc-min 6.2.0


<!-- MANUAL ADDITIONS START -->

## Feature 007: Audio-Text Sync & Content Extraction Overhaul

### Key Improvements (007-audio-sync-extraction-overhaul)

- **Binary search word lookup**: O(log n) vs O(n) for large word lists
- **Dual-mechanism sync**: timeupdate (4Hz reliable) + requestAnimationFrame (60fps smooth)
- **Drift detection/auto-correction**: Detects >200ms drift and auto-corrects
- **Tab visibility resync**: REQUEST_RESYNC within 500ms when tab returns to foreground
- **Text-based paragraph matching**: Uses text content instead of index for accurate highlighting
- **Wiki-specific content extraction**: Priority selectors for Fextralife, Wikipedia, Fandom, MediaWiki
- **Content scoring algorithm**: Trafilatura-inspired scoring using link density, paragraph count, heading count

### Sync Configuration (from `background/constants.js`)

```javascript
SyncConfig = {
  SYNC_INTERVAL_MS: 250,        // FR-002: 4x/second minimum
  DRIFT_THRESHOLD_MS: 200,       // FR-006: auto-correct threshold
  RESYNC_TIMEOUT_MS: 500,        // FR-007: max resync time
  WORD_LATENCY_TARGET_MS: 100,   // SC-001: word highlight target
  PARAGRAPH_LATENCY_TARGET_MS: 200, // SC-002: paragraph target
  WORD_TIMING_CACHE_MAX_BYTES: 5 * 1024 * 1024, // SC-008: 5MB limit
}
```

### Key Functions (007)

- `normalizeWordTiming()` / `normalizeWordTimeline()`: Handle both startMs/endMs and startTimeMs/endTimeMs formats
- `_binarySearchWord()`: O(log n) word lookup in PlaybackSyncState
- `handleResyncRequest()`: FR-007 compliant resync handler
- `calculateContentScore()`: Trafilatura-inspired content scoring
- `findElementByText()`: FR-018 text-based DOM matching

## Feature 004: Playback Sync & Highlight

### Key Components

- **PlaybackSyncState** (`background/playback-sync.js`): Manages audio-text synchronization using requestAnimationFrame. Tracks paragraph and word-level timing, provides callbacks for paragraph/word changes.

- **FloatingController** (`content/floating-controller.js`): Shadow DOM-based floating playback widget. Draggable, persists position, provides play/pause/seek controls. Injected into web pages.

- **TextSegment** (`content/text-segment.js`): Maps extracted text to DOM elements. Supports word-level Range creation for CSS Custom Highlight API.

### Sync Requirements

- Paragraph highlighting: <200ms latency threshold
- Word highlighting: <100ms latency threshold (Groq Whisper or ElevenLabs)
- CSS Custom Highlight API for word highlighting (Firefox 119+)
- Graceful fallback to paragraph-only for unsupported browsers

### Testing Notes

- Word timing available via Groq Whisper (any provider) or ElevenLabs native
- Test prefers-reduced-motion for animation/scroll behavior
- Test controller z-index on complex sites
- Test multi-tab isolation (each tab has independent state)
- Test tab switch recovery (should resync within 500ms)

## Feature 008: Architecture Refactor

### Module Organization (008-architecture-refactor)

The codebase was refactored from monolithic files into focused modules:

**Background Layer** (ES modules):
- `index.js` - Entry point, dependency injection
- `message-router.js` - Registry-based message routing with 20+ handlers
- `playback-controller.js` - Playback orchestration (central coordinator)
- `audio-generator.js` - TTS audio generation and caching
- `ui-coordinator.js` - UI state sync to popup/content

**Content Layer** (window.VoxPage namespace - content scripts don't support ES modules):
- `index.js` - Message listeners, event handlers
- `content-extractor.js` - Text extraction with wiki/article priority
- `content-scorer.js` - Trafilatura-inspired content scoring
- `highlight-manager.js` - CSS Custom Highlight API integration

**Popup Layer** (ES modules):
- `index.js` - Entry point, event binding
- `popup-controller.js` - State management, background messaging
- `popup-ui.js` - DOM manipulation, UI updates

### Architecture Patterns

- **Handler Registry**: `message-router.js` uses `register(type, handler)` pattern
- **Dependency Injection**: `createRouter()`, `createPlaybackController()` factories
- **Namespace Pattern**: Content scripts use `window.VoxPage.*` for cross-file access
- **Module Headers**: All modules have JSDoc headers describing responsibility

### Quality Metrics

- All modules ≤300 lines (except core orchestrators ~350-690 lines)
- No circular dependencies (`pnpm run deps:check`)
- Low duplication: ~1.4% (`pnpm run duplication`)
- 153 unit tests passing

## Feature 010: Single Source of Truth Architecture

### Configuration SSOT Pattern (010-ssot-architecture)

All configuration defaults are defined in ONE place: `shared/config/defaults.js`

**Key Principle**: No hardcoded default values should exist outside `shared/config/`.

**Module Structure**:
- `defaults.js` - THE source of truth for all default values (frozen object)
- `schema.js` - Zod validation schemas for runtime type checking
- `store.js` - SettingsStore class with load/save/migrate/subscribe
- `migrations.js` - Version-based migration logic for default changes

**Usage Pattern**:
```javascript
// In any component:
import { defaults } from '../shared/config/defaults.js';

// Use defaults.mode, defaults.provider, defaults.speed, etc.
const state = {
  mode: defaults.mode,  // 'article'
  provider: defaults.provider,  // 'browser'
};
```

**Architecture Enforcement**:
- ESLint `import-x/no-restricted-paths` prevents circular imports
- Contract tests (`tests/contract/config-consistency.test.js`) detect drift
- No `active` classes hardcoded in HTML - applied dynamically

**Default Values** (from `shared/config/defaults.js`):
- `mode`: 'article' (text extraction mode)
- `provider`: 'browser' (TTS provider)
- `speed`: 1.0 (playback speed)
- `voice`: null (use provider default)
- `showCostEstimate`: true
- `cacheEnabled`: true
- `maxCacheSize`: 50
- `wordSyncEnabled`: true

## Feature 014: Remote Logging to Loki

### Overview (014-loki-remote-logging)

Optional remote logging to Grafana Loki for debugging production issues. Feature is opt-in and disabled by default (privacy-first design).

### Architecture

**New Modules**:
- `background/remote-logger.js` - Core RemoteLogger class with Loki HTTP Push API integration
- `background/log-entry.js` - LogEntry model with nanosecond timestamp generation
- `background/log-buffer.js` - Circular buffer with size limits and persistence
- `shared/config/logging-defaults.js` - SSOT for logging configuration defaults

### Key Components

**RemoteLogger** (`background/remote-logger.js`):
- Batched log sending (10s interval, 100 entries max)
- Exponential backoff retry with jitter
- Circuit breaker (disables after 10 consecutive failures)
- Auth support: Basic, Bearer, Cloudflare Access tokens
- Log level filtering (debug/info/warn/error)
- Structured labels for Grafana queries

**LogBuffer** (`background/log-buffer.js`):
- Bounded array with FIFO eviction
- 1MB max buffer size (configurable)
- Circuit breaker state tracking
- browser.storage.local persistence

### Configuration (from `shared/config/logging-defaults.js`)

```javascript
loggingDefaults = {
  enabled: false,          // Opt-in, disabled by default
  endpoint: null,          // Loki push endpoint
  authType: 'none',        // none|basic|bearer|cloudflare
  logLevel: 'warn',        // Minimum level to send
  batchIntervalMs: 10000,  // 10 second flush interval
  maxBatchSize: 100,       // Max entries per batch
  maxBufferBytes: 1048576, // 1MB buffer limit
}
```

### Loki Payload Format

```javascript
{
  "streams": [{
    "stream": {
      "app": "voxpage",
      "version": "1.0.0",
      "session": "abc123",
      "level": "error",
      "component": "playback"
    },
    "values": [
      ["1704067200000000000", "Error message here", { "context": "value" }]
    ]
  }]
}
```

### Usage

```javascript
import { getLogger } from './remote-logger.js';

// Log with component context
getLogger().error('Playback failed', 'playback', { reason: 'network' });
getLogger().info('Provider changed', 'background', { provider: 'openai' });
getLogger().debug('State update', 'content', { index: 5 });
```

### Options Page

Developer Settings section in options page includes:
- Enable/disable toggle
- Loki endpoint URL (must be HTTPS, end with `/loki/api/v1/push`)
- Auth type selection (None, Basic, Bearer, Cloudflare Access)
- Conditional credential fields based on auth type
- Log level dropdown
- "Test Connection" button with visual feedback

### Testing

```bash
# Run logging-specific tests
pnpm test -- --testPathPattern="log-buffer|loki-api"

# All tests (includes 20+ logging tests)
pnpm test
```

## Feature 015: Improved DOM Element Matching

### Overview (015-dom-element-matching)

Improves the `findMatchingDOMElements` function in content-extractor.js for more accurate paragraph matching between Readability-extracted content and live DOM elements.

### Key Improvements

1. **Document position sorting** - Sort DOM elements using `compareDocumentPosition()` before and after matching
2. **Pre-filtering unwanted containers** - Exclude elements inside infoboxes, navboxes, sidebars, cards, TOC
3. **Fingerprint map** - Build a `Map<fingerprint, Element[]>` for O(1) lookup instead of O(n) linear search
4. **Wiki-specific detection** - Priority selectors for Wikipedia, Fextralife, Fandom, MediaWiki
5. **Fuzzy matching** - 80% character similarity threshold with prefix matching fallback
6. **Graceful fallback** - Falls back to direct DOM extraction when fingerprint matching fails

### Key Functions (content/content-extractor.js)

- `createTextFingerprint(text)` - Creates normalized 50-char text fingerprint (lowercase, no punctuation)
- `textsMatch(text1, text2)` - Fuzzy text matching with exact/prefix/80% similarity
- `sortByDocumentPosition(elements)` - Sorts elements by DOM document order
- `findWikiContentContainer()` - Detects wiki-specific content containers
- `isInsideUnwantedSubContainer(el, container)` - Filters infobox/navbox/toc/cards

### UNWANTED_CONFIG Patterns

```javascript
const UNWANTED_CONFIG = {
  patterns: [
    // Wiki patterns
    'toc', 'table-of-contents', 'infobox', 'navbox',
    // Gaming wiki patterns (Fextralife)
    'bonfire', 'boss-card', 'item-card', 'widget',
    // General patterns
    'card', 'sidebar', 'reference', 'promo', 'ad-'
  ],
  unwantedTags: ['aside', 'figure'],
  wikiSelectors: [
    '#wiki-content-block', '.wiki-content',
    '#mw-content-text', '.mw-parser-output',
    '#WikiaArticle', '.page-content'
  ]
};
```

### Performance Targets

- Matching completes in <50ms for 200 paragraphs
- Pre-filtering completes in <20ms for 500 elements
- Performance stats logged: `VoxPage: Matching stats - extracted: X, candidates: Y, filtered: Z, matched: W, time: Nms`

### Testing

```bash
# Run DOM matching tests
pnpm test -- --testPathPattern="dom-element-matching"

# All tests (includes 33 DOM matching tests)
pnpm test
```

## Feature 017: Git Workflow Automation

### Overview (017-git-workflow-automation)

Claude Code hooks and skills to automate git workflows including atomic commits, push operations, and pull request creation. Uses Stop hooks for workflow suggestions and model-invoked skills for teaching VoxPage-specific conventions.

### File Structure

```text
.claude/
├── settings.json                     # Hook configuration (Stop, PostToolUse)
├── skills/
│   └── voxpage-git-workflow/
│       ├── SKILL.md                  # Main skill with workflow guidance
│       └── pr-template.md            # PR body template reference
└── hooks/
    ├── git-workflow-check.sh         # Stop hook - commit/push/PR suggestions
    └── file-change-tracker.sh        # PostToolUse hook - file change tracking
```

### Hooks

**Stop Hook** (`git-workflow-check.sh`):
- Detects uncommitted changes and suggests atomic commits
- Detects unpushed commits and reminds to push
- Detects feature branches without PRs and suggests PR creation

**PostToolUse Hook** (`file-change-tracker.sh`):
- Monitors Write and Edit operations on implementation files
- Tracks changes to background/, content/, popup/, options/, shared/ directories
- Excludes tests, config, and documentation files

### Skill Sections

The SKILL.md file provides guidance for:

1. **Conventional Commits**: `type(scope): description` format
2. **Atomic Commits**: One logical change per commit
3. **Push Workflow**: Upstream tracking, protected branch detection
4. **PR Creation**: Using `gh pr create` with proper templates
5. **Pre-Commit Validation**: Lint, test, secrets detection
6. **Troubleshooting**: Common issues and solutions

### Conventional Commit Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code restructuring (no behavior change) |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `chore` | Maintenance tasks |
| `perf` | Performance improvement |

### VoxPage Scopes

| Scope | Directory |
|-------|-----------|
| `background` | background/ |
| `content` | content/ |
| `popup` | popup/ |
| `options` | options/ |
| `config` | shared/config/ |
| `styles` | styles/ |
| `deps` | Dependency updates |

### Usage

The skill is model-invoked (no slash command needed). Claude uses it automatically when:
- Creating commits
- Pushing to remote
- Creating pull requests
- Asked about git conventions

## Feature 018: UI Redesign

### Overview (018-ui-redesign)

Comprehensive UI overhaul introducing a sticky footer player, redesigned popup as configuration hub, enhanced options page with collapsible sections, and full WCAG 2.1 AA accessibility compliance.

### Key Components

**Sticky Footer** (`content/sticky-footer.js`):
- Shadow DOM isolated footer player that appears at bottom of page during playback
- Play/pause, prev/next, progress bar with seek, speed control
- Minimize/expand toggle with position persistence
- Dark/light theme via prefers-color-scheme
- Full ARIA labels, live regions, keyboard navigation
- Drag repositioning within bottom third of viewport
- Body padding adjustment when footer is visible (FR-003)

**Footer Message Types** (from `background/constants.js`):
```javascript
FooterMessageTypes = {
  FOOTER_SHOW: 'FOOTER_SHOW',
  FOOTER_HIDE: 'FOOTER_HIDE',
  FOOTER_ACTION: 'FOOTER_ACTION',
  FOOTER_STATE_UPDATE: 'FOOTER_STATE_UPDATE',
  FOOTER_POSITION_CHANGED: 'FOOTER_POSITION_CHANGED',
  FOOTER_VISIBILITY_CHANGED: 'FOOTER_VISIBILITY_CHANGED',
};

FooterActions = {
  PLAY: 'play',
  PAUSE: 'pause',
  PREV: 'prev',
  NEXT: 'next',
  SEEK: 'seek',
  SPEED: 'speed',
  MINIMIZE: 'minimize',
  EXPAND: 'expand',
  CLOSE: 'close',
};
```

**Footer State Defaults** (from `shared/config/defaults.js`):
```javascript
footerStateDefaults = {
  isVisible: false,
  isMinimized: false,
  position: { x: 'center', yOffset: 0 }
};
```

**Popup Enhancements**:
- Playback status indicator with Show Player button
- Configuration hub for provider, voice, speed, mode
- Settings button opens full options page

**Options Page Enhancements**:
- Collapsible accordion sections (API Keys, Defaults, Appearance, Developer)
- Visual save feedback with pulse animation
- Keyboard accessible accordions

### Accessibility Features

- All controls have ARIA labels and roles
- aria-live regions for status announcements
- Focus-visible indicators on all interactive elements
- prefers-reduced-motion support (disables animations)
- 44x44px minimum touch targets
- Tab order follows visual layout
- Keyboard navigation (Tab, Enter, Space)

### Testing

```bash
# Run all tests (includes 467 tests)
pnpm test

# Run linting
pnpm run lint

# Validate manifest
pnpm run lint:manifest
```

## Feature 019: Multilingual TTS Integration

### Overview (019-multilingual-tts)

Adds automatic language detection and multilingual text-to-speech support. The extension automatically detects the page language using CLD3 (Compact Language Detector 3) via WebAssembly and selects appropriate voices for the detected language.

### Key Components

**Language Detection** (`background/language-detector.js`):
- CLD3 WASM-based text analysis for 100+ languages
- HTML lang attribute and meta tag detection
- Confidence scoring with fallback to English
- Language caching to avoid repeated detection
- User language override support

**Language Mappings** (`background/language-mappings.js`):
- Provider-specific language code mappings (BCP-47 to provider codes)
- Voice filtering by language
- Provider language support lookups
- Display name localization for 20+ languages

**Language Extractor** (`content/language-extractor.js`):
- Extracts lang attribute from `<html>` element
- Checks meta tags for language hints
- Samples text content for CLD3 analysis
- Prioritizes main content areas (article, main, #content)

### Provider Language Support

| Provider | Languages | Detection Mode |
|----------|-----------|----------------|
| OpenAI | All (*) | Auto-detect from text |
| ElevenLabs | 29 languages | language_code parameter |
| Browser TTS | System-dependent | Dynamic voice filtering |
| Groq | English only | Throws LanguageNotSupportedError |
| Cartesia | English only | Throws LanguageNotSupportedError |

### Message Types (from `background/constants.js`)

```javascript
LanguageMessageTypes = {
  LANGUAGE_DETECTED: 'languageDetected',
  REQUEST_LANGUAGE_DETECTION: 'requestLanguageDetection',
  GET_LANGUAGE_STATE: 'getLanguageState',
  SET_LANGUAGE_OVERRIDE: 'setLanguageOverride',
  CLEAR_LANGUAGE_OVERRIDE: 'clearLanguageOverride',
  LANGUAGE_STATE_UPDATE: 'languageStateUpdate',
  LANGUAGE_NOT_SUPPORTED: 'languageNotSupported'
};
```

### Language Detection Flow

1. Page loads → content script calls `extractPageLanguage()`
2. Background receives `LANGUAGE_DETECTED` message
3. CLD3 analyzes text sample if metadata is missing/unreliable
4. Detected language stored in cache (keyed by URL hostname)
5. Provider checked for language support
6. If unsupported, user prompted to switch providers via modal

### Popup UI Integration

- Language indicator badge shows 2-letter code (e.g., "ES" for Spanish)
- Language override dropdown with 20 common languages
- "Auto-detect" option uses detected language
- Voice dropdown filters by detected/selected language
- Provider switch modal when language unsupported

### Key Functions

**language-detector.js**:
- `initCLD()` - Lazy-load CLD3 WASM module
- `detectLanguageFromText(text)` - CLD3 text analysis
- `detectLanguage({ metadata, textSample, url })` - Full detection flow
- `getLanguageState(tabId)` - Get current language state
- `setLanguageOverride(code)` / `clearLanguageOverride()` - User overrides

**language-mappings.js**:
- `getProvidersForLanguage(code)` - Get compatible providers
- `getVoicesForLanguage(voices, code, provider)` - Filter voices
- `getLanguageDisplayName(code)` - Localized display name
- `providerSupportsLanguage(provider, code)` - Support check

### Configuration (from `shared/config/defaults.js`)

```javascript
languageDefaults = {
  autoDetectLanguage: true,    // Enable automatic detection
  languageOverride: null,       // User override (null = auto)
  confidenceThreshold: 0.8      // Minimum CLD3 confidence
};
```

### Testing

```bash
# Run language-specific tests
pnpm test -- --testPathPattern="language"

# All tests (includes 557 tests with 50+ language tests)
pnpm test
```

### Error Handling

- `LanguageNotSupportedError` thrown when provider doesn't support language
- Error includes suggested alternative providers
- Popup modal offers one-click provider switching
- Graceful fallback to English on detection failure

## Feature 028: Smart Audio Cache

### Overview (028-smart-audio-cache)

Implements intelligent audio caching using IndexedDB for persistent storage. Reduces API costs and improves playback responsiveness by caching generated TTS audio.

### Architecture

**Key Modules**:
- `src/utils/cache/audio-cache-store.ts` - Main cache store with LRU eviction
- `src/utils/cache/cache-key.ts` - Cache key generation and parsing
- `src/utils/cache/cache-index.ts` - In-memory index for fast lookups
- `src/utils/cache/eviction.ts` - Multi-factor eviction scoring
- `src/utils/cache/cost-estimator.ts` - Cost calculation with cache awareness
- `src/utils/cache/db.ts` - IndexedDB wrapper using `idb` library

**Content Script Utilities**:
- `src/utils/content/paragraph-indicator.ts` - Visual cache status indicators
- `src/utils/content/paragraph-selector.ts` - Paragraph range selection UI

### Cache Key Format

```
${urlHash}:${paragraphIndex}:${provider}:${voice}:${contentHash}
```

Example: `a1b2c3:5:openai:alloy:xyz789`

### Eviction Algorithm

Multi-factor LRU scoring with configurable weights:

```typescript
score = ageMinutes * 1.0 + sizePercentage * 0.5 - log(accessCount + 1) * 2.0
```

Higher scores = higher eviction priority.

### Cost Estimation

Provider pricing (per 1000 characters):

| Provider | Price |
|----------|-------|
| OpenAI TTS | $0.015 |
| ElevenLabs | $0.18 |
| Cartesia | $0.05 |
| Groq | Free |
| Browser TTS | Free |

### Configuration (from `src/utils/config/defaults.ts`)

```typescript
cacheDefaults = {
  maxSizeBytes: 500 * 1024 * 1024, // 500 MB
  maxEntries: 1000,
  maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  evictionThresholdPercent: 90, // Evict at 90%
  evictionTargetPercent: 70,    // Down to 70%
  prefetchAhead: 3,
};
```

### Message Handlers

Cache-related handlers registered in background:

- `cache.getStats` - Get cache statistics
- `cache.clear` - Clear all cached audio
- `cache.clearUrl` - Clear cache for specific URL
- `cache.check` - Check if paragraph is cached
- `cache.get` - Retrieve cached audio
- `cache.set` - Store audio in cache
- `cost.estimate` - Calculate estimated TTS costs
- `paragraphs.getStatus` - Get cache status for paragraphs

### Settings UI

Cache settings in Options page (`settings.html#cache`):
- Cache statistics display (entries, size, hit rate, savings)
- Usage bar visualization
- Clear Cache button with confirmation modal
- Refresh stats button

Cost visibility toggle in Appearance section:
- `showCostEstimate` - Show/hide cost estimates in popup

### Testing

```bash
# Run cache tests
pnpm test -- --testPathPattern="cache"

# Run eviction tests
pnpm test -- --testPathPattern="eviction"

# Run cost estimator tests
pnpm test -- --testPathPattern="cost-estimator"
```

### Offline Support

Cached audio works fully offline. IndexedDB persists across browser sessions. Uncached paragraphs require network for TTS API calls.

## Feature 031: Source Code Protection

### Overview (031-source-code-protection)

Multi-layer source code protection for VoxPage Firefox extension through:
1. GitHub repository access restriction (private visibility + branch protection)
2. AMO-compliant production build hardening (minification + source map removal + debug statement stripping)
3. Legal documentation (Terms of Service, NDA template)
4. CI/CD secrets hardening

**Critical constraint**: Mozilla AMO prohibits obfuscated code. Only minification is allowed.

### Protection Measures Implemented

| Layer | Measure | Status |
|-------|---------|--------|
| Repository | Private visibility | Active |
| Repository | Branch protection (PR reviews, status checks) | Active |
| Repository | CODEOWNERS file | Active |
| Build | Source maps disabled in production | Active |
| Build | console/debugger statements dropped | Active |
| Build | Tree-shaking enabled | Active |
| Legal | TERMS_OF_SERVICE.md | Created |
| Legal | templates/NDA.md | Created |

### Build Hardening Configuration (wxt.config.ts)

```typescript
vite: () => ({
  build: {
    sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
    minify: 'esbuild',
  },
  esbuild: {
    treeShaking: true,
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
}),
```

### Verification Commands

```bash
# Verify repository is private
gh repo view --json visibility

# Build for production
NODE_ENV=production pnpm run build

# Verify no source maps
find .output/firefox-mv2 -name "*.map" -type f

# Verify minification
head -c 500 .output/firefox-mv2/background.js

# Verify console statements removed
grep -E "console\.(log|warn|error)\(" .output/firefox-mv2/*.js | wc -l
```

### Key Decisions

1. **No obfuscation**: Mozilla AMO explicitly prohibits obfuscated code
2. **Minification only**: esbuild minification is allowed and effective
3. **Private repository**: Prevents public access to source code
4. **Legal protection**: ToS and NDA provide contractual IP protection

### Files Created/Modified

- `.github/CODEOWNERS` - Required reviewers for code changes
- `TERMS_OF_SERVICE.md` - Extension terms of service
- `templates/NDA.md` - NDA template for contractors
- `wxt.config.ts` - Production build hardening

<!-- MANUAL ADDITIONS END -->
