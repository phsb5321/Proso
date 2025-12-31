# VoxPage Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-12-30

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

shared/                          # Cross-context utilities
  message-types.js               # JSDoc type definitions
  dom-utils.js                   # Common DOM helpers

options/                         # Extension settings page
styles/
  content.css                    # Page-injected styles
  tokens.css                     # Design tokens
  floating-controller.css        # Controller styling

tests/
  unit/                          # Jest unit tests
  contract/                      # API contract tests
  visual/                        # Playwright visual tests
```

## Commands

```bash
# Run unit tests (runs ESLint first for import validation)
npm test

# Run unit tests only (skip ESLint)
npm run test:unit

# Run unit tests with coverage
npm run test:coverage

# Run visual regression tests
npm run test:visual

# Update visual test baselines
npm run test:visual:update

# Run all tests
npm run test:all

# Lint imports with ESLint (009)
npm run lint

# Auto-fix ESLint issues (009)
npm run lint:fix

# Lint manifest with web-ext
npm run lint:manifest

# Check for circular dependencies (008)
npm run deps:check

# Generate dependency graph to deps.svg (008)
npm run deps:graph

# Check code duplication (008)
npm run duplication

# Run full quality check: deps + duplication + manifest lint (008)
npm run quality
```

## Code Style

JavaScript ES2022+ (WebExtension Manifest V3): Follow standard conventions

## Recent Changes
- 009-type-safety-validation: Added JavaScript ES2022+ (WebExtension Manifest V3) + eslint, eslint-plugin-import-x, zod (optional for P3 message validation)
- 008-architecture-refactor: Added JavaScript ES2022+ (WebExtension Manifest V3) + None (pure JS + Web APIs); dev: Jest 29.x, Playwright, web-ext 7.x
- 007-audio-sync-extraction-overhaul: Added JavaScript ES2022+ (WebExtension Manifest V3) + Web Audio API, CSS Custom Highlight API, browser.storage API, browser.runtime messaging


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
- No circular dependencies (`npm run deps:check`)
- Low duplication: ~1.4% (`npm run duplication`)
- 153 unit tests passing

<!-- MANUAL ADDITIONS END -->
