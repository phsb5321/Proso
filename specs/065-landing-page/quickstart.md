# Quickstart: VoxPage Landing Page

**Feature**: `065-landing-page`
**Date**: 2026-02-16

## Prerequisites

- Git
- A GitHub account with write access to `phsb5321` org/user
- Text editor
- Web browser (Firefox preferred, for testing)

No build tools, no Node.js, no package managers needed for the site itself.

## Local Development

### 1. Directory Structure

The site lives in the monorepo at `packages/site/`:

```
packages/site/
├── index.html           # Landing page
├── pricing.html         # Pricing page (Paddle requirement)
├── privacy.html         # Privacy policy (Paddle requirement)
├── terms.html           # Terms of service (Paddle requirement)
├── robots.txt           # Search engine directives
├── sitemap.xml          # Sitemap for SEO
├── package.json         # Minimal (name + version only, no deps)
├── assets/
│   ├── css/
│   │   └── style.css    # Single stylesheet (all pages)
│   ├── js/
│   │   └── main.js      # Minimal JS (hero animation, pricing toggle, mobile menu)
│   ├── images/
│   │   ├── og-image.png # Open Graph image (1200x630)
│   │   └── favicon.png  # Favicon (copied from extension icons)
│   └── fonts/           # (empty — using Google Fonts CDN)
└── CNAME                # Custom domain file (when ready)
```

### 2. Preview Locally

Open `packages/site/index.html` directly in Firefox:

```bash
firefox packages/site/index.html
```

Or use a simple HTTP server for proper relative path handling:

```bash
cd packages/site
python3 -m http.server 8080
# Visit http://localhost:8080
```

### 3. Test Without JavaScript

Disable JavaScript in Firefox:
1. Navigate to `about:config`
2. Set `javascript.enabled` to `false`
3. Verify all pages are fully readable and navigable

### 4. Test Accessibility

Run Lighthouse audit:
1. Open Chrome DevTools (or Firefox equivalent)
2. Go to Lighthouse tab
3. Run audit with all categories enabled
4. Target: 95+ on all four categories

### 5. Test Responsive Design

Use Firefox responsive design mode (`Ctrl+Shift+M`):
- Mobile: 320px width
- Tablet: 768px width
- Desktop: 1280px width
- Verify no horizontal scrolling at any breakpoint

### 6. Test Dark/Light Mode

Toggle `prefers-color-scheme` in Firefox:
1. Open DevTools → Settings
2. Under "Rendering", change preferred color scheme
3. Verify both dark (default) and light modes are readable

## Deployment

### First-Time Setup

1. Create the public repository:
   ```bash
   gh repo create phsb5321/voxpage-site --public --description "VoxPage landing page"
   ```

2. Push site files to the new repo:
   ```bash
   cd packages/site
   git init
   git add .
   git commit -m "Initial landing page"
   git remote add origin git@github.com:phsb5321/voxpage-site.git
   git push -u origin main
   ```

3. Enable GitHub Pages:
   - Go to `github.com/phsb5321/voxpage-site/settings/pages`
   - Source: Deploy from a branch → `main` → `/ (root)`
   - Save

4. Site available at: `https://phsb5321.github.io/voxpage-site/`

### Subsequent Updates

The CI workflow (`.github/workflows/deploy-site.yml`) in the main VoxPage repo will automatically sync `packages/site/` to the `voxpage-site` repo on push to main.

Manual sync:
```bash
# From VoxPage repo root
rsync -av --delete packages/site/ /tmp/voxpage-site/
cd /tmp/voxpage-site
git add -A && git commit -m "Update site" && git push
```

## Key Files to Edit

| What to change           | File                    | Section                   |
| ------------------------ | ----------------------- | ------------------------- |
| Hero headline/copy       | `index.html`            | `#hero`                   |
| Feature descriptions     | `index.html`            | `#features`               |
| Pricing tiers/prices     | `index.html`, `pricing.html` | Pricing cards        |
| Privacy policy           | `privacy.html`          | All sections              |
| Terms of service         | `terms.html`            | All sections              |
| Colors/typography        | `assets/css/style.css`  | `:root` custom properties |
| Hero animation           | `assets/js/main.js`     | Hero animation function   |
| SEO meta tags            | All `.html` files       | `<head>`                  |
| Install CTA link         | All `.html` files       | CTA button `href`         |

## Validation Checklist

Before deploying:

- [ ] All 4 pages load correctly
- [ ] Pricing matches business model (Free $0, Basic $4.99, Pro $14.99, Multilingual $19.99)
- [ ] Privacy policy has substantive content
- [ ] Terms of service has substantive content
- [ ] Install CTA links to valid .xpi download URL
- [ ] No JavaScript errors in console
- [ ] All pages work with JS disabled
- [ ] Lighthouse 95+ all categories
- [ ] No horizontal scroll on mobile (320px)
- [ ] Dark mode and light mode both work
- [ ] `prefers-reduced-motion` disables animations
- [ ] OG image renders when URL shared
- [ ] Zero cookies (check DevTools → Storage)
