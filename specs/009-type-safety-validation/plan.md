# Implementation Plan: Type Safety & Import/Export Validation

**Branch**: `009-type-safety-validation` | **Date**: 2025-12-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-type-safety-validation/spec.md`

## Summary

Add static analysis to detect ES module import/export mismatches at test time, preventing runtime errors like the Feature 008 bug where `popup-ui.js` imported `setVisualizerState` from a module that exports it as `setState`. The solution uses `eslint-plugin-import-x` with flat config, integrated into the existing `npm test` workflow.

## Technical Context

**Language/Version**: JavaScript ES2022+ (WebExtension Manifest V3)
**Primary Dependencies**: eslint, eslint-plugin-import-x, zod (optional for P3 message validation)
**Storage**: N/A (dev-time only)
**Testing**: Jest 29.x (existing), ESLint (added)
**Target Platform**: Node.js 18+ (dev environment), Firefox 109+ (runtime)
**Project Type**: Browser extension (background, content, popup scripts)
**Performance Goals**: Validation completes in <5 seconds
**Constraints**: No changes to production code or manifest.json
**Scale/Scope**: ~30 JS files, ~7,000 lines of code

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Privacy First | PASS | No data transmission; dev-time only tooling |
| II. Security by Default | PASS | Static analysis improves security posture |
| III. User Experience Excellence | N/A | Dev tooling, not user-facing |
| IV. Modular Architecture | PASS | ESLint validates module boundaries |
| V. Test Coverage for Critical Paths | PASS | Adds validation layer to catch import bugs |

**Quality Gates:**
- Manifest validation: N/A (no manifest changes)
- No console errors: N/A (dev tooling)
- Permission justification: N/A (no new permissions)
- Storage migration: N/A (no storage changes)

**All gates pass. Proceeding to implementation.**

## Project Structure

### Documentation (this feature)

```text
specs/009-type-safety-validation/
├── plan.md              # This file
├── research.md          # Tooling research
├── data-model.md        # N/A (no data model)
├── quickstart.md        # Setup guide
├── contracts/           # N/A (no API contracts)
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
# Existing structure - no new source directories
background/
content/
popup/
shared/
tests/

# New/modified files
eslint.config.js          # NEW: Flat config for ESLint
package.json              # MODIFIED: Add eslint scripts, dependencies
.eslintignore             # NEW: Ignore patterns

# Optional for P3 (message validation)
shared/message-schemas.js # NEW: Zod schemas for message types
```

**Structure Decision**: No new directories. ESLint configuration added at repository root. P3 message schemas go in existing `shared/` directory.

## Complexity Tracking

No constitution violations. Standard ESLint integration with no additional complexity.

## Implementation Approach

### Phase 1: ESLint Import Validation (P1)

1. Install `eslint` and `eslint-plugin-import-x`
2. Create `eslint.config.js` with flat config format
3. Configure `import-x/named` rule to catch export mismatches
4. Update `package.json` to run ESLint before Jest
5. Verify the Feature 008 bug would be caught

### Phase 2: Enhanced Error Messages (P1)

ESLint's default error messages already include:
- File path
- Line number
- Missing export name
- Target module path

If needed, add custom ESLint formatter for more context.

### Phase 3: Workflow Integration (P2)

1. Add `npm run lint` script
2. Modify `npm test` to run lint first
3. Add `npm run lint:fix` for auto-fixes
4. Verify pre-commit hook compatibility (if any)

### Phase 4: Message Contract Validation (P3 - Optional)

1. Install Zod
2. Define message schemas in `shared/message-schemas.js`
3. Add runtime validation in development mode
4. Add build-time schema verification

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| False positives on valid imports | Low | Medium | Careful resolver configuration |
| Slow lint on large files | Low | Low | ESLint caching enabled |
| WebExtension API confusion | Medium | Low | Ignore `browser` global |
| Content script namespace pattern | Medium | Low | Exclude files without ES imports |

## Dependencies

- **eslint**: ^8.0.0 or ^9.0.0 (flat config)
- **eslint-plugin-import-x**: ^4.0.0
- **zod**: ^3.0.0 (optional, P3 only)

## Success Verification

After implementation, this command should fail:

```bash
# Introduce intentional bug
echo "import { nonExistent } from './visualizer.js';" >> popup/popup-ui.js

# This should fail with clear error
npm run lint
# Expected: 'nonExistent' not found in './visualizer.js'

# Revert
git checkout popup/popup-ui.js
```
