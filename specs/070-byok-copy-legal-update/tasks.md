# Tasks: BYOK Legal & Marketing Copy Update

**Feature**: 070-byok-copy-legal-update
**Branch**: `070-byok-copy-legal-update`
**Created**: 2026-03-01

## Phase 1: Setup

> No setup needed — this is a copy-only feature with no dependencies, build steps, or new files.

## Phase 2: Legal Documents (P1 — User Story 1)

> **Goal**: Fix all false BYOK claims in the primary legal Terms of Service.
> **Independent Test**: Search `packages/legal/terms.html` for "never leave", "never transmitted", "directly" — zero results.

- [X] T001 [US1] Update BYOK definition in Section 2 of `packages/legal/terms.html` (line 109-110)
- [X] T002 [US1] Update BYOK bullet in Section 3 of `packages/legal/terms.html` (line 137)
- [X] T003 [US1] Update Section 9 intro paragraph in `packages/legal/terms.html` (line 324)
- [X] T004 [US1] Rewrite Section 9 "Local Storage" subsection to "Key Handling" in `packages/legal/terms.html` (lines 329-330)
- [X] T005 [US1] Update Section 9 Liability paragraph in `packages/legal/terms.html` (lines 340-341)
- [X] T006 [US1] Update Section 14 Privacy BYOK bullet in `packages/legal/terms.html` (line 488)

## Phase 3: Privacy Policy & Marketing (P2 — User Stories 2 & 3)

> **Goal**: Fix false claims in privacy policy and pricing/marketing pages.
> **Independent Test**: Search `packages/site/privacy.html` and `packages/site/pricing.html` for "never transmitted", "never sent", "keys stay", "never sees", "does not proxy" — zero results.

- [X] T007 [P] [US3] Update API keys bullet in Extension Data section of `packages/site/privacy.html` (line 59)
- [X] T008 [P] [US3] Rewrite "Data Sent to TTS Providers" section in `packages/site/privacy.html` (lines 64-65)
- [X] T009 [US3] Update BYOK users paragraph in Your Rights section of `packages/site/privacy.html` (line 97)
- [X] T010 [P] [US2] Update BYOK callout box in `packages/site/pricing.html` (line 162)
- [X] T011 [P] [US2] Update FAQ "Can I use my own API keys?" in `packages/site/pricing.html` (line 188)

## Phase 4: Site Terms & Landing Page (P3 — User Stories 4 & 2)

> **Goal**: Fix false claim in simplified site terms and clarify landing page.
> **Independent Test**: Search `packages/site/terms.html` and `packages/site/index.html` for "never transmitted" — zero results.

- [X] T012 [US4] Update Section 7 API Keys paragraph in `packages/site/terms.html` (line 143)
- [X] T013 [US2] Clarify privacy features paragraph in `packages/site/index.html` (line 217)

## Phase 5: Verification (P3 — User Story 5)

> **Goal**: Confirm zero false claims remain across all files.
> **Independent Test**: All grep patterns return zero results.

- [X] T014 [US5] Run verification grep for all false claim patterns across `packages/site/` and `packages/legal/`
- [X] T015 [US5] Cross-check BYOK definition consistency across all 5 updated documents

## Dependencies

```
T001-T006 (Phase 2) → independent, sequential (same file)
T007-T009 (Phase 3, privacy) → T007/T008 parallel, T009 sequential after
T010-T011 (Phase 3, pricing) → parallel with T007-T009 (different files)
T012-T013 (Phase 4) → parallel (different files), after Phase 3
T014-T015 (Phase 5) → after all other phases complete
```

## Implementation Strategy

1. **Phase 2 first** (P1 priority): Fix the legal terms — highest legal liability
2. **Phase 3 parallel**: Privacy policy and pricing page edits can run simultaneously (different files)
3. **Phase 4**: Site terms and landing page (lower priority, fewer edits)
4. **Phase 5**: Full verification sweep to confirm SC-001 (zero false claims)

**MVP**: Phases 2-3 (legal terms + privacy + pricing = eliminates all critical/high false claims)
**Total**: 15 tasks, ~14 text edits across 5 HTML files
