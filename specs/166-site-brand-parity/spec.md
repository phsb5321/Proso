# Feature 166 — Public site brand parity

## Goal

The canonical vector identity shipped to the extension in #161, but the public
site (`packages/site/`) still serves the retired wa-era identity on its two
user-visible asset surfaces: the favicon and the social preview (og-image).
This feature replaces those stale surfaces with assets derived from the
canonical vector pipeline — no new dependency, no hand-redrawn parallel logo —
and extends the deterministic brand gate so planting the retired assets turns
it red.

## Problem (measured, not assumed)

`git diff ff0575f..bb699b3 -- packages/site` is empty: #161 never touched the
site. Measured on main @ bb699b3 (13/08/2026):

- `packages/site/assets/images/favicon.png` — 32×32, dated Feb 18, palette
  white + `#0A317F` ring + teal play triangle (the pre-#161 wa mark). Byte
  compare: `5aa6545e…` ≠ old extension `icon-32` (`4b762294…`) ≠ canonical
  `icon-32` (`e2d7f628…`). It is its own stale asset, unrelated to any
  canonical source.
- `packages/site/assets/images/og-image.svg` — declares the pre-rebrand name
  **"VoxPage"** in a `<text>` element (Georgia font), the retired
  `#0f0f1a`/`#f59e0b`/`#06b6d4` gradient palette, and badge pills with
  `<text>`. It violates every rule the brand vector policy ships
  (no live text, no font, canonical palette only) — and it advertises a
  product name that no longer exists.
- `packages/site/assets/images/og-image.png` — 1200×630 render of that same
  retired SVG.
- All five HTML pages reference `assets/images/favicon.png` (link rel=icon)
  and `assets/images/og-image.png` (og:image + twitter:image). No site
  manifest exists (site `package.json` is an empty checkout configuration —
  preserved).

Every social share of the public site and every browser tab favicon currently
exposes the retired identity. That is the defect this feature fixes.

## Hypothesis

Replacing the favicon and og-image with renders derived from the canonical
sources (extension `icon-32.png` and `brand/svg/proso-lockup-dark.svg`) and
extending `verify-brand-assets.mjs` with site-asset byte/structural checks
makes the retired identity unreachable from the public site, and makes any
future planting of a retired asset fail the deterministic gate.

## Falsifier

Byte/render comparison plus fresh dedicated-profile Firefox and Brave
observation shows every user-visible site identity asset (favicon, og-image,
any manifest) already derives from the canonical assets. If any surface still
exposes retired pixels or a retired name, the hypothesis holds and the PR
proceeds.

## User stories

### US1 — Canonical favicon (P1)

A browser tab showing the public site displays the canonical Proso mark, not
the retired wa mark.

**Independent test:** `packages/site/assets/images/favicon.png` is
byte-identical to `packages/extension/public/icons/icon-32.png` (the canonical
32px render of `band-16.svg`); a fresh Firefox and a fresh Brave profile
loading the site fetch exactly those bytes for `/assets/images/favicon.png`.

### US2 — Canonical social preview (P1)

A link preview of the public site shows the canonical lockup on the canonical
navy background, with no live text, no font, and no retired palette.

**Independent test:** `og-image.svg` passes the brand structural checks
(viewBox 1200×630, palette ⊆ {navy, off-white, spring green}, no `<text>` /
`<image>` / font / filter / script); `og-image.png` byte-matches a fresh
deterministic inkscape render of `og-image.svg`; the composed SVG geometry
derives from `brand/svg/proso-lockup-dark.svg` (the renderer reads the
canonical file, it is not re-authored by hand).

### US3 — Fail-closed gate for site identity (P1)

Planting the retired favicon, the VoxPage og-image, or any untracked site
identity turns `verify-brand-assets.mjs` red.

**Independent test:** a plant fixture swaps in the retired assets (byte
snapshot from pre-#161) and the gate exits non-zero with a named failure;
restoring the canonical assets returns it to zero.

## Out of scope

- Site-wide CSS palette, typography, and layout (the site's design language is
  a separate surface; only the two identity assets are stale).
- Web app manifest (none exists).
- Site deployment, production configuration, Paddle, workflows.
- The popup grant-row visibility anomaly from the #161 gate (separate
  follow-up).

## Acceptance criteria

- `node scripts/verify-brand-assets.mjs` exits 0 on canonical assets.
- The same gate exits non-zero when the retired favicon or the VoxPage
  og-image is planted.
- `make verify` (run stepwise) reaches its end.
- Fresh Firefox + Brave (dedicated profiles only) observations of the static
  site show the canonical favicon bytes and og-image, with receipts.
- Static HTML/CSS/vanilla JS and the site package's empty checkout
  configuration are unchanged.
- `/tmp/proso-166-brand-receipt.md` records hashes, dimensions, browser/build
  identities, actions, exits, and anomalies.
