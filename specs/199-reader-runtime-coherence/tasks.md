# Feature 199 — Tasks

## Phase 1 — Executable red evidence

- [ ] T001 Record the sanitized daily-runtime receipt in `specs/199-reader-runtime-coherence/research.md`: one current model identity, 22 obsolete player landmarks, `1/56` versus `0/56`, one unhandled unsupported-glyph 500, four concurrent local requests, and the old oracle's false-green scope.
- [ ] T002 Add focused regressions for document-level footer idempotence, stale nested word-wrapper cleanup, exact text preservation, cross-reload padding restoration, and N minimize/expand cycles without padding growth.
- [ ] T003 Add actual-popup-entrypoint regressions proving all three panels, roving keyboard focus, and one pending Play dispatch despite repeated activation.
- [ ] T004 Add playback regressions proving a chunked generator never starts generic paragraph prefetch and a synthesis error clears old highlighting before showing recovery.
- [ ] T005 Add adapter/contract regressions for unsupported structural text while retaining the existing provider-mark path unchanged; do not add the rejected candidate's unused wire protocol.

## Phase 2 — Page and popup coherence

- [ ] T006 Implement Proso-owned stale artifact reconciliation before current content managers initialize; keep it idempotent and text-preserving.
- [ ] T007 Make footer document ownership and body padding durable across extension contexts; fix the user-facing one-based position.
- [ ] T008 Make popup Play enter a real bounded loading state, suppress duplicate starts, preserve Stop, and converge from authoritative background state.
- [ ] T009 Replace copied tab-test behavior with the production popup tab controller and complete click/keyboard semantics.

## Phase 3 — Playback and timing

- [ ] T010 Disable generic lookahead prefetch start/resume for chunked generators while preserving queue cleanup and every non-chunked provider path.
- [ ] T011 Clear stale paragraph/word state on playback failure before displaying one actionable error.
- [ ] T012 Implement Unicode/punctuation-aware approximate timings that ignore structural-only sentences/tokens and publish provider-versus-estimated basis dynamically to the popup.
- [x] T013 Record the verified exact-device rejection: Kokoro-FastAPI `26eec068` required PT-BR probe returned valid audio at RTF 0.23825 but `timestamps: null`; simple PT-BR returned six marks; ROCm was blocked after two attempts. Keep the marked local-host protocol deferred and the fallback approximate.
- [ ] T014 In a separately verified runtime patch outside this repository, harden the transient current Supertonic bridge against its loaded model's unsupported characters and typed-error boundary; retain a reproducible loopback receipt without persistence or cross-repo completion claims.

## Phase 4 — Public browser gate

- [ ] T015 Extend the loaded-Firefox public actor to operate Player, Tools, and Queue by role/name plus arrow/Home/End keys, asserting exactly one visible panel and unchanged playback.
- [ ] T016 Add a 22-root/nested-wrapper legacy fixture in each long-lived tab, the held-start and bounded-request journey, one-player assertion, unsupported-glyph case, approximate-timing disclosure, popup state reconciliation, Queue add/remove, both browser-tab policy modes, and post-deploy AT-SPI checks on the real daily tabs.
- [ ] T017 Add deterministic actual-entrypoint regressions for duplicate/stale-start races and browser plants for stale cleanup, chunk request bounds, dynamic approximate disclosure, Tools reachability, and Queue reachability; a surviving plant fails the gate.
- [ ] T018 Add `scripts/oracles/reader-runtime-coherence` as the fail-closed fleet done-oracle and update `docs/reading-journey-status.md` with evidence boundaries.

## Phase 5 — Delivery

- [ ] T019 Run focused checks, `FC_SEED=20260823 FC_NUM_RUNS=2000 make fuzz`, public browser gate/plants, real current-model journey, and `make verify-full`; retain the first red and final green receipts.
- [ ] T020 Commit atomic slices, run an exact-head different-family adversarial panel, resolve every finding, push, open the PR, poll required CI to green, squash-merge, and confirm `state=MERGED`.
- [ ] T021 Atomically deploy the reviewed Firefox XPI, verify the daily model/listener plus all three popup panels and both real dbt browser tabs, store the XPI/storage rollback receipt, and verify the fleet oracle.
- [ ] T022 Remove the feature worktree, dependency symlinks, and merged branches; confirm shared `main` is clean and synchronized.
