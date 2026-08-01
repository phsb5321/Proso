# Quickstart: GitHub Pages from Private Monorepo

**Feature**: 067-ghpages-private-deploy
**Branch**: `067-ghpages-private-deploy`

## What This Feature Does

Migrates the VoxPage marketing site and legal pages from deploying to an external public repo (`phsb5321/voxpage-site`) to deploying natively from the private monorepo (`phsb5321/VoxPage`) using GitHub Actions Pages deployment.

## Files to Modify

### Workflow (1 file)
- `.github/workflows/deploy-site.yml` — Replace external repo push with native Actions deployment

### Release Workflow (1 file)
- `.github/workflows/release.yml` — Add `repository_dispatch` trigger after gh-pages push

### URL Updates (10 files, 21 occurrences)
- `packages/site/index.html` — og:url, canonical, JSON-LD url
- `packages/site/pricing.html` — og:url, canonical
- `packages/site/privacy.html` — og:url, canonical
- `packages/site/terms.html` — og:url, canonical
- `packages/site/sitemap.xml` — 4 loc entries
- `packages/site/robots.txt` — sitemap URL
- `packages/legal/terms.html` — canonical, brand link
- `packages/legal/README.md` — deploy target, URL
- `TERMS_OF_SERVICE.md` — online URL

### GitHub Configuration (manual)
- Enable Pages with "GitHub Actions" source via API

## Quick Verification

```bash
# After merge to main, verify deployment
gh api repos/phsb5321/VoxPage/pages --jq '.html_url'
# Expected: https://phsb5321.github.io/VoxPage/

# Verify no voxpage-site references remain
grep -r "voxpage-site" --include="*.html" --include="*.yml" --include="*.md" --include="*.xml" --include="*.txt" packages/ .github/ TERMS_OF_SERVICE.md
# Expected: no results

# Verify no SITE_DEPLOY_TOKEN references
grep -r "SITE_DEPLOY_TOKEN" .github/
# Expected: no results
```

## Key Design Decision

The `gh-pages` branch is still used as a data store for auto-update files (`updates.json`, `releases/*.xpi`). The deploy-site workflow fetches these files during build and includes them in the Actions deployment. The release workflow triggers a site redeploy after pushing new release files.
