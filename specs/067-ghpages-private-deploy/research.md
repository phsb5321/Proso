# Research: GitHub Pages from Private Monorepo

**Feature**: 067-ghpages-private-deploy
**Date**: 2026-02-17

## RQ-001: gh-pages Branch Conflict with Native Actions Deployment

### Context

The `gh-pages` branch currently serves auto-update files for the Firefox extension:
- `updates.json` — Firefox auto-update manifest (referenced in `manifest.json` `update_url`)
- `releases/voxpage-*.xpi` — Signed extension packages

Pages is currently configured as `legacy` (Deploy from branch) → `gh-pages` / `root`.

Switching Pages source to "GitHub Actions" (native deployment via `deploy-pages@v4`) means the `gh-pages` branch **stops being served**. The auto-update system would break.

### Decision: Merge auto-update content into Actions deployment

The site deployment workflow will:
1. Checkout `main` for site/legal content
2. Fetch `updates.json` and `releases/` from the `gh-pages` branch
3. Merge auto-update files into the build directory alongside site content
4. Deploy everything via `actions/deploy-pages@v4`

The release workflow (`release.yml`) will be updated to:
1. Continue pushing updates to `gh-pages` branch (as a data store)
2. After pushing, trigger the `deploy-site.yml` workflow via `workflow_dispatch` so the new release files get included in the next deployment

### Rationale

- Satisfies the user's explicit requirement for native Actions deployment
- Preserves auto-update system without breaking existing Firefox installations
- Single deployment mechanism (Actions) instead of mixed (branch + Actions)
- The `gh-pages` branch becomes a data store, not a deployment source

### Alternatives Considered

1. **Keep gh-pages as deployment source, push site there with `keep_files: true`**
   - Simpler, but still uses `peaceiris/actions-gh-pages` (user wants to remove)
   - Would use `GITHUB_TOKEN` instead of `SITE_DEPLOY_TOKEN` (improvement)
   - Rejected: doesn't satisfy the native Actions deployment requirement

2. **Separate the auto-update to a different repo or CDN**
   - Too large a scope change for this feature
   - Rejected: over-engineering

## RQ-002: GitHub Pages on Private Repos

### Decision: GitHub Pro supports this natively

GitHub Pro (and Team/Enterprise) plans support GitHub Pages on private repositories. The `phsb5321/VoxPage` repo is private and the account has Pro, so native Pages deployment works.

### Verification

```bash
gh api repos/phsb5321/VoxPage/pages
# Returns: {"build_type":"legacy","html_url":"https://phsb5321.github.io/VoxPage/"}
```

Pages is already enabled. Only the build source needs to change from `legacy` (branch) to `workflow` (Actions).

## RQ-003: Base Path Strategy for /VoxPage/

### Decision: Use relative paths for assets/links, absolute URLs for meta tags

Two types of references exist:
1. **Internal references** (CSS, JS, images, nav links) → **relative paths** (e.g., `assets/css/style.css`)
2. **Meta/SEO references** (canonical, og:url, sitemap, robots.txt) → **absolute URLs** with full base (e.g., `https://phsb5321.github.io/VoxPage/`)

### Rationale

- Relative paths work under any base path (future custom domain compatible)
- Meta tags and sitemaps require absolute URLs per specification (RFC/SEO standards)
- No `<base>` tag needed — relative paths already work correctly in the current codebase
- Only the domain portion of absolute URLs needs changing (`voxpage-site` → `VoxPage`)

### Current State Audit

All internal asset references in site HTML files already use relative paths:
- `assets/css/style.css` (relative)
- `assets/images/favicon.png` (relative)
- Navigation links: `index.html`, `pricing.html`, etc. (relative)

Only the following need the domain prefix update:
- `og:url` meta tags (4 site pages + 1 legal page)
- `canonical` links (4 site pages + 1 legal page)
- `og:image` tags (if present)
- `sitemap.xml` URLs (4 entries)
- `robots.txt` sitemap reference (1 entry)
- JSON-LD schema URL (1 entry in index.html)

### Legal page cross-references

The legal `terms.html` uses `../privacy.html` and `../terms.html` for cross-references back to the site. These relative paths resolve correctly when legal is deployed at `/VoxPage/legal/terms.html` — `../privacy.html` → `/VoxPage/privacy.html`.

The legal brand link uses an absolute URL (`https://phsb5321.github.io/voxpage-site/`) which needs updating.

## RQ-004: Release Workflow Trigger Chain

### Decision: Release workflow triggers site redeploy via repository_dispatch

After the release workflow pushes updated `updates.json` and XPI to `gh-pages`, it will trigger the site deploy workflow using `repository_dispatch`. This ensures the new release files are included in the next Actions deployment.

### Implementation

In `release.yml`, after the `gh-pages` push step, add:
```yaml
- name: Trigger site redeploy
  run: |
    gh api repos/${{ github.repository }}/dispatches \
      -f event_type=release-deployed
```

In `deploy-site.yml`, add trigger:
```yaml
on:
  repository_dispatch:
    types: [release-deployed]
```

### Rationale

- `repository_dispatch` is cleaner than `workflow_dispatch` for programmatic triggers
- Doesn't require additional tokens (uses `GITHUB_TOKEN`)
- The deploy-site workflow already knows how to merge gh-pages content
