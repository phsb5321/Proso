# Proso Legal Documents

Standalone legal documents for Proso. These are the authoritative versions referenced by the extension, server, Paddle checkout, and external links.

## Files

- `terms.html` — Terms of Service (20 sections, ~40KB)
- `assets/css/legal.css` — Legal document stylesheet (~5KB)

## Local Development

Open directly in a browser — no server or build step required:

```bash
# From repo root
xdg-open packages/legal/terms.html    # Linux
open packages/legal/terms.html         # macOS
firefox packages/legal/terms.html      # Firefox directly
```

## Design Principles

- **Pure HTML + CSS** — zero JavaScript, zero external dependencies
- **System fonts** — Georgia (body), system sans-serif (headings)
- **Dark/light mode** — via `prefers-color-scheme`
- **Print-friendly** — `@media print` removes navigation chrome
- **Accessible** — WCAG 2.1 AA, proper heading hierarchy, skip-nav
- **Lightweight** — under 50KB total (HTML + CSS)

## Deployment

Legal pages deploy alongside the marketing site via `.github/workflows/deploy-site.yml`:

1. Push changes to `main` branch
2. GitHub Action copies `packages/legal/` into `packages/site/legal/`
3. Deploys to `phsb5321/Proso` repo
4. Accessible at `https://proso.com.br/legal/terms.html`

## Updating the ToS

1. Update the `datetime` attribute on the last-updated `<time>` element
2. For material changes: update the effective date (30+ days in the future)
3. Add previous version to the "Previous versions" section
4. Commit and push to `main` to trigger deploy
