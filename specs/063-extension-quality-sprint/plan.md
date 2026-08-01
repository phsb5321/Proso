# Implementation Plan: Extension Quality Sprint

**Branch**: `063-extension-quality-sprint` | **Date**: 2026-02-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/063-extension-quality-sprint/spec.md`

## Summary

Comprehensive quality improvement sprint addressing 5 areas: (1) runtime message validation with Zod schemas at all handler boundaries, (2) expanding TTS provider support from 2 to 5 providers by creating IAudioGenerator adapters for OpenAI, Groq, and Cartesia, (3) WCAG 2.1 AA accessibility compliance with ARIA live regions and reduced-motion support, (4) raising test coverage from 25% to 60% with stricter linting, and (5) architecture cleanup standardizing message naming and consolidating handler files.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes)
**Primary Dependencies**: WXT 0.20.13, @webext-core/messaging 2.3.0, Zod 3.23.8, franc-min 6.2.0, Dexie 4.2.1, Jest 29.x, Biome (linter)
**Storage**: IndexedDB (audio cache via Dexie), browser.storage.local (settings)
**Testing**: Jest (unit/integration), Playwright (E2E), contract tests for adapters
**Target Platform**: Firefox 112+ (MV2 via WXT), Chrome 88+ (MV3)
**Project Type**: Single project (browser extension)
**Performance Goals**: Message validation <5ms overhead per handler call; no regression in build size (<1.1 MB)
**Constraints**: AMO compliance (no obfuscation), offline audio cache, <200ms paragraph highlight latency
**Scale/Scope**: ~2,405 existing tests, 18 handler files, 86 registered handlers, 5 TTS providers

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Cross-Browser MV3 Priority | PASS | All changes are browser-agnostic; adapter pattern maintained |
| II. Privacy by Design | PASS | FR-005 removes API key metadata logging; no new data collection |
| III. Hexagonal Architecture | PASS | New adapters follow ports/adapters pattern; handlers stay in registry |
| IV. Test Coverage | PASS | Explicitly raises coverage thresholds; adds integration tests |
| V. Observability | PASS | Structured error responses improve error tracking |
| VI. Simplicity | PASS | Adapters wrap existing legacy providers; no new abstractions |
| Quality: TypeScript strict | PASS | All new code in strict TypeScript |
| Quality: Biome pass | PASS | Enables stricter rules and fixes warnings |
| Quality: All tests pass | PASS | SC-010 requires 2,400+ tests continue passing |
| Quality: E2E on Firefox | N/A | No new E2E tests in scope (manual testing planned) |

**Post-Phase 1 Re-check**: No violations. The design stays within existing architectural patterns.

## Project Structure

### Documentation (this feature)

```text
specs/063-extension-quality-sprint/
├── plan.md              # This file
├── research.md          # Phase 0 research findings
├── data-model.md        # Entity definitions and relationships
├── quickstart.md        # Development setup and workflow
├── contracts/           # API contracts per requirement group
│   ├── audio-generator-adapters.md
│   ├── message-validation.md
│   ├── accessibility.md
│   ├── quality-gates.md
│   └── architecture-cleanup.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── core/shared/
│   └── errors.ts                    # MODIFY: Expand ProviderId union
├── ports/
│   └── audio-generator.port.ts      # READ-ONLY: Reference interface
├── adapters/audio/
│   ├── browser-tts-audio.adapter.ts # READ-ONLY: Reference
│   ├── elevenlabs-audio.adapter.ts  # READ-ONLY: Reference
│   ├── openai-audio.adapter.ts      # NEW: OpenAI adapter
│   ├── groq-audio.adapter.ts        # NEW: Groq adapter
│   ├── cartesia-audio.adapter.ts    # NEW: Cartesia adapter
│   └── index.ts                     # MODIFY: Export new adapters
├── composition/
│   ├── factories.ts                 # MODIFY: Add factory cases
│   └── types.ts                     # MODIFY: Expand ApiKeys
├── handlers/
│   ├── *.handlers.ts (15 files)     # MODIFY: Add Zod param validation
│   └── schemas/                     # NEW: Handler validation schemas
│       └── index.ts                 # Zod schemas per handler
├── entrypoints/
│   ├── background.ts               # MODIFY: Legacy bridge mapping
│   ├── content.ts                   # MODIFY: Dead code removal, naming
│   └── popup/main.ts               # MODIFY: Response validation
├── utils/
│   ├── config/schema.ts             # MODIFY: Expand PROVIDERS
│   ├── messaging/handlers/          # DELETE: Migrate to src/handlers/
│   └── providers/elevenlabs.ts      # MODIFY: Remove key logging
├── entrypoints/options/             # MODIFY: CSS accessibility
└── styles/
    └── components.css               # MODIFY: reduced-motion completeness

tests/
├── unit/                            # MODIFY: New adapter unit tests
├── contract/                        # MODIFY: New adapter contract tests
└── integration/                     # NEW: Dispatch + round-trip tests

# Config files
├── jest.config.js                   # MODIFY: Coverage thresholds
└── biome.json                       # MODIFY: Enable linting rules
```

**Structure Decision**: Existing hexagonal architecture layout. No new directories except `src/handlers/schemas/` for Zod validation schemas and `tests/integration/` for new integration tests. Three new adapter files in `src/adapters/audio/`. All changes follow the established patterns from features 034 and 062.

## Complexity Tracking

> No constitution violations. All changes follow existing patterns.

*No entries needed.*
