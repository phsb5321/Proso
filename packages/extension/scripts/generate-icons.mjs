#!/usr/bin/env node
/**
 * Proso icon generator — SVG source of truth → PNG build artifacts.
 *
 * Why this exists: public/icons/*.png were committed mystery binaries with no
 * regenerable source (Feb 2026, no SVG in repo), so the toolbar icon rotted
 * for six months while docs/research/icon-design-conventions.md sat unread.
 * This script makes the SVG the source and the PNGs reproducible output.
 *
 * Optical sizing (three drawings, never one scaled):
 *   band-16.svg  → icon-16.png (1x) + icon-32.png (2x)
 *   band-48.svg  → icon-48.png (1x) + icon-96.png (2x)
 *   band-128.svg → icon-128.png (store listing)
 *
 * Usage: pnpm --filter @proso/extension icons:generate
 * Output: packages/extension/public/icons/icon-{16,32,48,96,128}.png
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimize } from 'svgo';
import { Resvg } from '@resvg/resvg-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = join(HERE, '..');
const SRC = join(EXT, 'assets', 'icons');
const OUT = join(EXT, 'public', 'icons');

// Band → [(png size, scale source to), ...]. 2x renders are integer upscales
// of the band drawing, so whole-pixel geometry is preserved by construction.
const BANDS = [
  { svg: 'band-16.svg', sizes: [16, 32] },
  { svg: 'band-48.svg', sizes: [48, 96] },
  { svg: 'band-128.svg', sizes: [128] },
];

// SVGO preset tuned for icon assets: keep the viewBox and dimensions (resvg
// needs both), keep gradient defs for band-128.
const SVGO_CONFIG = {
  multipass: true,
  plugins: [
    'preset-default',
    { name: 'removeViewBox', active: false },
    { name: 'removeDimensions', active: false },
  ],
};

function render(svgText, size) {
  const resvg = new Resvg(svgText, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  });
  return resvg.render().asPng();
}

export function generateIcons() {
  mkdirSync(OUT, { recursive: true });
  const receipts = [];
  for (const band of BANDS) {
    const raw = readFileSync(join(SRC, band.svg), 'utf8');
    const { data: minified } = optimize(raw, { path: band.svg, ...SVGO_CONFIG });
    for (const size of band.sizes) {
      const png = render(minified, size);
      const outPath = join(OUT, `icon-${size}.png`);
      writeFileSync(outPath, png);
      receipts.push({ size, svg: band.svg, bytes: png.length });
    }
  }
  return receipts;
}

// Freshness gate: fail if any PNG is missing or older than its band source
// (the rot detector — a stale binary with a newer SVG means regeneration was
// skipped, which is exactly how the old icon died).
export function checkIconsFresh() {
  const stale = [];
  for (const band of BANDS) {
    const src = join(SRC, band.svg);
    let srcMtime;
    try {
      srcMtime = statSync(src).mtimeMs;
    } catch {
      stale.push(`${src} is MISSING`);
      continue;
    }
    for (const size of band.sizes) {
      const png = join(OUT, `icon-${size}.png`);
      let pngMtime;
      try {
        pngMtime = statSync(png).mtimeMs;
      } catch {
        stale.push(`${png} is MISSING`);
        continue;
      }
      if (pngMtime < srcMtime) {
        stale.push(`${png} is stale vs ${band.svg}`);
      }
    }
  }
  return stale;
}

const [, , arg] = process.argv;
if (import.meta.url === `file://${process.argv[1]}` || arg === '--run') {
  const receipts = generateIcons();
  for (const r of receipts) {
    console.log(`icon-${r.size}.png ← ${r.svg} (${r.bytes} bytes)`);
  }
  const stale = checkIconsFresh();
  if (stale.length > 0) {
    console.error('FRESHNESS FAIL:\n' + stale.join('\n'));
    process.exit(1);
  }
  console.log('all icons fresh');
}

// --check mode: verify freshness only (used by the CI/verify gate).
if (arg === '--check') {
  const stale = checkIconsFresh();
  if (stale.length > 0) {
    console.error('FRESHNESS FAIL:\n' + stale.join('\n'));
    process.exit(1);
  }
  console.log('icons: all PNGs present and newer than their band SVGs');
}
