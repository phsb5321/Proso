# Repository Health Baseline

**Feature Branch**: `047-architecture-ui-polish`
**Captured**: 2026-01-20

This document captures the repository health status before any changes. All changes must maintain or improve these metrics.

---

## Environment

| Component | Version |
|-----------|---------|
| Node.js | v22.21.1 |
| npm | 10.9.4 |
| pnpm | 10.28.0 |
| WXT | 0.20.13 |
| TypeScript | 5.x (strict mode) |

---

## Build Status

**Command**: `npm run build:firefox`
**Status**: PASS

| Metric | Value |
|--------|-------|
| Build Time | ~5.0s |
| Total Output Size | 924.74 kB |

### Output Files

| File | Size |
|------|------|
| background.js | 493.23 kB |
| content-scripts/content.js | 165.28 kB |
| chunks/tracker-CvzY0fqH.js | 71.96 kB |
| assets/settings-BDPqyuhf.css | 37.19 kB |
| chunks/settings-DaGvwpIB.js | 30.79 kB |
| assets/popup-xiOkcl19.css | 20.37 kB |
| popup.html | 19.61 kB |
| chunks/popup-DJQCESox.js | 18.8 kB |

---

## Test Status

**Command**: `npm test`
**Status**: PASS

| Metric | Count |
|--------|-------|
| Test Suites | 51 total |
| Tests | 1084 total |
| Passing | 934 |
| Skipped | 150 |
| Failed | 0 |

### Test Projects

- unit: Unit tests
- contract: API contract tests
- integration: Integration tests
- security: Security tests
- regression: Regression tests

---

## Type Check Status

**Command**: `npm run typecheck` (tsc --noEmit)
**Status**: PASS (no errors)

---

## Lint Status

**Command**: `npm run lint` (biome lint .)
**Status**: PASS

| Metric | Value |
|--------|-------|
| Files Checked | 187 |
| Time | 50ms |
| Fixes Applied | 0 |

---

## Quality Gates

| Gate | Status | Threshold |
|------|--------|-----------|
| Build | PASS | No errors |
| TypeCheck | PASS | No errors |
| Lint | PASS | No errors |
| Tests | PASS | 0 failures |
| Coverage | N/A | 70% stmt / 60% branch |

---

## Notes

- 150 tests are skipped for legacy API compatibility (JavaScript message-schemas.js vs TypeScript @webext-core/messaging)
- All quality gates pass - changes must maintain these results
