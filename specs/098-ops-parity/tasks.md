# Tasks: Operational Parity Bootstrap

**Input**: `spec.md`, `plan.md`, `research.md`
**Ownership**: Orchestrator writes spec/owner map; Engineer alone implements;
Product and Quality review exact HEAD.

## Phase 1: Audited foundation

- [x] T001 Read DeliCasa references and classify Proso controls with evidence and falsifiers.
- [x] T002 Capture Product, Engineer, and Quality receipts without repository mutation.
- [x] T003 Emit `OPS-PARITY-AUDITED` before creating this worktree.
- [ ] T004 Publish 098 ownership and role assignments in the tracked owner map on PR #83.

## Phase 2: User Story 1 — Clean server bootstrap (P1)

- [x] T005 [US1] Engineer: confirm `packages/shared/dist/index.js` is absent in the fresh 098 worktree.
- [x] T006 [US1] Engineer: retain RED from `nix shell nixpkgs#gnumake --command make smoke-server-boot` showing shared module resolution failure.
- [x] T007 [US1] Engineer: change only the server build recipe in `Makefile` to the dependency-aware `@proso/server...` filter.
- [x] T008 [US1] Engineer: replay the clean command and retain GREEN showing shared then server build and an observed HTTP response.
- [x] T009 [US1] Engineer: run `git diff --check`, `make docs`, and focused static/Make checks without modifying workflows or packages.

## Phase 3: Exact-HEAD specialist review

- [ ] T010 [US2] Product: verify P0–P3 classes, default-deny vault audience, zero-telemetry current contract, cache/retention decisions, and public Firefox oracles at exact HEAD.
- [ ] T011 [US3] Quality: validate the RED/GREEN falsifier, confirm only the expected pnpm workspaces build, and confirm no workflow/browser/sync scope expansion.
- [ ] T012 Orchestrator: obtain a different-family exact-diff review with no unresolved BLOCKER/MAJOR finding.
- [ ] T013 Orchestrator: verify required checks, squash-merge the safe PR, and emit `OPS-PARITY-SLICE-MERGED` with one-line revert.

## Independent follow-ups — not part of this PR

- [ ] T014 Quality feature: durable evidence manifest/retention/quarantine contract.
- [ ] T015 Product/Quality feature: root security, threat, secret-metadata, and retention/deletion baseline.
- [ ] T016 Quality feature: pinned Semgrep OSS negative controls.
- [ ] T017 Quality feature: fail-closed local CodeQL SARIF severity ratchet.
- [ ] T018 Quality feature: changed-code complexity/function/file/performance budgets.
- [ ] T019 Orchestrator feature: canonical AGENTS/CLAUDE drift guard and atomic/stale-aware owner contract.
- [ ] T020 `[pending] Pedro`: isolate workflow/Sonar/action-pin hardening for explicit authorization.
- [ ] T021 `[pending] Pedro`: approve any Notes mutation, public docs sink, token/service/repo, or sync activation.
