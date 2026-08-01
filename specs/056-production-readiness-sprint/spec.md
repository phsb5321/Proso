# Feature Specification: Production Readiness Sprint

**Feature Branch**: `056-production-readiness-sprint`  
**Created**: 2026-02-06  
**Status**: Draft  
**Input**: User description: "Compile remaining work from all previous specs into a catch-up task to make VoxPage production ready"

## Context & Motivation

VoxPage has accumulated 55 feature specifications over its development history. A comprehensive audit of the codebase against these specs reveals that while core functionality works (ElevenLabs TTS, word-level highlighting, audio caching, playback queue), significant production-readiness gaps exist across security, testing, code quality, and UI consistency. This sprint consolidates all actionable remaining work from relevant specs (034, 039, 045, 049, 027) and addresses newly discovered issues into a single production-readiness effort.

### Key Audit Findings

- **Security**: Telemetry gateway token hardcoded as fallback in 3 source files; 100+ console.log statements in source (stripped in production but noisy in development)
- **Testing**: ~60% of source files lack any test coverage; all 15 hexagonal handlers are untested; privacy-sensitive telemetry code has zero tests; coverage thresholds exist but are not enforced in CI
- **UI Integrity**: Settings page and popup display provider cards/options for OpenAI, Groq, and Cartesia, but only ElevenLabs is implemented -- creating a misleading user experience
- **Architecture**: Background script is a 2,371-line monolith; hexagonal migration is partially complete with ~35 handler stubs containing "TODO Phase 4" placeholders; deprecated functions still in use
- **Configuration**: Stale root manifest.json conflicts with build config; placeholder gecko ID; stale package-lock.json alongside pnpm-lock.yaml
- **Obsolete Specs**: 10 specs (387 tasks) are superseded or abandoned and should be archived

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Clean and Honest User Interface (Priority: P1)

A user installs VoxPage and opens the settings page to configure their TTS provider. They see only the providers that actually work -- ElevenLabs and Browser TTS (free fallback). There are no phantom buttons, broken test connections, or provider cards for services that don't function. The popup dropdown matches the settings page. The user configures their ElevenLabs API key, tests it successfully, selects a voice, and begins reading articles with confidence that everything shown in the UI is functional.

**Why this priority**: Users encountering broken UI elements (non-functional provider cards, test buttons that do nothing) will immediately lose trust in the extension. This is the single most impactful issue for first impressions.

**Independent Test**: Can be verified by installing the extension, opening settings, and confirming every visible element is functional. No dead buttons, no phantom providers, no broken interactions.

**Acceptance Scenarios**:

1. **Given** a fresh install, **When** user opens settings, **Then** only ElevenLabs and Browser TTS provider options are displayed
2. **Given** the settings page is open, **When** user clicks any "Test" button, **Then** the test executes and returns a meaningful success/failure result
3. **Given** the popup is open, **When** user views the provider dropdown, **Then** only functional providers appear (matching the settings page)
4. **Given** no API key is configured, **When** user tries to play an article, **Then** Browser TTS is used as fallback with clear feedback about the fallback

---

### User Story 2 - Reliable Extension with Verified Quality (Priority: P1)

A developer working on VoxPage pushes a code change. The CI pipeline runs all test suites (unit, contract, integration, E2E, security) and enforces coverage thresholds. If any test fails or coverage drops below the minimum, the merge is blocked. The developer can trust that the test suite catches regressions in message routing, audio playback, caching, and highlighting before they reach users.

**Why this priority**: Without enforced test coverage and passing tests, every release risks shipping regressions. The current state has ~60% of source files untested, including all message handlers (the backbone of the extension's communication layer).

**Independent Test**: Can be verified by running the full test suite and confirming all tests pass, coverage meets thresholds, and CI blocks on failures.

**Acceptance Scenarios**:

1. **Given** a code change to a handler, **When** CI runs, **Then** handler unit tests catch breaking changes
2. **Given** coverage drops below 70%, **When** CI runs, **Then** the build fails with a clear coverage report
3. **Given** all tests pass, **When** a merge to main is attempted, **Then** CI greenlights the merge
4. **Given** a privacy-sensitive telemetry change, **When** CI runs, **Then** telemetry tests verify PII redaction works correctly

---

### User Story 3 - Secure Production Build (Priority: P1)

A user installs VoxPage from AMO (addons.mozilla.org). The extension contains no debug logging, no hardcoded credentials, no source maps, and no references to internal infrastructure. API keys are stored securely in browser storage and never exposed in the build artifacts. The extension requests only the permissions it actually needs.

**Why this priority**: Security issues can result in AMO rejection, user data exposure, or reputational damage. Hardcoded telemetry tokens and excessive permissions are immediate blockers for a trustworthy public release.

**Independent Test**: Can be verified by building the production extension and scanning artifacts for debug code, credentials, source maps, and unnecessary permissions.

**Acceptance Scenarios**:

1. **Given** a production build, **When** artifacts are scanned, **Then** zero hardcoded tokens or credentials are found
2. **Given** a production build, **When** the manifest is inspected, **Then** only necessary permissions are declared (no `<all_urls>`, no unused API hosts)
3. **Given** a production build, **When** JS files are inspected, **Then** zero console.log statements and zero source maps exist
4. **Given** the extension is running, **When** sensitive data flows through the system, **Then** telemetry redacts PII before transmission

---

### User Story 4 - Structured Debug and Diagnostic Capability (Priority: P2)

A developer encounters a bug report from a user who says "playback stopped after 3 paragraphs." The developer enables debug mode, which activates structured logging with component-tagged prefixes and a debug API. The developer can reproduce the issue, inspect the log buffer, examine internal state, and identify whether the failure is in message routing, audio generation, or highlight synchronization -- without adding ad-hoc console.log statements.

**Why this priority**: The current debugging experience relies on 100+ scattered console.log statements with no structure, no component tagging, and no way to inspect internal state. This makes bug triage slow and unreliable.

**Independent Test**: Can be verified by enabling debug mode in a development build, triggering a playback flow, and inspecting the structured log output and debug API state.

**Acceptance Scenarios**:

1. **Given** debug mode is enabled, **When** a message is routed through a handler, **Then** a structured log entry with component tag and message type is recorded
2. **Given** a development build, **When** a developer accesses the debug API, **Then** they can inspect extracted text, playback state, cache stats, and log buffer
3. **Given** a production build, **When** the page is inspected, **Then** the debug API is not exposed and no debug logs are present
4. **Given** an E2E test fails, **When** the test report is generated, **Then** captured console output from the extension is included for diagnosis

---

### User Story 5 - Complete Hexagonal Architecture Migration (Priority: P2)

The extension's message handling flows entirely through the hexagonal handler pipeline. The background script serves only as a composition root (wiring adapters to ports) with no inline business logic. Legacy handler stubs are removed. Developers can reason about any feature by reading the relevant handler, port, and adapter files without deciphering a 2,000+ line monolith.

**Why this priority**: The partial migration creates confusion -- some messages go through hexagonal handlers, others through legacy inline handlers, and ~35 handler stubs contain "TODO Phase 4" placeholders that don't actually do anything. Completing the migration reduces cognitive load and makes the codebase maintainable.

**Independent Test**: Can be verified by confirming all message types route through hexagonal handlers, the background script is under 500 lines, and no legacy handler code remains.

**Acceptance Scenarios**:

1. **Given** any message type, **When** it is dispatched, **Then** it is handled by a hexagonal handler (not a legacy inline handler)
2. **Given** the background script, **When** its line count is measured, **Then** it is under 500 lines
3. **Given** the handler stubs in messaging/handlers/, **When** they are inspected, **Then** they either delegate to domain services or are removed
4. **Given** the extension is running, **When** telemetry is inspected, **Then** 100% of messages use the hexagonal path

---

### User Story 6 - Accessibility and Settings Polish (Priority: P3)

A user who relies on keyboard navigation opens the VoxPage settings page. They can tab through all controls, see clear focus indicators, and hear screen reader announcements for status changes (toast notifications, test results). Touch targets meet minimum size requirements. The theme (light/dark/system) is applied consistently across all UI surfaces.

**Why this priority**: Accessibility is both a quality standard (WCAG 2.1 AA) and a potential AMO review consideration. The foundation exists (ARIA roles, skip links, focus-visible) but gaps remain (no keyboard tab navigation in popup, native confirm() dialogs, inconsistent theme application).

**Independent Test**: Can be verified by running automated accessibility tests (axe-core) and performing manual keyboard-only navigation through all UI surfaces.

**Acceptance Scenarios**:

1. **Given** the settings page, **When** axe-core automated tests run, **Then** zero critical or serious violations are found
2. **Given** the popup, **When** a user navigates with Arrow keys between tabs, **Then** tab focus moves correctly with ARIA state updates
3. **Given** any destructive action (clear cache, reset settings), **When** triggered, **Then** an accessible modal confirmation appears (not a native browser confirm())
4. **Given** the system theme changes, **When** the popup is opened, **Then** the theme matches the system preference

---

### User Story 7 - Codebase Hygiene and Obsolete Spec Cleanup (Priority: P3)

The repository contains only relevant specification documents. The 10 superseded specs (044-tauri-pdf-reader, 024-settings-page-redesign, 042-firefox-e2e-real-user-simulation, 021-comprehensive-overhaul, 037-testing-completion-hardening, 010-ssot-architecture, 032-biome-linting, 023-feature-roadmap, 022-plasmo-migration, 018-ui-redesign) are archived. Dead code is removed (unused functions, stale manifest.json, package-lock.json, offscreen document files for Firefox-only builds). TODO markers are either resolved or tracked as issues.

**Why this priority**: Repository hygiene reduces confusion for contributors and prevents future developers from acting on outdated specifications. Dead code increases maintenance burden and makes audits harder.

**Independent Test**: Can be verified by confirming obsolete specs are archived, dead files are removed, and TODO count is reduced to a documented minimum.

**Acceptance Scenarios**:

1. **Given** the specs/ directory, **When** listed, **Then** obsolete specs are moved to an archive/ directory or deleted
2. **Given** the repository root, **When** inspected, **Then** no stale manifest.json or package-lock.json exists
3. **Given** the source code, **When** TODO markers are counted, **Then** fewer than 10 remain and each references a tracked issue
4. **Given** the build configuration, **When** Firefox-only build runs, **Then** no Chrome-specific dead code (offscreen documents) is included

---

### Edge Cases

- What happens when a user has previously saved API keys for now-removed providers (Groq, Cartesia, OpenAI)? Settings migration must clean up orphaned keys without data loss.
- What happens when the telemetry gateway is unreachable? The extension must degrade gracefully without errors visible to the user.
- What happens when debug mode is enabled but the circular log buffer fills up? Oldest entries must be evicted without memory leaks.
- What happens when a user downgrades from a version with the new provider list to an older version? Stored settings must remain backward-compatible.

## Requirements *(mandatory)*

### Functional Requirements

**UI Integrity**

- **FR-001**: The settings page MUST only display provider configuration for implemented providers (ElevenLabs and Browser TTS)
- **FR-002**: The popup provider dropdown MUST only list implemented providers
- **FR-003**: Every visible button, input, and interactive element MUST have a functional handler
- **FR-004**: Dead UI sections (hidden defaults section, legacy queue elements, no-op functions) MUST be removed

**Security**

- **FR-005**: No credentials, tokens, or internal infrastructure URLs MUST appear as hardcoded fallbacks in source code
- **FR-006**: Production builds MUST contain zero console.log statements, zero source maps, and zero debugger statements
- **FR-007**: The extension MUST request only permissions it actively uses
- **FR-008**: The build configuration MUST use a real, unique gecko extension ID (not a placeholder)

**Testing**

- **FR-009**: All hexagonal message handlers MUST have corresponding unit tests
- **FR-010**: Privacy-sensitive telemetry code (PII redaction, error capture, data shipping) MUST have unit tests
- **FR-011**: CI MUST enforce test coverage thresholds and fail the build when coverage drops
- **FR-012**: All ports in the hexagonal architecture MUST have contract tests

**Debug Infrastructure**

- **FR-013**: The extension MUST provide structured logging with component-tagged prefixes and configurable log levels
- **FR-014**: Debug logging code MUST be stripped from production builds
- **FR-015**: A debug API MUST be available in development builds for inspecting internal state
- **FR-016**: E2E test infrastructure MUST capture console output from the extension for failure diagnosis

**Architecture**

- **FR-017**: All message types MUST route through hexagonal handlers (no legacy inline handlers)
- **FR-018**: Legacy handler stubs with "TODO Phase 4" placeholders MUST either be completed or removed
- **FR-019**: The background script MUST serve primarily as a composition root (under 500 lines of orchestration)
- **FR-020**: Deprecated functions that are still called MUST be either un-deprecated or replaced

**Provider Consolidation**

- **FR-021**: The provider system MUST support exactly two providers: ElevenLabs (premium) and Browser TTS (free fallback)
- **FR-022**: When no API key is configured, the system MUST automatically fall back to Browser TTS
- **FR-023**: Settings migration MUST handle cleanup of orphaned provider data from removed providers

**Configuration Hygiene**

- **FR-024**: The repository MUST contain only one source of truth for manifest configuration (the build tool config)
- **FR-025**: The repository MUST not contain stale lock files from unused package managers
- **FR-026**: CI install steps MUST use locked/frozen dependency installation for reproducibility

**Accessibility**

- **FR-027**: All interactive elements MUST have minimum 44x44px touch targets
- **FR-028**: Status changes (toasts, test results) MUST be announced via ARIA live regions
- **FR-029**: Destructive actions MUST use accessible confirmation modals (not native browser dialogs)
- **FR-030**: Keyboard navigation MUST work across all UI surfaces (popup tabs, settings sections)

**Codebase Hygiene**

- **FR-031**: Obsolete specifications MUST be archived or removed from the active specs directory
- **FR-032**: Dead code (unused functions, unreachable paths, stale files) MUST be removed
- **FR-033**: TODO markers MUST be reduced to fewer than 10 and each MUST reference a tracked issue

### Key Entities

- **Provider Configuration**: The settings and credentials for a TTS provider (API key, selected voice, speed), stored in browser extension storage. Only ElevenLabs and Browser TTS are valid providers.
- **Debug Log Entry**: A structured log record with timestamp, component tag, log level, message, and optional metadata. Stored in a circular buffer with configurable capacity.
- **Handler Registration**: The mapping between a message type and its hexagonal handler function, managed by the handler registry.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero phantom UI elements -- every visible interactive element performs its intended function
- **SC-002**: Test coverage reaches 70% statements, 60% branches, 70% functions, 70% lines (enforced by CI)
- **SC-003**: All hexagonal message handlers (15 files) have corresponding test files with at least one test per exported function
- **SC-004**: Production build contains zero hardcoded credentials, zero console statements, zero source maps
- **SC-005**: Production build size remains under 5MB (AMO limit)
- **SC-006**: All CI pipeline checks pass without `continue-on-error` exceptions for core test suites
- **SC-007**: Background script is under 500 lines after hexagonal migration completion
- **SC-008**: Zero critical or serious accessibility violations as measured by axe-core automated testing
- **SC-009**: Structured debug logging captures all message routing with component tags in development builds
- **SC-010**: Settings migration successfully handles upgrade from any previous version without data loss
- **SC-011**: Article playback starts within 2 seconds of user action
- **SC-012**: Memory usage during playback remains under 100MB

## Assumptions

- Browser TTS (Web Speech API / speechSynthesis) is available in Firefox 112+ and provides acceptable quality as a free fallback
- The existing hexagonal architecture (ports, adapters, handlers, composition) is structurally sound and the migration involves connecting stubs to services, not redesigning the architecture
- AMO review requirements for Firefox extensions are the primary compliance target
- The telemetry gateway will continue operating at its current endpoint; the fix is to move the token to runtime configuration, not to remove telemetry
- The 10 obsolete specs can be archived without losing information needed for future development, as their goals have been addressed by later specs or are no longer relevant

## Dependencies

- Completion of this sprint depends on the existing hexagonal architecture infrastructure (ports, adapters, handler registry) being functional
- Browser TTS fallback requires Web Speech API availability in the target Firefox version (112+)
- CI enforcement changes require GitHub Actions workflow configuration access
- AMO submission requires a real gecko extension ID (needs to be registered if not already)

## Out of Scope

- Adding new TTS providers beyond ElevenLabs and Browser TTS
- Chrome/Edge browser support (Firefox-first strategy per spec 041)
- Internationalization (i18n) of the UI -- no `_locales` infrastructure exists and this is a separate initiative
- Tauri desktop application (spec 044 is being archived)
- Major UI redesign -- this sprint fixes existing UI, it does not introduce new layouts or visual design
- Automated AMO submission pipeline
