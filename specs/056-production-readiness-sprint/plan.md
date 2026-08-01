# Implementation Plan: Production Readiness Sprint

**Branch**: `056-production-readiness-sprint` | **Date**: 2026-02-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/056-production-readiness-sprint/spec.md`

## Summary

VoxPage is a Firefox browser extension for text-to-speech reading of web pages with word-level highlighting. While core TTS functionality works, a comprehensive codebase audit revealed critical production-readiness gaps: phantom UI elements for unimplemented providers, hardcoded credentials, ~60% of source files lacking tests, a partially-migrated hexagonal architecture with 35 TODO stubs, and 10 obsolete specifications cluttering the repository. This sprint consolidates remaining work from specs 034, 039, 045, 049, and 027 into a unified effort to achieve production quality across security, testing, UI integrity, architecture, and codebase hygiene.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (strict mode: `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`)
**Primary Dependencies**: WXT 0.20.13 (build framework), Zod 3.25.76 (validation), Dexie 4.2.1 (IndexedDB), @webext-core/messaging 2.3.0, franc-min 6.2.0 (language detection), lamejs 1.2.1 (MP3 encoding)
**Storage**: IndexedDB via Dexie (audio cache, highlights), browser.storage.local (settings, provider config)
**Testing**: Jest 29.7 (unit/contract/integration/security/regression), Playwright 1.40+ (E2E/visual), jest-axe 8.0 (accessibility)
**Target Platform**: Firefox 112+ (MV2 event pages via WXT), with build scripts for Chrome MV3 (not actively validated)
**Project Type**: Browser extension (single project with hexagonal architecture)
**Performance Goals**: Article extraction <500ms, TTS playback start <2s, highlight re-anchoring <500ms
**Constraints**: Extension package <5MB (AMO limit), memory during playback <100MB, production builds must strip all debug code
**Scale/Scope**: Single-user browser extension, ~170 source files, ~85 test files, 7 user stories covering security/testing/UI/architecture/accessibility/hygiene

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Post-Phase 1 Re-evaluation (2026-02-06)**: No new gate violations found. Research confirmed that:
- The Firefox-first tension is a documentation/governance issue, not a technical blocker (see research.md RQ-6). Recommended resolution: amend constitution to "Firefox-first, Chrome-ready architecture".
- Privacy by Design remediation (FR-005) has a clear implementation path (hybrid build-time inject + storage seeding, research.md RQ-1).
- Test Coverage remediation has a high-impact, low-effort fix (add `--coverage` flag to CI commands, research.md RQ-4).
- Hexagonal Architecture completion is tractable: only playback domain remains legacy; 11 of 12 domains are fully hexagonal (research.md RQ-3).
All gates PASS. Proceed to Phase 2 (task generation via `/speckit.tasks`).

### I. Cross-Browser with MV3 Priority

**Status: ACKNOWLEDGED TENSION**

The constitution mandates Chrome and Firefox as equal first-class platforms. However, the actual codebase is Firefox-first: `wxt.config.ts` hardcodes `browser: "firefox"`, `AGENTS.md` explicitly says "Firefox-first", CI only builds/validates Firefox (except one non-blocking Chrome E2E job), and the background script uses `new Audio()` directly (a Firefox-only pattern). Chrome adapter code exists but is not wired into the composition container.

**This sprint's position**: This is a production-readiness sprint for the current Firefox-first reality. Resolving the constitution/codebase conflict is out of scope -- it requires a deliberate decision about Chrome support strategy and is documented in research.md. The offscreen document files will be retained (not deleted) as they represent valid future Chrome support infrastructure.

**Impact**: No gate violation. The sprint does not remove cross-browser capability; it improves quality for the current primary platform while preserving Chrome scaffolding.

### II. Privacy by Design

**Status: PASS with remediation needed**

- API keys are stored in browser-encrypted storage: PASS
- PII redaction exists in telemetry code: PASS (but untested -- FR-010 addresses this)
- User opt-out for telemetry: PASS
- **REMEDIATION**: Hardcoded telemetry gateway token in 3 source files must be moved to runtime configuration (FR-005)

### III. Hexagonal Architecture

**Status: PASS with completion work**

- Ports/adapters/handlers structure exists: PASS
- Core logic in `src/core/`: PASS
- Strangler Fig migration in progress: PASS
- **COMPLETION**: ~35 handler stubs contain "TODO Phase 4" placeholders; legacy handlers still active in background.ts (FR-017, FR-018, FR-019)

### IV. Test Coverage

**Status: FAIL -- remediation is core objective of this sprint**

- Unit tests for core business logic: PARTIAL (core services tested, handlers/adapters not)
- Integration tests for adapter implementations: PARTIAL (5 integration tests exist)
- E2E tests for critical user flows: PARTIAL (exist but `continue-on-error: true` in CI)
- Contract tests for external API integrations: PARTIAL (7/10 ports covered, 3 missing)
- **REMEDIATION**: FR-009 through FR-012 address all test coverage gaps

### V. Observability

**Status: PASS with improvement needed**

- Telemetry events emitted for significant operations: PASS
- Error capture with stack traces: PASS
- Performance timing on critical paths: PARTIAL
- Telemetry opt-out: PASS
- **IMPROVEMENT**: FR-013 adds structured logging; FR-014 ensures production stripping

### VI. Simplicity

**Status: PASS**

- No new abstractions introduced; completing existing migration
- Removing dead code and phantom UI (reducing complexity)
- No premature abstraction; all changes address documented problems

## Project Structure

### Documentation (this feature)

```text
specs/056-production-readiness-sprint/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: Technical research
├── data-model.md        # Phase 1: Entity definitions
├── quickstart.md        # Phase 1: Integration scenarios
├── contracts/           # Phase 1: Test contracts
│   ├── handler-tests.yaml
│   ├── telemetry-tests.yaml
│   ├── provider-consolidation.yaml
│   ├── debug-infrastructure.yaml
│   └── security-validation.yaml
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── adapters/            # Hexagonal adapters (audio, cache, content, messaging, storage)
│   ├── audio/           # ElevenLabs, direct, offscreen, audio-url adapters
│   ├── cache/           # Memory and IndexedDB cache adapters
│   ├── content/         # Readability extractor, scorer adapters
│   ├── messaging/       # Highlight sync adapters
│   └── storage/         # Browser settings, highlight IndexedDB adapters
├── background/          # Background-specific code
│   ├── init-hexagonal.ts    # Hexagonal initialization
│   └── providers/           # TTS provider implementations (elevenlabs.ts)
├── composition/         # DI container, factories, types
├── core/                # Domain entities and services
│   ├── article/         # Article entity, extraction service
│   ├── content-extraction/  # Content extraction service
│   ├── highlight/       # Highlight entity, anchoring, text-quote-selector
│   ├── playback/        # Playback service and state
│   └── shared/          # Result type, domain errors
├── entrypoints/         # WXT entrypoints
│   ├── background.ts    # Background script (2371 LOC - target: <500 LOC)
│   ├── content.ts       # Content script (1744 LOC)
│   ├── popup/           # Popup UI (main.ts, index.html, style.css)
│   ├── options/         # Settings page (controller.ts, components/, main.ts)
│   ├── settings.html    # Settings page HTML
│   └── offscreen/       # Chrome MV3 offscreen document (retained, not actively used)
├── handlers/            # Hexagonal message handlers (15 files, 0 tests)
├── ports/               # Port interfaces (10 files, 7 with contract tests)
├── styles/              # CSS architecture (tokens, components, content)
└── utils/               # Utility modules (16 subdirectories)
    ├── config/          # Schema, defaults, store, migrations
    ├── logging/         # Log buffer (to be expanded with structured logging)
    ├── messaging/       # Protocol, schemas, handler stubs (35 TODO stubs)
    ├── providers/       # Base provider, ElevenLabs, pricing
    ├── telemetry/       # Usage tracking (7 files, 0 tests)
    └── ...              # audio, cache, content, db, language, options, etc.

tests/
├── unit/                # 41 test files
├── contract/            # 17 test files (port compliance)
├── integration/         # 5 test files
├── e2e/                 # 9 test files (Playwright)
├── security/            # 2 test files (build artifact scanning)
├── visual/              # 4 test files (snapshot regression)
├── regression/          # 3 test files
├── fixtures/            # Test data
├── mocks/               # Mock implementations
└── helpers/             # Test utilities

.github/workflows/
├── ci.yml               # Primary CI (lint, unit, build, visual, E2E)
├── test.yml             # Comprehensive testing (all suites)
└── release.yml          # Release automation (matrix: Firefox + Chrome)
```

**Structure Decision**: Existing hexagonal architecture structure is retained. No new directories are introduced. The sprint modifies files across all existing directories to complete the migration, add tests, and clean up dead code.

## Complexity Tracking

| Tension | Justification | Resolution |
|---------|--------------|------------|
| Constitution says "Cross-Browser MV3" but codebase is Firefox-first | Constitution was amended (045) but codebase/CI was never updated to match. Both directions have valid arguments. | This sprint focuses on Firefox production readiness. Cross-browser alignment is deferred to a future spec that must resolve the constitution/codebase conflict. Offscreen document code is retained. |
| Spec says remove Chrome offscreen code (US7) but constitution says support Chrome | Removing offscreen code would close the door on Chrome support. | Retain offscreen files but do not wire them into the container. Mark as "Chrome support scaffolding" with comments. |
