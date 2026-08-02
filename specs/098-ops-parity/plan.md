# Implementation Plan: Operational Parity Bootstrap

**Branch**: `098-ops-parity` | **Date**: 02/08/2026 | **Spec**: `spec.md`
**Input**: Reconciled Product, Engineer, and Quality receipts under `/tmp/proso-ops-*-audit-result.md`.

## Summary

Land the smallest verified delivery repair: make `smoke-server-boot` build the
server's existing workspace dependency graph. Track the broader operational-parity
matrix and product boundaries as reviewable SpecKit evidence, while deferring every
workflow, public-policy, external-service, and sync mutation.

## Technical Context

**Language/Version**: GNU Make recipe; pnpm 10.13.1 workspace; TypeScript 5.9.3
**Primary Dependencies**: Existing pnpm recursive filter semantics
**Storage**: N/A
**Testing**: Existing `scripts/smoke-server-boot.mjs`, Make/docs static checks
**Target Platform**: Linux development host and CI-compatible workspace checkout
**Project Type**: pnpm monorepo with Firefox extension and NestJS server
**Performance Goals**: No new build phase beyond the required shared dependency
**Constraints**: One-line implementation; no workflows, packages, runtime, Notes, or sync
**Scale/Scope**: One Make target plus tracked SpecKit audit artifacts

## Constitution Check

- **User outcomes first**: PASS. The smoke observer proves a real built server HTTP
  outcome, not a unit-only surrogate.
- **Root cause**: PASS. The missing workspace dependency edge is repaired once at the
  documented target instead of adding manual pre-steps to callers.
- **Framework boundaries**: PASS. No package or architecture layer changes.
- **Privacy**: PASS for this slice. No user data, secrets, browser evidence, runtime
  routing, public copy, or telemetry behavior changes.
- **Fail closed**: PASS. RED is retained; missing build output or a failed smoke stays
  non-zero.
- **Worktree/ownership**: PASS. Engineer owns the isolated 098 worktree; Product and
  Quality review exact HEAD; Orchestrator is the owner-map/spec writer.
- **Cross-family review**: REQUIRED before merge.

## Hypothesis Verification

**Hypothesis**: `smoke-server-boot` fails in a fresh worktree because it builds only
`@proso/server`, whose imports resolve through unbuilt `@proso/shared/dist`; selecting
`@proso/server...` builds the existing dependency first and fixes the actual failure.

**Falsifier**: The clean command already passes without shared output, the recursive
filter does not select `@proso/shared`, shared output remains absent, module resolution
still fails, or a package/runtime/workflow change is needed.

## Project Structure

```text
Makefile
specs/098-ops-parity/
├── spec.md
├── plan.md
├── research.md
├── quickstart.md
├── tasks.md
└── checklists/requirements.md
```

**Structure Decision**: Reuse the existing root Make delivery surface and tracked
SpecKit directory. No new framework, dependency, scanner, service, or docs sink.

## Delivery Sequence

1. Orchestrator publishes the feature and assignment in the tracked owner map.
2. Engineer records clean RED, applies the dependency-aware filter, and records GREEN.
3. Product reviews privacy/vault/retention/accessibility boundaries without editing the
   implementation.
4. Quality validates the exact-head negative control and confirms no workflow/browser
   scope expansion.
5. A different-family review and required checks gate the safe squash merge.

## Complexity Tracking

No constitution violation is accepted. Broader security/scanner/governance gaps are
split into later independently reversible features rather than bundled here.
