# Feature Specification: Architecture Refactor & Code Quality Improvement

**Feature Branch**: `008-architecture-refactor`
**Created**: 2025-12-31
**Status**: Draft
**Input**: User description: "This codebase is getting too big for its own good. I need you to research to improve the architecture, reduce the size of the code files. Improve the implementation quality. Use better packages and so on"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer Maintains and Extends the Codebase (Priority: P1)

A developer needs to add a new TTS provider or fix a bug in the playback logic. Currently, they must navigate a 1,215-line background.js file with 40+ functions handling multiple unrelated concerns. After the refactor, they can locate the relevant module quickly, understand its single responsibility, and make changes without fear of breaking unrelated functionality.

**Why this priority**: This is the core problem - the codebase is difficult to maintain, understand, and extend. Solving this unlocks all other improvements.

**Independent Test**: Can be tested by measuring time-to-understand for a new developer and by verifying that unit tests can target individual modules without loading the entire background.js.

**Acceptance Scenarios**:

1. **Given** a developer wants to modify message handling, **When** they open the codebase, **Then** they find a dedicated message-router module under 300 lines that handles all message routing logic.
2. **Given** a developer needs to fix a playback bug, **When** they navigate to the playback controller, **Then** they find playback orchestration isolated from caching, visualization, and UI concerns.
3. **Given** a developer wants to add a new message type, **When** they consult the message router, **Then** the pattern for adding new handlers is immediately clear from existing examples.

---

### User Story 2 - Developer Tests Modules in Isolation (Priority: P1)

A developer wants to write unit tests for the content extraction logic. Currently, they must mock the entire content.js environment because extraction, scoring, highlighting, and DOM manipulation are intertwined. After refactoring, they can import just the content-extractor module and test it with minimal setup.

**Why this priority**: Testability directly impacts code quality and developer confidence. Equally important as P1 Story 1.

**Independent Test**: Can be verified by writing a unit test that imports a single refactored module without loading browser APIs or global state.

**Acceptance Scenarios**:

1. **Given** a developer wants to test content extraction, **When** they import the content-extractor module, **Then** they can test extraction logic without mocking highlight functions or DOM event handlers.
2. **Given** a test file for the message router, **When** it runs, **Then** it does not require initialization of audio cache, visualizer, or TTS providers.
3. **Given** a module with external dependencies, **When** a developer writes tests, **Then** dependencies are injected rather than hard-coded globals.

---

### User Story 3 - Developer Understands Data Flow (Priority: P2)

A developer debugging a sync issue needs to trace how a play request flows through the system. Currently, they must search through background.js for message handlers, then follow calls to various helper functions scattered throughout the file. After refactoring, the message flow is explicit with clear module boundaries.

**Why this priority**: Understanding data flow is essential for debugging but less urgent than the core architectural split.

**Independent Test**: Can be tested by tracing a message type from entry to completion and verifying it crosses no more than 3 clearly-defined module boundaries.

**Acceptance Scenarios**:

1. **Given** a developer traces a "play" message, **When** they follow the code path, **Then** they encounter clearly named modules: message-router → playback-controller → audio-generator.
2. **Given** the message protocol documentation, **When** a developer reads it, **Then** all 17+ message types are listed with their handlers and expected responses.

---

### User Story 4 - Code Review and Onboarding (Priority: P3)

A new team member joins the project and needs to understand the architecture. Currently, they face two 1000+ line files with no clear entry points. After refactoring, they can read a module index or architecture diagram that explains the system in layers.

**Why this priority**: Important for team scaling but dependent on prior refactoring work.

**Independent Test**: Can be verified by a new developer successfully making their first contribution within a shorter onboarding time.

**Acceptance Scenarios**:

1. **Given** a new developer reads the project structure, **When** they look at background/, **Then** files are organized by responsibility with clear naming conventions.
2. **Given** module files exist, **When** a developer reads any module, **Then** it has a clear single responsibility described in its first comment block.

---

### Edge Cases

- What happens when a refactored module has a circular dependency with another module? (The build or linter should detect and report this.)
- How does the system handle backward compatibility if stored state format changes during refactor? (State formats remain unchanged; only code organization changes.)
- What happens if a refactored module fails to load due to an import error? (Extension logs the error and fails gracefully with user notification.)
- How are shared utilities accessed without creating tight coupling? (Through a dedicated shared/ or utils/ directory with explicit imports.)

## Requirements *(mandatory)*

### Functional Requirements

#### File Size Reduction

- **FR-001**: Background.js MUST be split into modules where no single file exceeds 300 lines of code (excluding comments and blank lines).
- **FR-002**: Content.js MUST be split into modules where no single file exceeds 300 lines of code.
- **FR-003**: All new modules MUST have a single, clearly-defined responsibility documented at the top of the file.

#### Module Organization

- **FR-004**: The background/ directory MUST contain separate modules for: message routing, playback orchestration, audio generation, and UI coordination.
- **FR-005**: The content/ directory MUST contain separate modules for: content extraction, content scoring, and highlighting management.
- **FR-006**: Shared utilities MUST be placed in a dedicated utils/ or shared/ directory.
- **FR-007**: Module dependencies MUST flow in one direction (no circular imports).

#### Message Architecture

- **FR-008**: A centralized message router MUST handle all incoming messages and delegate to appropriate handlers.
- **FR-009**: Message types MUST be defined in a single constants file with clear documentation of each message's purpose and expected payload.
- **FR-010**: Each message handler MUST be a pure function that can be tested without browser context where possible.

#### Code Quality

- **FR-011**: Duplicated code patterns MUST be extracted into shared utility functions.
- **FR-012**: Global state MUST be encapsulated in dedicated state management modules with clear getter/setter interfaces.
- **FR-013**: All new modules MUST use ES2022+ module syntax (import/export).

#### CSS Organization

- **FR-014**: Inline CSS in JavaScript files MUST be extracted to dedicated CSS files where practical.
- **FR-015**: Shared CSS variables MUST remain in tokens.css with no duplication in component files.

#### Backward Compatibility

- **FR-016**: The refactored extension MUST pass all existing unit tests.
- **FR-017**: The refactored extension MUST maintain identical user-facing behavior.
- **FR-018**: All existing message types and storage keys MUST remain unchanged.

### Key Entities

- **Module**: A self-contained JavaScript file with a single responsibility, explicit imports, and exports.
- **Message Router**: Central dispatcher that receives all runtime messages and delegates to registered handlers.
- **Playback Controller**: Orchestrates play/pause/stop/seek operations across paragraphs.
- **Audio Generator**: Handles TTS API calls, caching coordination, and audio queue management.
- **Content Extractor**: Identifies and extracts readable text from web pages using heuristic scoring.
- **Highlight Manager**: Applies and clears paragraph and word highlighting via CSS Custom Highlight API.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No JavaScript file in the codebase exceeds 300 lines (excluding tests).
- **SC-002**: All existing unit tests pass without modification (except import path changes).
- **SC-003**: A developer can write a unit test for any module by importing only that module and its direct dependencies.
- **SC-004**: Module dependency graph has no cycles (verifiable via static analysis).
- **SC-005**: Code duplication is reduced by at least 20% measured by duplicate line detection tools.
- **SC-006**: New developer can identify the correct file to modify for any bug report within 5 minutes.
- **SC-007**: Extension maintains identical functionality as verified by manual testing of all playback features.
- **SC-008**: Total codebase size does not increase by more than 10% (accounting for new module boilerplate).

## Assumptions

- The existing test suite adequately covers core functionality and will catch regressions.
- ES2022+ module syntax is fully supported in Firefox WebExtension Manifest V3.
- The team prefers internal refactoring over adding external dependencies for this effort.
- Breaking changes to internal APIs are acceptable as long as external behavior remains unchanged.
- No new user-facing features are added as part of this refactor.

## Constraints & Tradeoffs

- **Refactoring Strategy**: Gradual file-by-file approach - split one file at a time, validate all tests pass after each split before proceeding. This reduces risk and enables easier rollback compared to big-bang refactoring.
- **Validation Tooling**: Lightweight static analysis via npm scripts (e.g., circular dependency detection, duplicate code detection) without introducing a bundler or complex build system.

## Clarifications

### Session 2025-12-31

- Q: What refactoring strategy should be used (big-bang, gradual, or parallel)? → A: Gradual - split one file at a time, validate tests after each.
- Q: What validation tooling approach should be used? → A: Lightweight static analysis scripts (npm run lint, check-cycles) without bundler.
