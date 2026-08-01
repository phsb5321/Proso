# Tasks: GitHub Pages from Private Monorepo

**Input**: Design documents from `/specs/067-ghpages-private-deploy/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not requested. No test tasks generated.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: US1 - Deploy Site from Private Repo (Priority: P1)

**Goal**: Replace external repo deployment with native GitHub Actions Pages deployment, including auto-update file preservation.

**Independent Test**: Inspect `.github/workflows/deploy-site.yml` — it must use `actions/deploy-pages@v4`, have no reference to `SITE_DEPLOY_TOKEN`/`peaceiris`/`voxpage-site`, and include the gh-pages merge step.

- [x] T001 [US1] Rewrite deploy-site.yml with native GitHub Actions Pages deployment per contract in .github/workflows/deploy-site.yml — replace entire file: remove `peaceiris/actions-gh-pages` and `SITE_DEPLOY_TOKEN`; add `permissions` block (`contents: read`, `pages: write`, `id-token: write`); add `concurrency` group; add `environment: github-pages`; add `repository_dispatch` trigger (type: `release-deployed`); build step merges `packages/site/` at root + `packages/legal/` under `_site/legal/`; fetch `updates.json` and `releases/` from `gh-pages` branch into `_site/`; deploy with `actions/configure-pages@v5` + `actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4`. Reference: `specs/067-ghpages-private-deploy/contracts/deploy-site-workflow.yml`
- [x] T002 [US1] Add repository_dispatch trigger step to release.yml deploy-updates job in .github/workflows/release.yml — after the `git push origin gh-pages` step (line ~351), add a new step that calls `gh api repos/${{ github.repository }}/dispatches -f event_type=release-deployed` to trigger site redeployment with the new release files. Reference: `specs/067-ghpages-private-deploy/contracts/release-trigger.yml`

**Checkpoint**: Workflow files are ready. URL updates must happen before merging to `main`.

---

## Phase 2: US2 - Pages and Assets Load Under /VoxPage/ Path (Priority: P1)

**Goal**: Update all absolute URLs from `voxpage-site` to `VoxPage` so meta tags, sitemap, and SEO references point to the correct deployment URL. Internal asset paths are already relative — no changes needed there.

**Independent Test**: Run `grep -r "voxpage-site" packages/ TERMS_OF_SERVICE.md` — must return zero results. Inspect each HTML file's `og:url` and `canonical` tags for correct `https://phsb5321.github.io/VoxPage/` base.

- [x] T003 [P] [US2] Update meta URLs in packages/site/index.html — replace `voxpage-site` with `VoxPage` in og:url (line 14), canonical (line 22), and JSON-LD url (line 36). Total: 3 occurrences.
- [x] T004 [P] [US2] Update meta URLs in packages/site/pricing.html — replace `voxpage-site` with `VoxPage` in og:url (line 13) and canonical (line 20). Total: 2 occurrences.
- [x] T005 [P] [US2] Update meta URLs in packages/site/privacy.html — replace `voxpage-site` with `VoxPage` in og:url (line 13) and canonical (line 20). Total: 2 occurrences.
- [x] T006 [P] [US2] Update meta URLs in packages/site/terms.html — replace `voxpage-site` with `VoxPage` in og:url (line 13) and canonical (line 20). Total: 2 occurrences.
- [x] T007 [P] [US2] Update all loc entries in packages/site/sitemap.xml — replace `voxpage-site` with `VoxPage` in all 4 `<loc>` URLs (lines 4, 10, 16, 22).
- [x] T008 [P] [US2] Update sitemap URL in packages/site/robots.txt — replace `voxpage-site` with `VoxPage` in Sitemap line (line 4).

**Checkpoint**: All site package URLs point to `https://phsb5321.github.io/VoxPage/`. Assets use relative paths (no changes needed).

---

## Phase 3: US3 - Cross-References Between Marketing and Legal Pages (Priority: P2)

**Goal**: Ensure marketing ↔ legal page cross-references work under the new deployment structure, and documentation files point to the correct URLs.

**Independent Test**: Check that `packages/legal/terms.html` brand link and canonical point to `VoxPage` (not `voxpage-site`). Check that `packages/site/terms.html` link to standalone ToS uses relative `legal/terms.html`. Verify `TERMS_OF_SERVICE.md` and `packages/legal/README.md` reference correct URLs.

- [x] T009 [P] [US3] Update canonical and brand link in packages/legal/terms.html — replace `voxpage-site` with `VoxPage` in canonical (line 9) and brand href (line 18). Total: 2 occurrences. Verify that `../privacy.html` and `../terms.html` relative links remain unchanged (they already resolve correctly from `/VoxPage/legal/`).
- [x] T010 [P] [US3] Update TERMS_OF_SERVICE.md — replace `voxpage-site` with `VoxPage` in the online URL (line 5). Both the display text and href must be updated to `https://phsb5321.github.io/VoxPage/legal/terms.html`.
- [x] T011 [P] [US3] Update deployment references in packages/legal/README.md — replace `phsb5321/voxpage-site` repo reference (line 36) with `phsb5321/VoxPage` and update accessible URL (line 37) from `voxpage-site` to `VoxPage`.

**Checkpoint**: All cross-references between marketing site, legal pages, and repo documentation use correct URLs.

---

## Phase 4: US4 - Remove All References to External Repo (Priority: P2)

**Goal**: Verify zero remaining references to `voxpage-site` or `SITE_DEPLOY_TOKEN` in tracked source files.

**Independent Test**: `grep -r "voxpage-site" --include="*.html" --include="*.yml" --include="*.md" --include="*.xml" --include="*.txt" packages/ .github/ TERMS_OF_SERVICE.md` returns zero results. `grep -r "SITE_DEPLOY_TOKEN" .github/` returns zero results.

- [x] T012 [US4] Run final codebase sweep for `voxpage-site` references — search all tracked files (`.html`, `.yml`, `.md`, `.xml`, `.txt`, `.json`) excluding `.git/` and session log `.txt` files in repo root. If any remaining occurrences found, fix them. Expected: zero results after T001-T011 are complete.
- [x] T013 [US4] Run codebase sweep for `SITE_DEPLOY_TOKEN` references — search `.github/workflows/` and all YAML files. Expected: zero results after T001 workflow rewrite.

**Checkpoint**: Migration cleanup complete. No traces of external repo remain.

---

## Phase 5: Polish - Enable Pages & Verify Deployment

**Purpose**: Switch GitHub Pages source and perform end-to-end verification after merging to `main`.

- [ ] T014 Switch GitHub Pages source to "GitHub Actions" via `gh api repos/phsb5321/VoxPage/pages -X PUT -f build_type=workflow` — MUST happen AFTER workflow is merged to `main`, otherwise first deploy will fail
- [ ] T015 Trigger initial deployment via `gh workflow run deploy-site.yml` (or push to `main`) and wait for workflow completion
- [ ] T016 Verify marketing pages load at `https://phsb5321.github.io/VoxPage/` — check index.html, pricing.html, privacy.html, terms.html all render with correct CSS, fonts, and images
- [ ] T017 Verify legal ToS loads at `https://phsb5321.github.io/VoxPage/legal/terms.html` — check CSS, dark/light mode toggle, print stylesheet
- [ ] T018 Verify auto-update files preserved at `https://phsb5321.github.io/VoxPage/updates.json` and `https://phsb5321.github.io/VoxPage/releases/voxpage-1.1.3.xpi`
- [ ] T019 Verify all internal navigation links work (click through all nav links on every page, no 404s)
- [ ] T020 Verify meta tags (open each page, check og:url and canonical contain `VoxPage` not `voxpage-site`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: No dependencies — workflow rewrite can start immediately
- **Phase 2 (US2)**: No dependencies — URL updates can start immediately, in parallel with Phase 1
- **Phase 3 (US3)**: No dependencies — cross-reference updates can start immediately, in parallel with Phase 1+2
- **Phase 4 (US4)**: Depends on Phases 1-3 completion (verification sweep)
- **Phase 5 (Polish)**: Depends on ALL phases 1-4 AND merge to `main`

### User Story Dependencies

- **US1 (P1)**: Independent — workflow file changes only
- **US2 (P1)**: Independent — site content file changes only (different files from US1)
- **US3 (P2)**: Independent — legal + docs file changes only (different files from US1 and US2)
- **US4 (P2)**: Depends on US1+US2+US3 — verification that all changes are complete
- **Note**: US2, US3, and US4 all involve replacing `voxpage-site` → `VoxPage` in different files. They are split by user story for traceability but share the same string replacement pattern.

### Within Each User Story

- T001 (workflow rewrite) must complete before T002 (release trigger) since they're the same conceptual change
- T003-T008 (site URLs) are all parallel — different files
- T009-T011 (cross-refs) are all parallel — different files
- T012-T013 (sweeps) must run after all prior tasks

### Parallel Opportunities

```
Phase 1:  T001 → T002 (sequential, same workflow concern)
Phase 2:  T003 | T004 | T005 | T006 | T007 | T008 (all parallel)
Phase 3:  T009 | T010 | T011 (all parallel)
Phase 4:  T012 | T013 (parallel sweeps)
Phase 5:  T014 → T015 → T016-T020 (sequential: enable → deploy → verify)
```

Phases 1, 2, and 3 can all execute in parallel since they modify different files.

---

## Parallel Example: Phases 1-3 Concurrent

```bash
# All three phases can run simultaneously:

# Phase 1 (US1): Workflow files
Task: "Rewrite deploy-site.yml" → .github/workflows/deploy-site.yml
Task: "Add dispatch trigger to release.yml" → .github/workflows/release.yml

# Phase 2 (US2): Site content files (all 6 parallel)
Task: "Update index.html" → packages/site/index.html
Task: "Update pricing.html" → packages/site/pricing.html
Task: "Update privacy.html" → packages/site/privacy.html
Task: "Update terms.html" → packages/site/terms.html
Task: "Update sitemap.xml" → packages/site/sitemap.xml
Task: "Update robots.txt" → packages/site/robots.txt

# Phase 3 (US3): Legal + docs files (all 3 parallel)
Task: "Update legal/terms.html" → packages/legal/terms.html
Task: "Update TERMS_OF_SERVICE.md" → TERMS_OF_SERVICE.md
Task: "Update legal/README.md" → packages/legal/README.md
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Rewrite deploy-site.yml + release.yml trigger
2. Complete Phase 2: Update all site URLs
3. **STOP and VALIDATE**: Grep for `voxpage-site` in modified files — should be zero
4. This gives a working deployment with correct URLs

### Incremental Delivery

1. Phases 1+2+3 (all parallel) → All file modifications done
2. Phase 4 → Verification sweep confirms completeness
3. Merge to `main`
4. Phase 5 → Enable Pages source, trigger deploy, verify live site

### Single-Developer Strategy (Recommended)

Since all file modifications are small (string replacements) and the total scope is 12 files:

1. Do T001 (workflow rewrite) — most complex task
2. Do T003-T011 in one batch (all string replacements, ~5 minutes)
3. Do T002 (release trigger addition)
4. Do T012-T013 (verification sweep)
5. Commit, push, merge to main
6. Do T014-T020 (enable Pages + verify)

---

## Notes

- [P] tasks = different files, no dependencies
- All URL updates are the same pattern: `voxpage-site` → `VoxPage` (case-sensitive)
- T014 (Pages source switch) MUST happen after merge to `main` — cannot be done on feature branch
- T015-T020 are live verification tasks — require deployed site
- The `gh-pages` branch remains as a data store for auto-updates; it is no longer the Pages deployment source
- Session log `.txt` files in repo root are excluded from cleanup (transient artifacts)
