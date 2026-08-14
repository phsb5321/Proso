#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SVG_DIR = resolve(ROOT, 'brand/svg');
const ICON_SOURCE_DIR = resolve(ROOT, 'packages/extension/assets/icons');
const ICON_OUTPUT_DIR = resolve(ROOT, 'packages/extension/public/icons');
const WORDMARK_SOURCE = resolve(ROOT, 'brand/source/proso-wordmark-construction.svg');
const SITE_IMAGE_DIR = resolve(ROOT, 'packages/site/assets/images');
const SITE_FAVICON = resolve(SITE_IMAGE_DIR, 'favicon.png');
const SITE_OG_SVG = resolve(SITE_IMAGE_DIR, 'og-image.svg');
const SITE_OG_PNG = resolve(SITE_IMAGE_DIR, 'og-image.png');
const NAVY = '#010616';
const GREEN = '#21F299';
const ALLOWED_COLORS = new Set([NAVY, '#F8F8F9', GREEN, '#FFFFFF']);
const FORBIDDEN = /<(?:image|text|filter|foreignObject|script)\b|@font-face|data:image/iu;

const BRAND_SVGS = [
  'proso-mark-wave-dark.svg',
  'proso-mark-wave-light.svg',
  'proso-mark-dot-green.svg',
  'proso-mark-dot-navy.svg',
  'proso-mark-dot-white.svg',
  'proso-mark-mono-navy.svg',
  'proso-mark-mono-white.svg',
  'proso-wordmark.svg',
  'proso-lockup-dark.svg',
  'proso-lockup-light.svg',
  'proso-lockup-mono-navy.svg',
  'proso-lockup-mono-white.svg',
];

function fail(message) {
  throw new Error(message);
}

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' });
  if (result.error) fail(`${label}: ${result.error.message}`);
  if (result.status !== 0) fail(`${label}: ${result.stderr.trim() || result.stdout.trim()}`);
  return result.stdout.trim();
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function pngDimensions(path) {
  const png = readFileSync(path);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (png.length < 29 || !png.subarray(0, 8).equals(signature)) fail(`${path} is not PNG`);
  if (png.toString('ascii', 12, 16) !== 'IHDR') fail(`${path} has no IHDR`);
  if (png[24] !== 8) fail(`${path} must be 8-bit, got ${png[24]}-bit`);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function ids(svg, filename) {
  const values = [...svg.matchAll(/\bid="([^"]+)"/gu)].map((match) => match[1]);
  const duplicate = values.find((id, index) => values.indexOf(id) !== index);
  if (duplicate) fail(`${filename} has duplicate id ${duplicate}`);
  return new Set(values);
}

function colors(svg, filename) {
  const values = new Set(
    [...svg.matchAll(/\b(?:fill|stroke)="(#[0-9A-Fa-f]{6}|currentColor)"/gu)].map((m) => m[1]),
  );
  for (const value of values) {
    if (value !== 'currentColor' && !ALLOWED_COLORS.has(value.toUpperCase())) {
      fail(`${filename} declares unapproved color ${value}`);
    }
  }
  return values;
}

function assertSvg(filename, path) {
  const svg = readFileSync(path, 'utf8');
  if (!svg.startsWith('<svg ')) fail(`${filename} must start with an SVG root`);
  if (!/\bviewBox="[^"]+"/u.test(svg)) fail(`${filename} has no viewBox`);
  if (!/\brole="img"/u.test(svg) || !/\baria-labelledby="title desc"/u.test(svg)) {
    fail(`${filename} lacks standalone accessibility metadata`);
  }
  if (
    !/<title id="title">[^<]+<\/title>/u.test(svg) ||
    !/<desc id="desc">[^<]+<\/desc>/u.test(svg)
  ) {
    fail(`${filename} lacks title or description text`);
  }
  if (FORBIDDEN.test(svg)) fail(`${filename} contains a prohibited SVG construct`);
  const idSet = ids(svg, filename);
  const colorSet = colors(svg, filename);
  return { svg, idSet, colorSet };
}

function requireIds(filename, idSet, expected) {
  for (const id of expected) if (!idSet.has(id)) fail(`${filename} is missing #${id}`);
}

function assertBrandSvg(filename) {
  const { svg, idSet, colorSet } = assertSvg(filename, resolve(SVG_DIR, filename));
  if (filename.includes('wave') || filename.includes('lockup') || filename.includes('mark-mono')) {
    requireIds(filename, idSet, [
      'bubble-outline',
      'text-pill-primary',
      'text-pill-secondary',
      'waveform-1',
      'waveform-2',
      'waveform-3',
      'waveform-4',
    ]);
  }
  if (filename.includes('dot')) {
    requireIds(filename, idSet, [
      'bubble-outline',
      'bubble-waist-cap',
      'text-pill-primary',
      'text-pill-secondary',
      'voice-dot',
    ]);
  }
  if (filename.includes('wordmark') || filename.includes('lockup')) {
    requireIds(filename, idSet, [
      'p-bowl',
      'p-stem',
      'letter-r',
      'letter-o-1',
      'letter-s',
      'letter-o-2',
    ]);
  }
  if (filename === 'proso-wordmark.svg') {
    if (colorSet.size !== 1 || !colorSet.has('currentColor'))
      fail('wordmark must use currentColor only');
    if (/\bstroke=/u.test(svg)) fail('wordmark must contain outlined fills only');
    const circularArcs = (svg.match(/A514\.5 520/gu) ?? []).length;
    const counterArcs = (svg.match(/A304\.5 314/gu) ?? []).length;
    if (circularArcs !== 3 || counterArcs !== 3) {
      fail(
        `wordmark bowls drifted: expected 3 outer and 3 counter arc declarations, got ${circularArcs}/${counterArcs}`,
      );
    }
  }
}

function geometryHash(svg) {
  const geometry = [...svg.matchAll(/<(?:path|rect|circle)\b[^>]*>/gu)]
    .map((match) =>
      [...match[0].matchAll(/\b(?:d|x|y|width|height|rx|cx|cy|r|stroke-width)="([^"]+)"/gu)]
        .map((attribute) => attribute[0])
        .join(' '),
    )
    .join('|');
  return sha256(geometry);
}

function rawMask(path, expression) {
  const { width, height } = pngDimensions(path);
  const result = spawnSync(
    'magick',
    [
      path,
      '-background',
      '#010616',
      '-alpha',
      'remove',
      '-alpha',
      'off',
      '-fx',
      expression,
      '-threshold',
      '50%',
      '-depth',
      '8',
      'gray:-',
    ],
    { cwd: ROOT, encoding: null, maxBuffer: 8 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0) {
    fail(
      `mask render failed for ${basename(path)}: ${result.error?.message ?? result.stderr.toString()}`,
    );
  }
  if (result.stdout.length !== width * height) {
    fail(
      `mask byte count mismatch for ${basename(path)}: ${result.stdout.length} != ${width * height}`,
    );
  }
  return { pixels: result.stdout, width, height };
}

function components(mask) {
  const { pixels, width, height } = mask;
  const seen = new Uint8Array(width * height);
  const areas = [];
  for (let start = 0; start < pixels.length; start += 1) {
    if (seen[start] || pixels[start] < 128) continue;
    seen[start] = 1;
    const queue = [start];
    let area = 0;
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head];
      area += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (!seen[next] && pixels[next] >= 128) {
            seen[next] = 1;
            queue.push(next);
          }
        }
      }
    }
    areas.push(area);
  }
  return areas.sort((a, b) => b - a);
}

function alphaBoundingBox(path) {
  const { width, height } = pngDimensions(path);
  const result = spawnSync(
    'magick',
    [path, '-alpha', 'extract', '-threshold', '1', '-depth', '8', 'gray:-'],
    { cwd: ROOT, encoding: null, maxBuffer: 8 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0 || result.stdout.length !== width * height) {
    fail(`alpha extraction failed for ${basename(path)}`);
  }
  const mask = { pixels: result.stdout, width, height };
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.pixels[y * mask.width + x] < 128) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [r, g, b] = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

function assertWordmarkSource() {
  const source = readFileSync(WORDMARK_SOURCE, 'utf8');
  if (/scale\(\.1 -\.1\)|scale\([^)]* [^)]*\)/u.test(source)) {
    fail('wordmark source contains a mirrored or non-uniform coordinate transform');
  }
  requireIds('proso-wordmark-construction.svg', ids(source, 'proso-wordmark-construction.svg'), [
    'p-bowl',
    'p-stem',
    'letter-r',
    'letter-o-1',
    'letter-s',
    'letter-o-2',
  ]);
  const directR = /<path id="letter-r" d="M1642\.3[^"]+"\/>/u.test(source);
  const directS = /<path id="letter-s" d="M3312\.4[^"]+"\/>/u.test(source);
  if (!directR || !directS) fail('clean direct r/s wordmark path anchors changed');
  if (!source.includes('V1040H1395V774.4')) fail('letter-r no longer shares the 1040 baseline');
  if (!source.includes('3408.5 1039.8'))
    fail('letter-s no longer shares the 1040 optical baseline');
}

function assertIcons() {
  const sources = ['band-16.svg', 'band-48.svg', 'band-128.svg'];
  const hashes = new Set();
  for (const filename of sources) {
    const { svg } = assertSvg(filename, resolve(ICON_SOURCE_DIR, filename));
    hashes.add(geometryHash(svg));
  }
  if (hashes.size !== sources.length) fail('optical icon bands share normalized geometry');

  const expected = new Map([
    [16, { source: 16, green: [2], ink: null, bbox: '14x14+1+1' }],
    [32, { source: 16, green: null, ink: null, bbox: '28x28+2+2' }],
    [48, { source: 48, green: [6], ink: [1], bbox: '46x46+1+1' }],
    [96, { source: 48, green: null, ink: null, bbox: '92x92+2+2' }],
    [128, { source: 128, green: [6], ink: [1], bbox: '120x120+4+4' }],
  ]);
  for (const [size, rule] of expected) {
    const path = resolve(ICON_OUTPUT_DIR, `icon-${size}.png`);
    const dimensions = pngDimensions(path);
    if (dimensions.width !== size || dimensions.height !== size)
      fail(`icon-${size}.png has wrong dimensions`);
    const bbox = alphaBoundingBox(path);
    const bboxText = `${bbox.width}x${bbox.height}+${bbox.x}+${bbox.y}`;
    if (bboxText !== rule.bbox) fail(`icon-${size}.png bbox ${bboxText} != ${rule.bbox}`);
    if (rule.green) {
      const areas = components(rawMask(path, 'g>0.55&&g>r+0.25?1:0')).filter((area) => area >= 2);
      if (areas.length !== rule.green[0])
        fail(`icon-${size}.png has ${areas.length} green components, expected ${rule.green[0]}`);
      if (size === 16 && Math.min(...areas) < 6)
        fail('icon-16 voice dot has fewer than 6 core pixels');
    }
    if (rule.ink) {
      const areas = components(rawMask(path, 'r>0.45&&g>0.45&&b>0.45?1:0')).filter(
        (area) => area >= 2,
      );
      if (areas.length !== rule.ink[0])
        fail(`icon-${size}.png has ${areas.length} ink components, expected ${rule.ink[0]}`);
    }
  }
}

function assertDeterministicIcons() {
  const paths = [16, 32, 48, 96, 128].map((size) => resolve(ICON_OUTPUT_DIR, `icon-${size}.png`));
  const before = paths.map((path) => sha256(readFileSync(path)));
  run('pnpm', ['--filter', '@proso/extension', 'icons:generate'], 'first icon generation');
  const first = paths.map((path) => sha256(readFileSync(path)));
  run('pnpm', ['--filter', '@proso/extension', 'icons:generate'], 'second icon generation');
  const second = paths.map((path) => sha256(readFileSync(path)));
  if (before.some((hash, index) => hash !== first[index])) fail('committed icon PNGs were stale');
  if (first.some((hash, index) => hash !== second[index]))
    fail('icon generation is nondeterministic');
}

/**
 * Site identity assets must be freshness-bound to the canonical sources.
 *
 * Feature 166 replaced the retired wa-era favicon and the pre-rebrand og-image
 * with derivatives of the canonical pipeline. These checks make that
 * permanent: the favicon must be byte-identical to the canonical 32px mark,
 * the og-image must be the canonical lockup composed on the navy canvas (no
 * live text, no font, canonical palette only), and every committed site asset
 * must byte-match a fresh derivation (run first, so drift is caught even if
 * the structural assertions below were never reached).
 */
function assertSiteAssets() {
  run('node', ['scripts/render-site-brand-assets.mjs', '--check'], 'site asset freshness gate');

  const favicon = readFileSync(SITE_FAVICON);
  const canonicalIcon32 = readFileSync(resolve(ICON_OUTPUT_DIR, 'icon-32.png'));
  if (!favicon.equals(canonicalIcon32)) {
    fail('site favicon is not byte-identical to canonical icon-32.png');
  }

  const ogSvg = readFileSync(SITE_OG_SVG, 'utf8');
  const { idSet } = assertSvg('og-image.svg', SITE_OG_SVG);
  if (!/viewBox="0 0 1200 630"/u.test(ogSvg)) {
    fail('og-image.svg must declare a 1200x630 composition viewBox');
  }
  if (!idSet.has('site-lockup')) fail('og-image.svg must wrap the canonical lockup group');
  if (!idSet.has('canvas')) fail('og-image.svg must declare the navy canvas rect');
  requireIds('og-image.svg', idSet, [
    'bubble-outline',
    'text-pill-primary',
    'text-pill-secondary',
    'waveform-1',
    'waveform-2',
    'waveform-3',
    'waveform-4',
    'p-bowl',
    'p-stem',
    'letter-r',
    'letter-o-1',
    'letter-s',
    'letter-o-2',
  ]);

  const ogPng = pngDimensions(SITE_OG_PNG);
  if (ogPng.width !== 1200 || ogPng.height !== 630) {
    fail(`og-image.png must be exactly 1200x630, got ${ogPng.width}x${ogPng.height}`);
  }
}

function main() {
  run('node', ['scripts/segment-brand-board.mjs', '--check'], 'segment gate');
  run('node', ['scripts/generate-brand-vectors.mjs', '--check'], 'vector freshness gate');
  run('node', ['scripts/render-brand-proofs.mjs', '--check'], 'proof freshness gate');
  for (const filename of BRAND_SVGS) assertBrandSvg(filename);
  assertWordmarkSource();
  assertDeterministicIcons();
  assertIcons();
  assertSiteAssets();

  const greenOnNavy = contrast(GREEN, NAVY);
  const navyOnWhite = contrast(NAVY, '#FFFFFF');
  if (greenOnNavy < 3 || navyOnWhite < 3) fail('brand contrast floor failed');

  console.log(`brand SVGs: ${BRAND_SVGS.length}/${BRAND_SVGS.length} structurally valid`);
  console.log('optical icons: independent 16/48/128 sources; native topology valid');
  console.log(
    `contrast: green/navy ${greenOnNavy.toFixed(2)}:1; navy/white ${navyOnWhite.toFixed(2)}:1`,
  );
  console.log('site assets: favicon canonical; og-image canonical lockup on navy');
  console.log('brand assets: PASS');
}

try {
  main();
} catch (error) {
  console.error(`brand assets: FAIL — ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
