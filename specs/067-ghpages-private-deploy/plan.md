# Implementation Plan: GitHub Pages from Private Monorepo

**Branch**: `067-ghpages-private-deploy` | **Date**: 2026-02-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/067-ghpages-private-deploy/spec.md`

## Summary

Migrate GitHub Pages deployment from external public repo (`phsb5321/voxpage-site`) to native GitHub Actions Pages deployment on the private `phsb5321/VoxPage` monorepo. Replace `peaceiris/actions-gh-pages` with `actions/deploy-pages@v4`, update all URLs from `voxpage-site` to `VoxPage`, merge auto-update files from `gh-pages` branch into the Actions deployment, and remove all references to the external repo.

## Technical Context

**Language/Version**: YAML (GitHub Actions workflows), HTML5, CSS3, Markdown
**Primary Dependencies**: `actions/deploy-pages@v4`, `actions/upload-pages-artifact@v3`, `actions/configure-pages@v5`
**Storage**: N/A (static site, no persistence)
**Testing**: Manual verification (page loads, link checks, asset loading)
**Target Platform**: GitHub Pages (static hosting)
**Project Type**: Static site deployment (CI/CD configuration)
**Performance Goals**: Deploy completes in under 5 minutes
**Constraints**: Must preserve auto-update system (`updates.json`, `releases/*.xpi`); must work under `/VoxPage/` base path; no separate public repo
**Scale/Scope**: 10 files modified, 21 URL occurrences updated, 2 workflows changed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applicable? | Status | Notes |
| --------- | ----------- | ------ | ----- |
| I. Cross-Browser with MV3 Priority | No | N/A | This feature modifies CI/CD and static site files, not extension code |
| II. Privacy by Design | No | N/A | No user data involved |
| III. Hexagonal Architecture | No | N/A | No extension code modified |
| IV. Test Coverage | Partial | PASS | Manual verification checklist provided; no unit-testable code |
| V. Observability | No | N/A | Static site, no telemetry |
| VI. Simplicity | Yes | PASS | Minimal changes; reuses existing workflow structure; no over-engineering |

**Gate Result**: PASS — No violations. Feature is primarily CI/CD configuration.

**Post-Design Re-check**: PASS — The auto-update merge step adds minor complexity (fetching from gh-pages) but is the simplest approach that preserves backward compatibility (see research.md RQ-001).

## Project Structure

### Documentation (this feature)

```text
specs/067-ghpages-private-deploy/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Research decisions (gh-pages conflict, base paths)
├── data-model.md        # URL mapping and deployed site structure
├── quickstart.md        # Quick implementation reference
├── contracts/
│   ├── deploy-site-workflow.yml   # Target workflow structure
│   └── release-trigger.yml        # Release workflow addition
├── checklists/
│   └── requirements.md            # Spec quality checklist
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
.github/workflows/
├── deploy-site.yml          # MODIFY: Replace with native Actions deployment
└── release.yml              # MODIFY: Add repository_dispatch trigger

packages/site/
├── index.html               # MODIFY: og:url, canonical, JSON-LD url
├── pricing.html             # MODIFY: og:url, canonical
├── privacy.html             # MODIFY: og:url, canonical
├── terms.html               # MODIFY: og:url, canonical
├── sitemap.xml              # MODIFY: 4 loc entries
└── robots.txt               # MODIFY: sitemap URL

packages/legal/
├── terms.html               # MODIFY: canonical, brand link
└── README.md                # MODIFY: deploy target, URL

TERMS_OF_SERVICE.md          # MODIFY: online URL
```

**Structure Decision**: No new directories or files created. All changes are modifications to existing files. The `_site` build directory is ephemeral (created during CI only).

## Implementation Phases

### Phase 1: Rewrite deploy-site.yml (FR-001 through FR-005, FR-016)

Replace the entire workflow with native GitHub Actions Pages deployment:

1. Remove `peaceiris/actions-gh-pages` and external repo push
2. Add `permissions` block (`contents: read`, `pages: write`, `id-token: write`)
3. Add `concurrency` block to prevent concurrent deployments
4. Add `environment` block for `github-pages`
5. Add `repository_dispatch` trigger (type: `release-deployed`) for release workflow integration
6. Build step: create `_site/` dir, copy `packages/site/*` to root, copy `packages/legal/` to `_site/legal/`
7. Merge step: fetch `updates.json` and `releases/` from `gh-pages` branch into `_site/`
8. Deploy with `actions/configure-pages@v5` + `actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4`

Reference: `contracts/deploy-site-workflow.yml`

### Phase 2: Update all URLs (FR-006 through FR-014)

Global find-and-replace `voxpage-site` → `VoxPage` in these files:

| File | Occurrences |
| ---- | ----------- |
| `packages/site/index.html` | 3 (og:url, canonical, JSON-LD) |
| `packages/site/pricing.html` | 2 (og:url, canonical) |
| `packages/site/privacy.html` | 2 (og:url, canonical) |
| `packages/site/terms.html` | 2 (og:url, canonical) |
| `packages/site/sitemap.xml` | 4 (loc entries) |
| `packages/site/robots.txt` | 1 (sitemap URL) |
| `packages/legal/terms.html` | 2 (canonical, brand link) |
| `packages/legal/README.md` | 2 (deploy target, URL) |
| `TERMS_OF_SERVICE.md` | 2 (display text + href) |

All occurrences are the literal string `voxpage-site` → `VoxPage`. No other path changes needed — internal asset paths are already relative.

### Phase 3: Update release.yml (auto-update integration)

Add a step at the end of the `deploy-updates` job to trigger site redeployment:

```yaml
- name: Trigger site redeploy to include release files
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    gh api repos/${{ github.repository }}/dispatches \
      -f event_type=release-deployed
```

Reference: `contracts/release-trigger.yml`

### Phase 4: Enable GitHub Pages with Actions source (FR-015)

```bash
gh api repos/phsb5321/VoxPage/pages -X PUT -f build_type=workflow
```

This switches Pages from "Deploy from branch" (gh-pages) to "GitHub Actions" source.

**Important**: This must happen AFTER the workflow is merged to `main`, otherwise the first deploy will fail.

### Phase 5: Verify deployment

1. Trigger `workflow_dispatch` on `deploy-site.yml`
2. Verify `https://phsb5321.github.io/VoxPage/` loads
3. Verify all 4 marketing pages load with correct styles
4. Verify `https://phsb5321.github.io/VoxPage/legal/terms.html` loads
5. Verify `https://phsb5321.github.io/VoxPage/updates.json` loads (auto-update preserved)
6. Verify all internal links work
7. Run codebase search for `voxpage-site` — expect zero results

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Auto-update breaks during migration | Medium | High | Merge gh-pages content into Actions build; test updates.json availability |
| Pages source switch fails | Low | Medium | Can revert to branch-based deployment |
| Relative paths break on some page | Low | Medium | All internal paths already relative; only meta/SEO URLs change |
| Release workflow dispatch fails | Low | Low | Auto-update files still on gh-pages; next site deploy picks them up |

## Complexity Tracking

No constitution violations. No complexity justifications needed.
