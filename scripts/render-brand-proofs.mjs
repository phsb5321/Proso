#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROOFS = resolve(ROOT, 'brand/proofs');
const TEMP = resolve(ROOT, 'brand/.proof-render');

function fail(message) {
  throw new Error(message);
}

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' });
  if (result.error) fail(`${label}: ${result.error.message}`);
  if (result.status !== 0) fail(`${label}: ${result.stderr.trim() || result.stdout.trim()}`);
}

function hash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function outputPath(root, relative) {
  const path = resolve(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

function renderSvg(root, { source, output, width, height, background }) {
  const transparent = outputPath(TEMP, `${output}.transparent.png`);
  const destination = outputPath(root, output);
  run(
    'inkscape',
    [
      source,
      `--export-filename=${transparent}`,
      `--export-width=${width}`,
      `--export-height=${height}`,
    ],
    `render ${source}`,
  );
  run(
    'magick',
    [
      transparent,
      '-background',
      background,
      '-alpha',
      'remove',
      '-alpha',
      'off',
      '-depth',
      '8',
      '-strip',
      '-define',
      'png:exclude-chunks=date,time',
      destination,
    ],
    `flatten ${output}`,
  );
}

function writeWordmarkProofSources() {
  const selected = outputPath(TEMP, 'wordmark-selected.svg');
  const legacy = outputPath(TEMP, 'wordmark-legacy.svg');
  writeFileSync(
    selected,
    readFileSync(resolve(ROOT, 'brand/source/proso-wordmark-construction.svg'), 'utf8'),
  );
  writeFileSync(
    legacy,
    readFileSync(
      resolve(ROOT, 'brand/source/archive/proso-wordmark-construction-custom.svg'),
      'utf8',
    ),
  );
  return { selected, legacy };
}

function renderWordmarkDecisions(root) {
  const sources = writeWordmarkProofSources();
  const reference = outputPath(root, 'wordmark/reference.png');
  run(
    'magick',
    [
      'brand/segments/04-wordmark.png',
      '-crop',
      '476x134+39+42',
      '+repage',
      '-depth',
      '8',
      '-strip',
      '-define',
      'png:exclude-chunks=date,time',
      reference,
    ],
    'crop wordmark reference',
  );
  for (const [name, source] of Object.entries(sources)) {
    renderSvg(root, {
      source,
      output: `wordmark/${name}.png`,
      width: 1000,
      height: 293,
      background: '#010616',
    });
  }
  for (const [name, source] of [
    ['waveform-48', 'packages/extension/assets/icons/band-48.svg'],
    ['compact-48', 'packages/extension/assets/icons/band-16.svg'],
  ]) {
    const native = outputPath(root, `wordmark/${name}.png`);
    run(
      'inkscape',
      [source, `--export-filename=${native}`, '--export-width=48', '--export-height=48'],
      `render ${name}`,
    );
    const zoom = outputPath(root, `wordmark/${name}-zoom.png`);
    run(
      'magick',
      [
        native,
        '-filter',
        'point',
        '-resize',
        '384x384',
        '-background',
        '#6B7280',
        '-alpha',
        'background',
        '-depth',
        '8',
        '-strip',
        '-define',
        'png:exclude-chunks=date,time',
        zoom,
      ],
      `zoom ${name}`,
    );
  }
  montage(
    root,
    ['wordmark/reference.png', 'wordmark/selected.png', 'wordmark/legacy.png'],
    'wordmark/wordmark-decisions.png',
    '1x3',
    '1000x300+0+12>',
  );
  montage(
    root,
    ['wordmark/waveform-48-zoom.png', 'wordmark/compact-48-zoom.png'],
    'wordmark/48px-decisions.png',
    '2x1',
    '384x384+12+12',
  );
}

function renderIconProofs(root) {
  for (const size of [16, 48, 128]) {
    const source = `packages/extension/public/icons/icon-${size}.png`;
    const zoom = outputPath(root, `icons/icon-${size}-zoom.png`);
    const blur = outputPath(root, `icons/icon-${size}-blur.png`);
    run(
      'magick',
      [
        source,
        '-background',
        '#6B7280',
        '-alpha',
        'background',
        '-filter',
        'point',
        '-resize',
        '256x256',
        '-depth',
        '8',
        '-strip',
        '-define',
        'png:exclude-chunks=date,time',
        zoom,
      ],
      `zoom icon-${size}`,
    );
    run(
      'magick',
      [
        source,
        '-channel',
        'RGBA',
        '-blur',
        '0x1.2',
        '+channel',
        '-depth',
        '8',
        '-strip',
        '-define',
        'png:exclude-chunks=date,time',
        blur,
      ],
      `blur icon-${size}`,
    );
  }
}

function montage(root, inputs, output, tile, geometry) {
  run(
    'magick',
    [
      'montage',
      ...inputs.map((input) => resolve(root, input)),
      '-tile',
      tile,
      '-geometry',
      geometry,
      '-background',
      '#6B7280',
      '-font',
      'DejaVu-Sans',
      '-label',
      '',
      '-depth',
      '8',
      '-strip',
      '-define',
      'png:exclude-chunks=date,time',
      outputPath(root, output),
    ],
    `montage ${output}`,
  );
}

function renderAll(root) {
  const lockups = [
    ['proso-lockup-dark.svg', 'lockups/dark.png', '#010616'],
    ['proso-lockup-light.svg', 'lockups/light.png', '#F8F8F9'],
    ['proso-lockup-mono-navy.svg', 'lockups/mono-navy.png', '#FFFFFF'],
    ['proso-lockup-mono-white.svg', 'lockups/mono-white.png', '#010616'],
  ];
  for (const [source, output, background] of lockups) {
    renderSvg(root, {
      source: `brand/svg/${source}`,
      output,
      width: 1210,
      height: 320,
      background,
    });
  }
  montage(
    root,
    lockups.map(([, output]) => output),
    'lockups/contact-sheet.png',
    '1x4',
    '+0+12',
  );

  renderSvg(root, {
    source: 'brand/svg/proso-mark-wave-dark.svg',
    output: 'marks/wave-dark.png',
    width: 512,
    height: 320,
    background: '#010616',
  });
  renderSvg(root, {
    source: 'brand/svg/proso-mark-dot-green.svg',
    output: 'marks/dot-green.png',
    width: 360,
    height: 320,
    background: '#010616',
  });
  renderSvg(root, {
    source: 'brand/source/proso-wordmark-construction.svg',
    output: 'marks/wordmark.png',
    width: 1000,
    height: 293,
    background: '#010616',
  });
  montage(
    root,
    ['marks/wave-dark.png', 'marks/dot-green.png', 'marks/wordmark.png'],
    'marks/contact-sheet.png',
    '1x3',
    '1000x360+0+12>',
  );

  renderIconProofs(root);
  montage(
    root,
    ['icons/icon-16-zoom.png', 'icons/icon-48-zoom.png', 'icons/icon-128-zoom.png'],
    'icons/contact-sheet.png',
    '3x1',
    '256x256+12+12',
  );

  renderWordmarkDecisions(root);
}

const EXPECTED = [
  'lockups/dark.png',
  'lockups/light.png',
  'lockups/mono-navy.png',
  'lockups/mono-white.png',
  'lockups/contact-sheet.png',
  'marks/wave-dark.png',
  'marks/dot-green.png',
  'marks/wordmark.png',
  'marks/contact-sheet.png',
  'icons/icon-16-zoom.png',
  'icons/icon-48-zoom.png',
  'icons/icon-128-zoom.png',
  'icons/icon-16-blur.png',
  'icons/icon-48-blur.png',
  'icons/icon-128-blur.png',
  'icons/contact-sheet.png',
  'wordmark/reference.png',
  'wordmark/selected.png',
  'wordmark/legacy.png',
  'wordmark/waveform-48.png',
  'wordmark/compact-48.png',
  'wordmark/waveform-48-zoom.png',
  'wordmark/compact-48-zoom.png',
  'wordmark/wordmark-decisions.png',
  'wordmark/48px-decisions.png',
];

function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    fail('usage: node scripts/render-brand-proofs.mjs [--check]');
  }
  const check = args[0] === '--check';
  rmSync(TEMP, { force: true, recursive: true });
  const target = check ? TEMP : PROOFS;
  try {
    renderAll(target);
    for (const relative of EXPECTED) {
      const generated = resolve(target, relative);
      if (check) {
        const committed = resolve(PROOFS, relative);
        let actual;
        try {
          actual = hash(committed);
        } catch {
          fail(`${relative} is missing`);
        }
        const expected = hash(generated);
        if (actual !== expected)
          fail(
            `${relative} is stale: expected ${expected.slice(0, 16)}, got ${actual.slice(0, 16)}`,
          );
        console.log(`checked ${relative}`);
      } else {
        console.log(`generated ${relative}`);
      }
    }
  } finally {
    rmSync(TEMP, { force: true, recursive: true });
  }
}

try {
  main();
} catch (error) {
  console.error(`brand proofs: FAIL — ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
