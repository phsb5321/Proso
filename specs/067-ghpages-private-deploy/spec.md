# Feature Specification: GitHub Pages from Private Monorepo

**Feature Branch**: `067-ghpages-private-deploy`
**Created**: 2026-02-17
**Status**: Draft
**Input**: User description: "Consolidate GitHub Pages deployment so it publishes directly from the private VoxPage monorepo. Remove all references to the separate phsb5321/voxpage-site public repo."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deploy Site from Private Repo (Priority: P1)

As the project maintainer, I want the marketing site and legal pages to deploy directly from the private VoxPage monorepo using native GitHub Pages, so that I no longer need to maintain a separate public repository or a personal access token for cross-repo deployment.

**Why this priority**: This is the core objective. Without native Pages deployment, nothing else in this feature matters. Eliminating the external repo dependency removes a maintenance burden and a secret (SITE_DEPLOY_TOKEN) that must be rotated.

**Independent Test**: Push a change to `packages/site/` or `packages/legal/` on `main` and verify the site deploys successfully to `https://phsb5321.github.io/VoxPage/` without any external repo involvement.

**Acceptance Scenarios**:

1. **Given** a push to `main` that modifies files under `packages/site/`, **When** the deploy workflow runs, **Then** the site is published at `https://phsb5321.github.io/VoxPage/` using native GitHub Pages (no external repo push).
2. **Given** a push to `main` that modifies files under `packages/legal/`, **When** the deploy workflow runs, **Then** the legal pages are published under `https://phsb5321.github.io/VoxPage/legal/`.
3. **Given** a manual workflow dispatch trigger, **When** the workflow runs, **Then** the full site deploys successfully.
4. **Given** the workflow file, **When** inspected, **Then** it contains no reference to `SITE_DEPLOY_TOKEN`, `peaceiris/actions-gh-pages`, or `phsb5321/voxpage-site`.

---

### User Story 2 - All Pages and Assets Load Correctly Under /VoxPage/ Path (Priority: P1)

As a site visitor, I want all pages, assets (CSS, fonts, images), and internal links to work correctly when the site is served under the `/VoxPage/` base path, so that I have a seamless browsing experience.

**Why this priority**: Equally critical to Story 1. If the deployment succeeds but paths are broken, the site is effectively down. Every asset and link reference must account for the `/VoxPage/` prefix.

**Independent Test**: After deployment, visit each page and verify all CSS loads, all images render, all internal navigation links resolve to valid pages, and no browser console errors appear for 404'd resources.

**Acceptance Scenarios**:

1. **Given** the deployed site at `https://phsb5321.github.io/VoxPage/`, **When** a visitor opens `index.html`, **Then** all CSS, fonts, images, and the OG image load without 404 errors.
2. **Given** the deployed site, **When** a visitor clicks any internal navigation link (pricing, privacy, terms), **Then** the target page loads successfully (no 404).
3. **Given** the deployed site, **When** a visitor opens the standalone legal ToS at `/VoxPage/legal/terms.html`, **Then** the page renders with its own CSS, dark/light mode works, and the print stylesheet functions.
4. **Given** the sitemap.xml, **When** a search engine reads it, **Then** all URLs use the correct `https://phsb5321.github.io/VoxPage/` base path.
5. **Given** any HTML page, **When** inspected for `og:url`, `canonical`, and `og:image` meta tags, **Then** all use the correct `https://phsb5321.github.io/VoxPage/` base URL.

---

### User Story 3 - Cross-References Between Marketing and Legal Pages (Priority: P2)

As a site visitor on the marketing terms page, I want the link to the full standalone Terms of Service to work, and from the legal ToS I want to be able to navigate back to the marketing site, so that I can move seamlessly between marketing content and legal documents.

**Why this priority**: Important for user experience and legal compliance, but secondary to the core deployment and path-fix work. Cross-references are a small subset of links that need specific attention.

**Independent Test**: Click the cross-reference link on `terms.html` (marketing) and verify it opens `legal/terms.html`. Click the "Back to VoxPage" link on `legal/terms.html` and verify it navigates to the homepage.

**Acceptance Scenarios**:

1. **Given** the marketing terms page (`/VoxPage/terms.html`), **When** a visitor clicks the link to the full standalone ToS, **Then** they arrive at `/VoxPage/legal/terms.html`.
2. **Given** the legal ToS page (`/VoxPage/legal/terms.html`), **When** a visitor clicks the "VoxPage" brand link, **Then** they arrive at `/VoxPage/` (the homepage).
3. **Given** `TERMS_OF_SERVICE.md` in the repo root, **When** a developer reads it, **Then** the online URL points to `https://phsb5321.github.io/VoxPage/legal/terms.html`.
4. **Given** `packages/legal/README.md`, **When** a developer reads it, **Then** the deployment URL references `https://phsb5321.github.io/VoxPage/legal/terms.html` and does not mention `voxpage-site`.

---

### User Story 4 - Remove All References to External Repo (Priority: P2)

As the project maintainer, I want zero references to `phsb5321/voxpage-site` or `SITE_DEPLOY_TOKEN` remaining anywhere in the codebase, so that the migration is complete and there is no confusion about the deployment target.

**Why this priority**: Cleanup work that prevents future confusion. Not blocking deployment, but important for maintainability.

**Independent Test**: Run a codebase-wide search for `voxpage-site` and `SITE_DEPLOY_TOKEN` and confirm zero results (excluding git history and session log files).

**Acceptance Scenarios**:

1. **Given** the full codebase (excluding `.git/` and session log `.txt` files), **When** searched for the string `voxpage-site`, **Then** zero results are returned.
2. **Given** the full codebase, **When** searched for `SITE_DEPLOY_TOKEN`, **Then** zero results are returned.
3. **Given** the GitHub repository settings, **When** the `SITE_DEPLOY_TOKEN` secret is checked, **Then** it can be safely deleted (out of scope for this feature, but noted as follow-up).

---

### Edge Cases

- **Conflict with existing gh-pages branch**: The auto-update system uses the `gh-pages` branch for XPI releases and `updates.json`. Native Pages deployment via GitHub Actions uses a separate deployment mechanism and does not write to `gh-pages`. Both can coexist, but Pages source must be set to "GitHub Actions" rather than "Deploy from a branch".
- **Workflow triggers on unrelated pushes**: The workflow only triggers on path-filtered pushes (`packages/site/**`, `packages/legal/**`) or manual dispatch. Pushes to other paths do not trigger deployment.
- **Custom domain configured later**: Using relative asset paths means all internal links work regardless of base path. Canonical URLs and sitemap URLs will need updating when a custom domain is added, but that is out of scope.
- **Empty or no-change deployment**: If the workflow is triggered but no site files actually changed (e.g., via `workflow_dispatch`), the deployment still succeeds — it simply re-deploys the current content.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `deploy-site.yml` workflow MUST use `actions/upload-pages-artifact` and `actions/deploy-pages` for native GitHub Pages deployment.
- **FR-002**: The workflow MUST trigger on pushes to `main` that modify `packages/site/**` or `packages/legal/**`, plus support `workflow_dispatch`.
- **FR-003**: The workflow MUST create a merged build directory that places `packages/site/` contents at the root and `packages/legal/` contents under a `legal/` subdirectory.
- **FR-004**: The workflow MUST NOT reference `SITE_DEPLOY_TOKEN`, `peaceiris/actions-gh-pages`, or `phsb5321/voxpage-site`.
- **FR-005**: The workflow MUST request `pages: write` and `id-token: write` permissions.
- **FR-006**: All HTML files in `packages/site/` MUST have `canonical` and `og:url` meta tags pointing to `https://phsb5321.github.io/VoxPage/[page]`.
- **FR-007**: All HTML files MUST use relative asset paths (e.g., `assets/css/style.css` not `/assets/css/style.css`) so they work under any base path.
- **FR-008**: The `sitemap.xml` MUST use full URLs with the `https://phsb5321.github.io/VoxPage/` base.
- **FR-009**: The `robots.txt` MUST reference the correct sitemap URL at `https://phsb5321.github.io/VoxPage/sitemap.xml`.
- **FR-010**: All internal navigation links between site pages MUST use relative paths.
- **FR-011**: The marketing `terms.html` cross-reference to the standalone ToS MUST point to `legal/terms.html` (relative).
- **FR-012**: The legal `terms.html` brand link back to the marketing site MUST use a correct relative path to the homepage.
- **FR-013**: `TERMS_OF_SERVICE.md` MUST reference `https://phsb5321.github.io/VoxPage/legal/terms.html`.
- **FR-014**: `packages/legal/README.md` MUST reference `https://phsb5321.github.io/VoxPage/legal/terms.html` and MUST NOT reference `voxpage-site`.
- **FR-015**: GitHub Pages MUST be enabled on `phsb5321/VoxPage` with build source set to "GitHub Actions".
- **FR-016**: The deployed site structure MUST place site pages at root and legal pages under `legal/` subdirectory.

### Key Entities

- **Deploy Workflow** (`deploy-site.yml`): The GitHub Actions workflow responsible for building and deploying the site. The primary artifact being modified.
- **Site Package** (`packages/site/`): Marketing pages (index, pricing, privacy, terms), static assets, sitemap, and robots.txt.
- **Legal Package** (`packages/legal/`): Standalone legal documents (terms.html) with their own independent CSS.
- **Merged Build Directory**: Ephemeral directory created during CI that combines site and legal content into the final deployable structure.

## Assumptions

- GitHub Pro plan (or equivalent) is active on the account, enabling GitHub Pages on private repositories.
- The existing `gh-pages` branch for auto-updates (XPI releases, `updates.json`) will not conflict with native Pages deployment via Actions, as they use separate deployment mechanisms.
- No custom domain is configured at this time; the site will be served at `https://phsb5321.github.io/VoxPage/`.
- The `phsb5321/voxpage-site` external repo can be archived or deleted after this migration, but that action is out of scope for this feature.
- Session log `.txt` files in the repo root are transient artifacts and are excluded from the "zero references" cleanup requirement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The site is accessible at `https://phsb5321.github.io/VoxPage/` after a push to `main` or manual workflow dispatch, with all 4 marketing pages loading successfully.
- **SC-002**: The standalone ToS loads at `https://phsb5321.github.io/VoxPage/legal/terms.html` with correct styling, dark/light mode, and print stylesheet.
- **SC-003**: All internal links between pages resolve without 404 errors when clicked through.
- **SC-004**: All assets (CSS, fonts, images, OG image) load without 404 errors on every page.
- **SC-005**: A codebase-wide search for `voxpage-site` returns zero results in tracked source files.
- **SC-006**: The `deploy-site.yml` workflow contains no reference to `SITE_DEPLOY_TOKEN` or external repository push mechanisms.
- **SC-007**: The deploy workflow completes successfully in under 5 minutes.
