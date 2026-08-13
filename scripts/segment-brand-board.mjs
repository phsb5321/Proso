#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = resolve(ROOT, 'brand/segments.json');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fail(message) {
  throw new Error(message);
}

function repositoryPath(relativePath) {
  const absolutePath = resolve(ROOT, relativePath);
  if (absolutePath !== ROOT && !absolutePath.startsWith(`${ROOT}/`)) {
    fail(`path escapes repository: ${relativePath}`);
  }
  return absolutePath;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function pngDimensions(buffer, label) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    fail(`${label} is not a valid PNG header`);
  }
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') {
    fail(`${label} has no leading IHDR chunk`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function loadManifest() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  if (manifest.version !== 1) fail(`unsupported manifest version: ${manifest.version}`);
  if (!Array.isArray(manifest.segments) || manifest.segments.length === 0) {
    fail('segment manifest is empty');
  }

  const ids = new Set();
  const outputs = new Set();
  for (const segment of manifest.segments) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment.id)) {
      fail(`invalid segment id: ${segment.id}`);
    }
    if (ids.has(segment.id)) fail(`duplicate segment id: ${segment.id}`);
    if (outputs.has(segment.output)) fail(`duplicate segment output: ${segment.output}`);
    ids.add(segment.id);
    outputs.add(segment.output);

    const { x, y, width, height } = segment.crop;
    for (const [name, value] of Object.entries({ x, y, width, height })) {
      if (
        !Number.isInteger(value) ||
        value < 0 ||
        ((name === 'width' || name === 'height') && value === 0)
      ) {
        fail(`${segment.id} has invalid ${name}: ${value}`);
      }
    }
    if (x + width > manifest.source.width || y + height > manifest.source.height) {
      fail(`${segment.id} crop escapes the source canvas`);
    }
    repositoryPath(segment.output);
  }
  return manifest;
}

function verifySource(manifest) {
  const sourcePath = repositoryPath(manifest.source.path);
  const source = readFileSync(sourcePath);
  const actualHash = sha256(source);
  if (actualHash !== manifest.source.sha256) {
    fail(`source hash mismatch: expected ${manifest.source.sha256}, got ${actualHash}`);
  }
  const dimensions = pngDimensions(source, manifest.source.path);
  if (dimensions.width !== manifest.source.width || dimensions.height !== manifest.source.height) {
    fail(
      `source dimensions mismatch: expected ${manifest.source.width}x${manifest.source.height}, ` +
        `got ${dimensions.width}x${dimensions.height}`,
    );
  }
  return sourcePath;
}

function readSegment(segment, path = repositoryPath(segment.output)) {
  let output;
  try {
    output = readFileSync(path);
  } catch {
    fail(`${segment.output} is missing`);
  }
  const dimensions = pngDimensions(output, segment.output);
  if (dimensions.width !== segment.crop.width || dimensions.height !== segment.crop.height) {
    fail(
      `${segment.output} dimensions mismatch: expected ${segment.crop.width}x${segment.crop.height}, ` +
        `got ${dimensions.width}x${dimensions.height}`,
    );
  }
  return { output, dimensions, sha256: sha256(output) };
}

function verifySegments(manifest) {
  return manifest.segments.map((segment) => {
    const { dimensions, sha256: digest } = readSegment(segment);
    return { id: segment.id, output: segment.output, ...dimensions, sha256: digest };
  });
}

function runCrop(segment, sourcePath, outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  const { x, y, width, height } = segment.crop;
  const result = spawnSync(
    'magick',
    [
      sourcePath,
      '-crop',
      `${width}x${height}+${x}+${y}`,
      '+repage',
      '-depth',
      '8',
      '-strip',
      '-define',
      'png:exclude-chunks=date,time',
      outputPath,
    ],
    { encoding: 'utf8' },
  );
  if (result.error) fail(`ImageMagick failed for ${segment.id}: ${result.error.message}`);
  if (result.status !== 0) {
    fail(
      `ImageMagick failed for ${segment.id}: ${result.stderr.trim() || `exit ${result.status}`}`,
    );
  }
}

function generateSegments(manifest, sourcePath) {
  for (const segment of manifest.segments) {
    runCrop(segment, sourcePath, repositoryPath(segment.output));
  }
}

function verifySegmentContent(manifest, sourcePath, receipts) {
  const expectedDirectory = repositoryPath('brand/.segment-check');
  rmSync(expectedDirectory, { force: true, recursive: true });
  try {
    for (const [index, segment] of manifest.segments.entries()) {
      const expectedPath = resolve(expectedDirectory, `${segment.id}.png`);
      runCrop(segment, sourcePath, expectedPath);
      const expected = readSegment(segment, expectedPath);
      if (expected.sha256 !== receipts[index].sha256) {
        fail(
          `${segment.output} content is stale: expected ${expected.sha256.slice(0, 16)}, ` +
            `got ${receipts[index].sha256.slice(0, 16)}`,
        );
      }
    }
  } finally {
    rmSync(expectedDirectory, { force: true, recursive: true });
  }
}

function printReceipts(receipts, mode) {
  for (const receipt of receipts) {
    console.log(
      `${mode} ${receipt.id}: ${receipt.width}x${receipt.height} ` +
        `${receipt.sha256.slice(0, 16)} ${receipt.output}`,
    );
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    fail('usage: node scripts/segment-brand-board.mjs [--check]');
  }
  const checkOnly = args[0] === '--check';
  const manifest = loadManifest();
  const sourcePath = verifySource(manifest);
  if (!checkOnly) generateSegments(manifest, sourcePath);
  const receipts = verifySegments(manifest);
  if (checkOnly) verifySegmentContent(manifest, sourcePath, receipts);
  printReceipts(receipts, checkOnly ? 'checked' : 'generated');
  console.log(`brand segments: ${receipts.length}/${manifest.segments.length} valid`);
}

try {
  main();
} catch (error) {
  console.error(`brand segments: FAIL — ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
