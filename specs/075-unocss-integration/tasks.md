# Tasks: UnoCSS Integration for Extension Styling

**Input**: Design documents from `/specs/075-unocss-integration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/build-output.md, quickstart.md

**Tests**: Not explicitly requested in spec. Verification is via build output contracts (contracts/build-output.md) and manual validation commands.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

All paths relative to `packages/extension/` unless otherwise noted.

---

## Phase 1: Setup (Package Installation)

**Purpose**: Install UnoCSS dependencies and prepare the project

- [X] T001 Install core UnoCSS packages: run `pnpm --filter @proso/extension add -D unocss @wxt-dev/unocss @unocss/preset-rem-to-px` (modifies `packages/extension/package.json`)
- [X] T002 Install icon collection: run `pnpm --filter @proso/extension add -D @iconify-json/lucide` (modifies `packages/extension/package.json`)

---

## Phase 2: Foundational (UnoCSS Configuration — Blocks All User Stories)

**Purpose**: Create the UnoCSS config and register the WXT module. ALL user stories depend on this phase.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Create UnoCSS configuration file at `packages/extension/uno.config.ts` with presetWind3, presetRemToPx, presetIcons (lucide, scale 1.2), and transformerDirectives — per quickstart.md template
- [X] T004 Add complete design token theme mapping in `packages/extension/uno.config.ts`: colors (bg, text, accent, success, warning, error, info, border, focus, button, input, disabled, overlay), spacing (xs thru 3xl), fontSize (xs thru xl), fontWeight, lineHeight, borderRadius, boxShadow, fontFamily, zIndex — per data-model.md Design Token Contract table
- [X] T005 Add custom rules in `packages/extension/uno.config.ts`: bg-accent-gradient, min-h-touch, w-popup, transition-proso, transition-colors-proso — per quickstart.md
- [X] T006 Add shortcuts in `packages/extension/uno.config.ts`: proso-flex-col, proso-flex-center, proso-flex-between — per quickstart.md
- [X] T007 Add content pipeline config in `packages/extension/uno.config.ts`: include HTML files and `src/**/*.ts` for class scanning — per research.md RQ-5
- [X] T008 Register UnoCSS WXT module in `packages/extension/wxt.config.ts`: add `modules: ['@wxt-dev/unocss']` and `unocss: { excludeEntrypoints: ['background', 'content'] }` — do NOT add UnoCSS to the vite() function (the module handles injection per research.md RQ-1)
- [X] T009 Verify `packages/extension/uno.config.ts` passes Biome lint (`pnpm --filter @proso/extension lint`) and TypeScript check (`pnpm --filter @proso/extension exec tsc --noEmit`) — per research.md RQ-12

**Checkpoint**: UnoCSS build infrastructure is ready. `pnpm --filter @proso/extension build` should succeed (even though no entrypoints import `virtual:uno.css` yet).

---

## Phase 3: User Story 1 — Developer Styles Popup UI Components (Priority: P1) MVP

**Goal**: Enable utility classes in popup and options page entrypoints with design token integration. Developers can style popup and settings page elements using utility classes without writing new CSS rules.

**Independent Test**: Build the extension and verify: (1) `virtual:uno.css` is imported in popup and options, (2) utility classes like `flex items-center gap-sm` produce correct CSS output, (3) design token `var()` references appear in generated CSS, (4) existing UI renders identically.

**Requirements**: FR-001, FR-002, FR-003, FR-007, FR-008, FR-009, FR-010

### Implementation for User Story 1

- [X] T010 [P] [US1] Add `import 'virtual:uno.css'` to `packages/extension/src/entrypoints/popup/main.ts` — add as the first import in the file. Only add the single `virtual:uno.css` import; do NOT restructure existing CSS loading (tokens/components/style are loaded via HTML `<link>` tags in index.html and must stay there for this initial integration). Per research.md RQ-11, the full 4-import migration is optional and deferred.
- [X] T011 [P] [US1] Add `import 'virtual:uno.css'` to `packages/extension/src/entrypoints/options/main.ts` — add as the first import in the file. Only add the single `virtual:uno.css` import; settings.html manages other CSS via `<link>` tags.
- [X] T012 [US1] Build extension with `pnpm --filter @proso/extension build` and verify popup and options entrypoint CSS bundles contain UnoCSS output
- [X] T013 [US1] Add a small proof-of-concept utility class usage in `packages/extension/src/entrypoints/popup/index.html` — e.g., add `class="flex items-center gap-sm"` to one existing element to verify the full pipeline works end-to-end, then revert if preferred (this validates FR-001, FR-002, FR-003, FR-007)
- [X] T014 [US1] Verify `@apply` directive works: temporarily add `@apply flex items-center` to a test rule in `packages/extension/src/entrypoints/popup/style.css`, build, confirm output, then revert (validates FR-010)

**Checkpoint**: Utility classes are available in popup and options pages. Developers can use design-token-backed utility classes in HTML. `@apply` works in CSS files.

---

## Phase 4: User Story 2 — Developer Maintains Content Script Styles (Priority: P2)

**Goal**: Verify content script CSS isolation is maintained. Content script inline CSS injection and hand-written highlighting classes are unaffected by UnoCSS.

**Independent Test**: Build the extension and verify: (1) no `virtual:uno.css` import exists in content.ts, (2) no UnoCSS-generated CSS appears in content script output, (3) content script highlighting styles remain intact, (4) background script has no CSS output.

**Requirements**: FR-004, FR-006

### Implementation for User Story 2

- [X] T015 [P] [US2] Verify content script exclusion: after build, confirm no UnoCSS output in `.output/firefox-mv2/content-scripts/` — run contract verification from `contracts/build-output.md` Contract 1
- [X] T016 [P] [US2] Verify background script exclusion: after build, confirm no CSS files exist for background in `.output/firefox-mv2/` — run contract verification from `contracts/build-output.md` Contract 1
- [X] T017 [US2] Verify `packages/extension/src/entrypoints/content.ts` does NOT contain any `virtual:uno` import (grep check)
- [X] T018 [US2] Verify hand-written content script classes (`.proso-w--active`, `.proso-w--glow`, `.proso-highlight`, `.proso-selectable`, `.proso-play-icon`) still exist unchanged in content script CSS output

**Checkpoint**: Content script and background script are confirmed isolated from UnoCSS. No style leaking into host pages.

---

## Phase 5: User Story 3 — Developer Updates Sticky Footer in Shadow DOM (Priority: P3)

**Goal**: Verify Shadow DOM compatibility. Document WXT issue #1125 limitation and confirm sticky footer isolation is maintained.

**Independent Test**: Build the extension, load in Firefox, navigate to a page, and verify sticky footer renders correctly with no style leaking.

**Requirements**: FR-005

### Implementation for User Story 3

- [X] T019 [US3] Verify sticky footer Shadow DOM isolation is maintained after UnoCSS integration: build extension and confirm footer `getStyles()` inline CSS approach is unaffected
- [X] T020 [US3] Document WXT issue #1125 limitation as a code comment in `packages/extension/uno.config.ts` (brief note about `createShadowRootUi` + `cssInjectionMode: 'ui'` incompatibility with UnoCSS, per research.md RQ-10)

**Checkpoint**: Shadow DOM components are confirmed unaffected. Known limitation is documented.

---

## Phase 6: User Story 4 — Extension Build and Size Verification (Priority: P4)

**Goal**: Verify all build output contracts pass: bundle size, build performance, extension validity, test suite, style isolation, rem-to-px output.

**Independent Test**: Run all verification commands from `contracts/build-output.md` and confirm every contract passes.

**Requirements**: SC-001 thru SC-008, all 8 build output contracts

### Implementation for User Story 4

- [X] T021 [US4] Measure baseline build time before UnoCSS (if not already recorded) and after: run `time pnpm --filter @proso/extension build` — verify increase is ≤50% per Contract 4
- [X] T022 [US4] Measure per-entrypoint CSS bundle sizes: run `wc -c` on popup and options CSS in `.output/firefox-mv2/` — verify increase ≤5 KB per entrypoint per Contract 3
- [X] T023 [US4] Run `web-ext lint` on build output in `packages/extension/.output/firefox-mv2/` — verify no errors per Contract 5
- [X] T024 [US4] Run full existing test suite: `pnpm --filter @proso/extension test:unit` — verify all 2,300+ tests pass per Contract 6
- [X] T025 [US4] Verify rem-to-px output: check generated CSS for standard utility classes (e.g., `p-4` should produce `padding: 16px` not `padding: 1rem`) — per Contract 8
- [X] T026 [US4] Run no-host-page-style-leaking verification: confirm no `virtual:uno` imports in content.ts and no UnoCSS output in content script bundle — per Contract 7

**Checkpoint**: All 8 build output contracts pass. Extension is valid and ready for AMO review.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, IDE setup guidance, known issues

- [X] T027 [P] Add known issues section as comments in `packages/extension/uno.config.ts`: (1) dev mode `uno.css not found` warning is safe to ignore per research.md RQ-13, (2) opacity modifiers don't work with `var()` colors per research.md RQ-4
- [X] T028 [P] Verify quickstart.md accuracy: walk through the quickstart.md steps against the actual implementation and note any discrepancies (read-only — fix in a follow-up if needed)
- [X] T029 Run final full build and test cycle: `pnpm --filter @proso/extension build && pnpm --filter @proso/extension test:unit && pnpm --filter @proso/extension lint`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (packages must be installed) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — core integration, must complete before verification stories
- **US2 (Phase 4)**: Depends on Phase 2 + Phase 3 build — verification of isolation
- **US3 (Phase 5)**: Depends on Phase 2 + Phase 3 build — verification of Shadow DOM
- **US4 (Phase 6)**: Depends on Phase 3 — full build output verification
- **Polish (Phase 7)**: Depends on all prior phases

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only. This is the MVP — delivers the core UnoCSS integration.
- **US2 (P2)**: Depends on US1 build completing (needs a built extension to verify isolation). Can run in parallel with US3.
- **US3 (P3)**: Depends on US1 build completing (needs a built extension to verify Shadow DOM). Can run in parallel with US2.
- **US4 (P4)**: Depends on US1 completing. Can run in parallel with US2/US3 but benefits from running after them (comprehensive verification).

### Within Each User Story

- Implementation tasks are sequential within a story (except those marked [P])
- Verification tasks depend on a successful build

### Parallel Opportunities

- T001 and T002 (Setup): Can run as a single `pnpm add` command or sequentially
- T003 through T007 (Foundational): All modify the same file (`uno.config.ts`), so they are SEQUENTIAL — but can be done in a single editing session
- T010 and T011 (US1 imports): Different files, marked [P] — can run in parallel
- T015, T016 (US2 isolation checks): Different verification targets, marked [P] — can run in parallel
- T027 and T028 (Polish): Different concerns, marked [P] — can run in parallel
- US2 and US3 (Phases 4 and 5): Can run in parallel after US1 build completes

---

## Parallel Example: User Story 1

```bash
# After Phase 2 is complete, launch both entrypoint imports in parallel:
Task: "Add import 'virtual:uno.css' to packages/extension/src/entrypoints/popup/main.ts"
Task: "Add import 'virtual:uno.css' to packages/extension/src/entrypoints/options/main.ts"

# Then build and verify sequentially:
Task: "Build extension and verify UnoCSS output in entrypoint bundles"
```

## Parallel Example: User Story 2 + User Story 3

```bash
# After US1 build completes, launch US2 and US3 verification in parallel:
Task: "Verify content script exclusion from UnoCSS output"
Task: "Verify sticky footer Shadow DOM isolation is maintained"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (install packages)
2. Complete Phase 2: Foundational (create uno.config.ts, register WXT module)
3. Complete Phase 3: User Story 1 (add virtual imports, verify pipeline)
4. **STOP and VALIDATE**: Build succeeds, utility classes work, existing UI unchanged
5. This delivers the core value: developers can now use utility classes

### Incremental Delivery

1. Setup + Foundational → Build infrastructure ready
2. Add US1 → Utility classes available → Validate (MVP!)
3. Add US2 → Content script isolation verified
4. Add US3 → Shadow DOM compatibility verified, limitation documented
5. Add US4 → All build contracts pass → Ready for AMO submission
6. Polish → Documentation, IDE setup, final validation

### Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- T003–T007 all edit `uno.config.ts` — implement as a single coherent editing session
- T008 edits `wxt.config.ts` — must use the `modules` approach, NOT the `vite()` plugins approach
- The spec does not request TDD — verification is via build contracts and manual checks
- Commit after each phase or logical group per git workflow conventions
