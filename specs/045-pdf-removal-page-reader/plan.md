# Implementation Plan: PDF Removal + Web Page Reading Pivot

**Branch**: `045-pdf-removal-page-reader` | **Date**: 2026-01-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/045-pdf-removal-page-reader/spec.md`

## Summary

Remove all PDF-related functionality from VoxPage browser extension (pdfjs-dist, tesseract-wasm, OCR, PDF handlers) and pivot to focused web page reading with ElevenLabs TTS and durable highlights. The extension will use hexagonal architecture with ports/adapters pattern, targeting Chrome MV3 as primary with Firefox compatibility via adapter abstraction.

**Key Changes**:
- Remove ~30 PDF/OCR files and 2 npm dependencies
- Keep ElevenLabs provider, remove other TTS providers (OpenAI, Groq, Cartesia, Browser)
- Implement W3C Web Annotation format for highlight persistence
- Add offscreen document support for Chrome MV3 audio playback

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes)
**Primary Dependencies**: WXT 0.20.x, @webext-core/messaging 2.3.0, Zod 3.x, idb (IndexedDB wrapper), @mozilla/readability
**Storage**: IndexedDB (highlights, audio cache), browser.storage.local (settings)
**Testing**: Jest (unit), Playwright (E2E)
**Target Platform**: Chrome 88+ (MV3 primary), Firefox 112+ (MV2/MV3 fallback)
**Project Type**: Browser extension (single project with multiple entry points)
**Performance Goals**: Article extraction <500ms, TTS playback start <2s, highlight re-anchoring <500ms
**Constraints**: Service worker context (no DOM in background), offscreen document for Chrome audio, on-demand host permissions
**Scale/Scope**: Single user, local storage only, ~1000 highlights per user

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Firefox-First | **CONFLICT** | Spec targets Chrome MV3-first. Constitution amendment or justification required. |
| II. Privacy by Design | PASS | No raw content logging, API keys in browser storage, opt-out telemetry |
| III. Hexagonal Architecture | PASS | Using ports/adapters pattern (ReaderPort, HighlightRepositoryPort, TtsPort, AudioPlayerPort) |
| IV. Test Coverage | PASS | Unit tests for core, integration for adapters, E2E for critical flows, contract tests for ElevenLabs API |
| V. Observability | PASS | Telemetry events for significant operations, opt-out capable |
| VI. Simplicity | PASS | Removing complexity (PDF, multiple providers), focusing on core value |

### Constitution Conflict Resolution

**Issue**: Constitution Principle I states "Firefox-first" but spec requires Chrome MV3-first for broader market reach.

**Justification**: Chrome MV3 is the industry standard. Firefox supports MV3 and our adapter pattern abstracts browser differences. The codebase already supports both browsers via WXT. We propose amending the constitution to "Cross-browser with MV3 priority" rather than "Firefox-first".

**Migration Path**: Implement Chrome MV3 features (offscreen document) behind `AudioPlayerPort` adapter. Firefox uses `DirectAudioAdapter`, Chrome uses `OffscreenAudioAdapter`. Core business logic remains browser-agnostic.

## Project Structure

### Documentation (this feature)

```text
specs/045-pdf-removal-page-reader/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── elevenlabs-api.yaml
│   └── highlight-storage.yaml
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/
├── core/                        # Domain logic (browser-agnostic)
│   ├── article/                 # NEW: Article extraction domain
│   │   ├── article.entity.ts
│   │   └── extraction.service.ts
│   ├── highlight/               # NEW: Highlight domain
│   │   ├── highlight.entity.ts
│   │   ├── text-quote-selector.ts
│   │   └── anchoring.service.ts
│   ├── playback/                # EXISTING: Playback state domain
│   └── content-extraction/      # EXISTING: Generic extraction
│
├── ports/                       # Port interfaces
│   ├── reader.port.ts           # NEW: Article extraction port
│   ├── highlight-repository.port.ts  # NEW: Highlight storage port
│   ├── tts.port.ts              # EXISTING: TTS generation port
│   └── audio-player.port.ts     # NEW: Audio playback port
│
├── adapters/                    # Adapter implementations
│   ├── content/                 # EXISTING: Content adapters
│   │   └── readability.adapter.ts  # EXISTING: Readability integration
│   ├── audio/                   # MODIFY: Audio adapters
│   │   ├── elevenlabs.adapter.ts   # KEEP: ElevenLabs TTS
│   │   ├── offscreen.adapter.ts    # NEW: Chrome offscreen document
│   │   └── direct.adapter.ts       # NEW: Firefox direct audio
│   ├── storage/                 # EXISTING: Storage adapters
│   │   └── highlight-indexeddb.adapter.ts  # NEW: Highlight storage
│   └── cache/                   # EXISTING: Cache adapters
│
├── handlers/                    # Message handlers
│   ├── playback.handlers.ts     # EXISTING
│   ├── highlight.handlers.ts    # NEW: Highlight CRUD handlers
│   └── reader.handlers.ts       # NEW: Article extraction handlers
│
├── entrypoints/                 # WXT entry points
│   ├── background.ts            # Service worker
│   ├── content.ts               # Content script
│   ├── popup/                   # Popup UI
│   ├── options/                 # Options page
│   └── offscreen.html           # NEW: Chrome offscreen document
│
├── utils/                       # Shared utilities
│   ├── config/                  # Settings
│   ├── messaging/               # Message protocol
│   ├── cache/                   # Audio cache
│   └── providers/               # MODIFY: Keep only ElevenLabs
│       └── elevenlabs.ts
│
└── styles/                      # CSS

tests/
├── unit/                        # Unit tests
│   ├── core/                    # Core domain tests
│   ├── adapters/                # Adapter tests
│   └── handlers/                # Handler tests
├── contract/                    # API contract tests
│   ├── elevenlabs.contract.ts
│   └── highlight-storage.contract.ts
├── integration/                 # Integration tests
└── e2e/                         # E2E tests (Playwright)
```

### Files to Remove

```text
# PDF-related files (30 files)
src/utils/pdf/                   # Directory: init.ts, paragraph-grouper.ts, state.ts, types.ts, extractor.ts
src/utils/content/pdf-highlight.ts
src/utils/content/pdf-word-highlight.ts
src/utils/content/ocr.ts
src/utils/messaging/schemas/pdf.ts
src/utils/messaging/handlers/pdf.ts
src/utils/messaging/handlers/ocr.ts
src/handlers/pdf.handlers.ts
src/background/pdf-controller.ts
types/tesseract-wasm.d.ts

# Unused TTS providers
src/utils/providers/browser.ts
src/utils/providers/cartesia.ts
src/utils/providers/groq.ts
src/utils/providers/groq-timestamp.ts
src/utils/providers/openai.ts

# Update remaining files to remove PDF references
src/entrypoints/background.ts
src/entrypoints/content.ts
src/entrypoints/popup/main.ts
src/handlers/index.ts
src/handlers/instrumented-registry.ts
src/utils/messaging/protocol.ts
src/utils/messaging/types.ts
src/utils/config/defaults.ts
src/utils/config/migrations.ts
src/utils/config/schema.ts
src/ports/text-extractor.port.ts
src/core/content-extraction/extraction-service.ts
```

### Dependencies to Remove

```json
{
  "remove": {
    "pdfjs-dist": "^5.4.530",
    "tesseract-wasm": "^0.11.0"
  },
  "add": {
    "@anthropic-ai/annotation": "^1.0.0"  // Optional: W3C annotation helpers
  }
}
```

**Structure Decision**: Single browser extension project with hexagonal architecture. Entry points in `entrypoints/`, core domain in `core/`, adapters in `adapters/`, message handlers in `handlers/`. This matches the existing structure and constitution requirements.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Chrome MV3-first (vs Firefox-first constitution) | Chrome has 65%+ market share; MV3 is the standard; offscreen document required for Chrome audio | Firefox-first would limit user base and require workarounds for Chrome |
| Offscreen document adapter | Chrome MV3 service workers cannot access Audio API | No alternative exists for Chrome MV3 audio playback |
