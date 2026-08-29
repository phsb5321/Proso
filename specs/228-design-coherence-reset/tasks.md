# Tasks — Feature 228 deliberate popup design

## Phase 1 — Research and contract

- [x] T001 [US1] Capture current built popup and source marketing page under `specs/228-design-coherence-reset/evidence/` with hashes.
- [x] T002 [US1] Audit current palette/type/effects/IA and relevant design history in `research.md`.
- [x] T003 [US1] Research generated-interface signals, reader competitors, Firefox popup guidance, WCAG media controls, and durable design systems through SearXNG-first public research.
- [x] T004 [US1] Record accepted/rejected skeptical-review findings, including the no-telemetry constitutional boundary.
- [x] T005 [US1] Define independently testable popup outcomes in `spec.md` and `contracts/popup-visual-contract.md`.

## Phase 2 — Falsifiers before implementation

- [x] T006 [US1] Add a built-popup visual test that asserts current Player state surfaces and captures light/dark baselines.
- [x] T007 [US2] Add first-run assertions/capture covering both routes, destination copy, and transport focus exclusion.
- [x] T008 [US3] Add built-popup tab/tabpanel assertions plus Tools and long-title Queue fixtures; retain the production-controller Jest suite as the Arrow/Home/End authority.
- [x] T009 [US4] Add permission-repair and populated/exhausted cost/credit fixtures; require text/icon semantics independent from brand color.
- [x] T010 [US1] Prove pre-fix plants: forbidden gradient/glow/filter/hover-scale, invalid color pairing, identical light/dark roles, missing status/speed/Queue/focus, and viewport-relative intrinsic sizing all fail closed (the latter through both a static/provisional-viewport assertion and the real Firefox visible-panel check).

## Phase 3 — Brand roles and subtraction

- [x] T011 [US1] Add additive role tokens and an executable allowed foreground/surface pair matrix to `packages/extension/src/styles/tokens.css`, then explicitly load them from the popup entrypoint.
- [x] T012 [US4] Remove hidden AI Summary markup from `popup/index.html`.
- [x] T013 [US4] Remove summary-only element references/runtime hide logic from `popup/main.ts` and summary-only rules from `popup/style.css`.
- [x] T014 [US1] Mark the play/pause control as the sole state-dependent primary transport without changing its ID/name/handler.

## Phase 4 — Popup visual implementation

- [x] T015 [US1] Refactor popup base/header/tab/status/progress/transport/speed/footer rules to the hierarchy-first role contract.
- [x] T016 [US2] Refactor first-run route layout while preserving both forms, status regions, destination copy, and focus behavior.
- [x] T017 [US3] Refactor Tools/Queue/highlighting surfaces with direct tab access and bounded containers only where required.
- [x] T018 [US4] Refactor permission recovery, cost, credits, success/warning/error states without hiding factual state.
- [x] T019 [US1] Implement light/dark divergence, contrast-safe focus, fixed 360px Firefox intrinsic sizing, 200% browser-zoom parity, and reduced-motion behavior; remove all forbidden gradient/glow/filter/scale effects from popup CSS and built JS.

## Phase 5 — Verification

- [x] T020 [US1] Run popup visual controls for player light/dark, real-viewport and full-content first-run, focus, permission, Queue, and account states; create only the minimum popup-specific reviewed baselines where pixels add evidence beyond DOM/style assertions.
- [x] T021 [US1] Re-run every plant, including intrinsic-width and rendered-contrast regressions; each must fail for its named reason, then restore a clean tree and green control.
- [x] T022 [US1] Run focused popup/accessibility tests and the full extension unit baseline with bounded workers after the saturated-host replay; make the exposed cross-paragraph ordering checks scheduler-independent and give the real 3s retry-backoff test a bounded 10s ceiling.
- [x] T023 [US1] Run Firefox/Chrome/Edge builds, seeded fuzz (`FC_SEED=20260828`, `FC_NUM_RUNS=2000`), serialized `make verify-full`, and quality/security/dependency gates.
- [x] T024 [US1] Run the loaded-Firefox real-host public actor; require decoded playback, visible highlight, working tab policy, and zero managed synthesis calls.
- [x] T025 [US1] Obtain different-family exact-head reviews; repair every grounded hierarchy, contrast, provenance, effect-sweep, and seek hit-testing finding, prove the associated plants, and rerun affected gates.

## Phase 6 — Delivery

- [ ] T026 Commit atomically with conventional subjects, push, open the PR, and attach current/replacement captures plus plant receipts.
- [ ] T027 Poll all available checks; require review-clean state and no unresolved finding.
- [ ] T028 Squash-merge the safe one-service change, confirm `state=MERGED`, delete branch/worktree, and record one-line revert.
- [ ] T029 Create/complete the mapped Plane facelift popup item and update the durable Proso save-state with the remaining settings/footer/site roadmap.

## Dependencies

- T006–T010 depend on T001–T005.
- T011–T019 depend on the red falsifiers T006–T010.
- T020–T025 depend on implementation T011–T019.
- T026–T029 depend on every verification task.

## Stop conditions

- A missing browser/build/selector is BLOCKED, never skipped green.
- Do not regenerate settings/footer/site baselines.
- Do not weaken a visual/accessibility/behavior threshold to accept the redesign.
- Do not merge if speed, Queue, Tools, first-run route, permission recovery, cost/credits, or public playback behavior regresses.
- Do not touch site deployment, DNS, or any Pedro-gated infrastructure in this feature.
