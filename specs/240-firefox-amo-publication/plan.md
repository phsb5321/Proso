# Plan — Feature 240

## Constitution check

The listed build sends no new data and requests no new permission. Its only manifest difference from the existing self-distributed build is the absence of `update_url`, because Mozilla hosts listed updates. The existing data-collection declaration remains unchanged. No credential is committed or logged. Existing self-distributed users keep the same GUID, update feed, and signed artifacts.

The repository already publicly describes the codebase as AGPL-3.0-or-later and offers commercial terms beyond it. Normalizing contradictory package metadata and the root licence text to that existing public commitment resolves drift rather than choosing a new business model.

Store submission and DNS cutover are external release actions. They proceed only after the exact artifacts and rollback probes are captured. A failed Mozilla review or custom-domain probe leaves the current self-distributed channel and GitHub Pages origin untouched.

## Approach

### Slice A — deterministic publication candidate

1. Build both Firefox channels from the isolated worktree at the same version and extension ID.
2. Run the existing release-channel gate and Mozilla validator against the listed ZIP.
3. Normalize licence metadata to AGPL-3.0-or-later.
4. Remove the dormant remote-telemetry initializer, host permission, build-time credential seam, and public toggle; declare the website content necessarily transmitted for synthesis and disclose it in first-run onboarding.
5. Replace stale website distribution copy and canonical URLs with the stable Mozilla product URL, while retaining a fail-closed status if the listing is not public.
6. Add a live publication oracle that requires anonymous public status, current version, and the stable product URL.

### Slice B — Mozilla product and version

**Reconciled 15/09/2026:** 1.2.10 is already public (addon 2978221, version
6452761, file 4996936). Preserve it; the upload below is a future 1.2.11 update,
not a replacement for an unpublished draft. No repeat submission, disable or
release action is authorized by this status reconciliation. The current oracle
correctly remains red for the unreleased 1.2.11 candidate and stale site copy.

1. Preserve the current private dashboard state as the before receipt.
2. Change the add-on’s distribution mode from self-hosted to Mozilla-hosted for the new version only.
3. Upload the listed 1.2.11 ZIP and source archive, provide reproducible build instructions and permission justification, and submit it for review.
4. Update the product page from VoxPage to Proso, complete listing metadata, privacy policy, licence, categories, and screenshots.
5. Poll anonymous AMO endpoints until the public oracle passes or Mozilla supplies an actionable review finding.

### Slice C — public website and custom domain

1. Update the `gh-pages` update links to `https://proso.com.br/releases/...` while preserving versions and hashes.
2. Assemble and publish the reviewed site to the existing private S3/OAC origin, verify on CloudFront, and invalidate caches.
3. Request a fresh ACM certificate, create the exact validation CNAME in Cloudflare with proxying off, and wait for `ISSUED`.
4. Attach the custom domain, change only the `proso.com.br` DNS target, and verify the homepage, legal pages, update feed, and XPI anonymously.
5. Keep the old GitHub Pages origin as the rollback target until all probes pass.

## Verification

- `make doctor`
- `make release-channels`
- `pnpm --filter @proso/extension exec web-ext lint --source-dir .output-listed/firefox-mv2`
- targeted site/publication checks
- `make fuzz`
- `make user-gate-diagnostic` (release/browser evidence; not Feature 095 completion)
- `make verify`
- `GENERATOR_FAMILY=openai make gate`
- different-family exact-head review
- anonymous AMO/public-site/update-feed oracle

## Rollback

- Repository: revert the Feature 240 squash commit through a PR.
- AMO: disable only the newly listed version/product page; do not delete the add-on or its GUID.
- Site: point `proso.com.br` back to the prior GitHub Pages target and invalidate DNS/cache; S3 versioning retains overwritten objects.
- Existing extension users: the unlisted 1.2.1 update feed and XPI are never removed.
