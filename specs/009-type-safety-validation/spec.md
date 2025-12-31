# Feature Specification: Type Safety & Import/Export Validation

**Feature Branch**: `009-type-safety-validation`
**Created**: 2025-12-31
**Status**: Draft
**Input**: User description: "I need strong typing and maybe use zod or something to get this kind of error on testing or something like that"

## Problem Statement

During Feature 008 (Architecture Refactor), a runtime error broke the entire extension:

```
Uncaught SyntaxError: The requested module 'moz-extension://...popup/components/visualizer.js'
doesn't provide an export named: 'setVisualizerState'
```

The issue: `popup-ui.js` imported `setVisualizerState` directly, but `visualizer.js` exports it as `setState`. This mismatch was not caught during:
- Jest unit tests (153 passed)
- ESLint linting
- Circular dependency checks (madge)
- Manual code review

The goal is to catch such import/export mismatches at test time, not at runtime in the browser.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer Catches Export Mismatches Before Deployment (Priority: P1)

As a developer, when I import a non-existent export from a module, the test suite should fail immediately with a clear error message indicating which export is missing from which file.

**Why this priority**: This directly addresses the bug that broke the extension. Import/export mismatches are the most common source of ES module errors.

**Independent Test**: Run `npm test` after introducing an intentional import mismatch. The test should fail with a clear error pointing to the exact file and missing export.

**Acceptance Scenarios**:

1. **Given** a file imports `{ foo }` from `./module.js`, **When** `module.js` only exports `{ bar }`, **Then** `npm test` fails with error: "Module './module.js' does not export 'foo'"
2. **Given** a file imports `{ setState as setVisualizerState }` from `./visualizer.js`, **When** `visualizer.js` exports `{ setState }`, **Then** `npm test` passes (alias is valid)
3. **Given** all imports match their exports, **When** `npm test` runs, **Then** all tests pass with no import validation warnings

---

### User Story 2 - Developer Gets Clear Error Messages (Priority: P1)

As a developer, when an import/export mismatch is detected, I should see:
- The exact file with the bad import
- The exact module being imported from
- The specific export name that doesn't exist
- A list of available exports from that module

**Why this priority**: Developer experience is critical. A cryptic error message provides no value.

**Independent Test**: Introduce a bad import and verify the error output contains all required information.

**Acceptance Scenarios**:

1. **Given** `popup-ui.js` imports `{ nonExistent }` from `./components/visualizer.js`, **When** validation runs, **Then** output shows:
   - File: `popup/popup-ui.js`
   - Module: `./components/visualizer.js`
   - Missing: `nonExistent`
   - Available: `setState`, `stopAnimation`, `initVisualizer`

---

### User Story 3 - Validation Integrates with Existing Workflow (Priority: P2)

As a developer, the import/export validation should run as part of `npm test` without requiring separate commands or configuration.

**Why this priority**: If validation requires extra steps, developers will skip it.

**Independent Test**: Run `npm test` and verify import validation runs automatically.

**Acceptance Scenarios**:

1. **Given** the test suite is configured, **When** `npm test` runs, **Then** import validation runs before unit tests
2. **Given** import validation fails, **When** `npm test` runs, **Then** tests abort early with clear failure message
3. **Given** import validation passes, **When** `npm test` runs, **Then** unit tests execute normally

---

### User Story 4 - Message Contract Validation (Priority: P3)

As a developer, when I send a message to the background script, I want type checking to ensure the message structure is valid.

**Why this priority**: Message passing is a major source of runtime errors in extensions, but less critical than import/export validation.

**Independent Test**: Define a message schema and verify invalid messages are caught at test time.

**Acceptance Scenarios**:

1. **Given** a message type `play` requires `{ provider: string, voice: string }`, **When** code sends `{ provider: 123 }`, **Then** type checking fails
2. **Given** message schemas are defined, **When** `npm test` runs, **Then** all message usages are validated against schemas

---

### Edge Cases

- What happens when a module has no exports?
- How does the system handle dynamic imports (`import()`)?
- What about re-exports (`export { foo } from './other.js'`)?
- How are circular dependencies with valid exports handled?
- What about namespace imports (`import * as utils from './utils.js'`)?
- How are default exports validated?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect import statements that reference non-existent exports
- **FR-002**: System MUST run import validation as part of the existing `npm test` command
- **FR-003**: System MUST provide error messages that include: source file, target module, missing export name, available exports
- **FR-004**: System MUST support ES module syntax (`import`, `export`, `export default`)
- **FR-005**: System MUST support aliased imports (`import { foo as bar }`)
- **FR-006**: System MUST support re-exports (`export { foo } from './other.js'`)
- **FR-007**: System MUST handle the content script namespace pattern (`window.VoxPage = { ... }`) - may skip validation for these non-ES-module files
- **FR-008**: System SHOULD validate message contracts using schema validation (Zod or similar)
- **FR-009**: System MUST NOT require changes to production code (validation is dev-time only)
- **FR-010**: System MUST support both absolute and relative import paths

### Key Entities

- **ModuleExport**: An export declaration from a JavaScript module (name, type: named/default/re-export)
- **ModuleImport**: An import declaration in a JavaScript module (source file, target module, imported names, aliases)
- **ImportMismatch**: A detected error where an import references a non-existent export
- **MessageSchema**: A Zod/runtime schema defining the structure of a message type

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Import/export mismatches are detected with 100% accuracy for ES module files
- **SC-002**: Error messages include all required information (file, module, missing export, available exports)
- **SC-003**: Validation completes in under 5 seconds for the entire codebase
- **SC-004**: Zero false positives for valid import statements
- **SC-005**: The bug from Feature 008 (`setVisualizerState` vs `setState`) would have been caught
- **SC-006**: No changes required to production code or manifest.json

## Assumptions

- All modules use ES module syntax (except content scripts using namespace pattern)
- Jest is the test runner
- Node.js 18+ is available for development
- Dynamic imports are rare and may not be fully validated

## Out of Scope

- TypeScript migration (this uses JavaScript with JSDoc)
- Runtime type checking in production
- Type checking for all JavaScript code (focusing on imports/exports and messages)
- IDE integration (though ESLint rules may provide IDE support as a side effect)
