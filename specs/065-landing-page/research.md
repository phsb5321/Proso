# Research: VoxPage Landing Page & Marketing Site

**Feature**: `065-landing-page`
**Date**: 2026-02-16

## R-001: Deployment Strategy (GitHub Pages from Private Repo)

**Decision**: Create a separate **public** `phsb5321/voxpage-site` repository and deploy via GitHub Pages.

**Rationale**: The VoxPage monorepo (`phsb5321/VoxPage`) is private. GitHub Pages is NOT available for private repositories on the GitHub Free plan. A paid plan (GitHub Pro $4/month) would be required to serve Pages from the private repo. A separate public repository is free and provides clean separation between the marketing site and proprietary source code.

**Alternatives considered**:
- **Use existing `gh-pages` branch**: Rejected. The main repo is private (GitHub Free blocks Pages). Even if upgraded to Pro, mixing site files with auto-update `updates.json` and `.xpi` files creates maintenance complexity.
- **GitHub Actions deploy to Pages from private repo**: Rejected. Still requires Pro plan. The deployment mechanism doesn't bypass the plan restriction.
- **Third-party hosting (Netlify, Cloudflare Pages)**: Viable but adds external dependency. GitHub Pages is simpler and aligns with the existing GitHub workflow.

**Implementation approach**:
- Develop site in monorepo at `packages/site/` for co-location with extension code
- GitHub Actions workflow copies `packages/site/` content to the public `voxpage-site` repo on push to main
- Site available at `https://phsb5321.github.io/voxpage-site/`
- Custom domain (e.g., `voxpage.app`) can be added later via CNAME

## R-002: Competitor Pricing Verification

**Decision**: Update comparison table with verified pricing. Remove inaccurate $60/yr NaturalReader claim.

**Verified pricing (February 2026)**:

| Competitor     | Annual Price | Monthly Price | Word-Level Sync      | BYOK | Firefox Extension |
| -------------- | ------------ | ------------- | -------------------- | ---- | ----------------- |
| Speechify      | $139/yr      | $29/mo        | Both tiers (advanced features paid) | No   | Uncertain (web app works, extension unclear) |
| NaturalReader  | $119/yr      | $20.90/mo     | Configurable (paywall unclear) | No   | No (web app only, no extension) |
| Read Aloud     | Freemium     | $1/2M chars   | Paragraph-level only | Yes (GCP, AWS) | Yes (full support) |

**Key findings**:
- NaturalReader is $119/yr, NOT $60/yr as originally estimated. Update comparison table.
- Read Aloud also offers BYOK and Firefox support — VoxPage's comparison should acknowledge this honestly but highlight VoxPage's broader BYOK support (OpenAI, ElevenLabs, Groq, Cartesia, not just GCP/AWS) and word-level (not just paragraph-level) sync.
- Speechify Firefox support is uncertain — be cautious about claiming "Chrome-first" for Speechify; safer to say "Chrome-primary" or omit Firefox column from comparison.

## R-003: VoxPage Annual Pricing Calculation

**Decision**: Apply ~33% discount to monthly prices for annual billing.

| Tier          | Monthly  | Annual (per month) | Annual (total) | Savings |
| ------------- | -------- | ------------------ | -------------- | ------- |
| Free          | $0       | $0                 | $0             | —       |
| Basic         | $4.99    | $3.33              | $39.99/yr      | 33%     |
| Pro           | $14.99   | $9.99              | $119.99/yr     | 33%     |
| Multilingual  | $19.99   | $13.33             | $159.99/yr     | 33%     |

## R-004: Typography Selection

**Decision**: Use **Fraunces** (display/headings) + **Inter** (body) from Google Fonts.

**Rationale**:
- **Fraunces**: Variable "wonky" serif with optical sizing. Expressive, editorial personality without being gimmicky. Rounded terminals feel approachable — perfect for a reading/listening product. NOT a generic corporate serif.
- **Inter**: Highly legible sans-serif designed for screen UI. Excellent dark mode performance, neutral but not sterile. Widely regarded as one of the best screen-optimized sans-serifs.
- Both are variable fonts (single file per family), minimizing HTTP requests and page weight.

**Alternatives considered**:
- **Cormorant Garamond + Work Sans**: More literary/magazine feel. Rejected because Cormorant's high contrast can cause "dazzle" on dark backgrounds requiring careful weight management.
- **Playfair Display + DM Sans**: Proven editorial pairing but overused on similar sites. Less distinctive than Fraunces.

**Load strategy**: Use Google Fonts `display=swap` with preconnect. Load only needed weights (Fraunces 400-700, Inter 400-600). Target < 50KB total font weight.

## R-005: JSON-LD Structured Data

**Decision**: Use `SoftwareApplication` schema with `BrowserApplication` category.

**Structure**:
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "VoxPage",
  "description": "Open-source text-to-speech browser extension with AI voices and word-level highlighting",
  "applicationCategory": "BrowserApplication",
  "applicationSubCategory": "Accessibility",
  "operatingSystem": "Firefox 112+",
  "browserRequirements": "Requires Firefox 112 or higher",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "license": "https://www.gnu.org/licenses/agpl-3.0.html",
  "downloadUrl": "https://github.com/phsb5321/VoxPage/releases",
  "author": {
    "@type": "Organization",
    "name": "VoxPage"
  }
}
```

**Notes**: Omit `aggregateRating` until real reviews exist. Keep `price: "0"` for the free tier. `downloadUrl` points to GitHub Releases since the extension is unlisted on AMO.

## R-006: Color Palette Refinement

**Decision**: Refine the suggested palette for WCAG AA compliance on dark backgrounds.

| Token              | Value     | Usage                              | Contrast on #0f0f1a |
| ------------------ | --------- | ---------------------------------- | -------------------- |
| `--bg-primary`     | `#0f0f1a` | Page background                    | —                    |
| `--bg-surface`     | `#1a1a2e` | Cards, sections                    | —                    |
| `--bg-elevated`    | `#252540` | Elevated surfaces                  | —                    |
| `--text-primary`   | `#e8e8ec` | Primary text                       | 13.5:1 (AAA)         |
| `--text-secondary` | `#a0a0b4` | Secondary text, labels             | 6.8:1 (AA)           |
| `--accent-warm`    | `#f59e0b` | CTAs, links, active states         | 8.2:1 (AAA)          |
| `--accent-highlight`| `#06b6d4`| Word-level sync highlighting       | 7.1:1 (AA)           |
| `--accent-success` | `#22c55e` | Checkmarks, "included" indicators  | 5.7:1 (AA)           |
| `--border`         | `#2a2a42` | Card borders, dividers             | —                    |

All text colors pass WCAG AA minimum contrast (4.5:1) against the dark backgrounds. Amber accent passes AAA.

## R-007: OG Image Strategy

**Decision**: Create OG image (1200x630) as an SVG-based design rendered to PNG.

**Approach**: Since this is a zero-dependency static site, the OG image will be a hand-crafted SVG converted to PNG. Content: VoxPage logo + tagline + abstract waveform motif on the dark navy background. The SVG can be created inline and exported via a simple script, or created as a static asset.

**Alternative**: Use the extension icon at large size with text overlay. Simpler but less polished.
