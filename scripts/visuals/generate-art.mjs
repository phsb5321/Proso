#!/usr/bin/env node
/**
 * Generate one editorial art asset through the ChatGPT web UI on the server
 * browser fleet, then write the PNG and its provenance sidecar together.
 *
 * The lane, its identity and its failure modes: docs/visual-assets.md.
 * Deterministic brand marks are NOT made here — see specs/161-brand-vector-system.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PROMPTS = resolve(ROOT, 'scripts/visuals/prompts.json');
const ART_DIR = resolve(ROOT, 'packages/site/assets/images/art');
const LANE_TOOL = process.env.PROSO_ART_TOOL ?? 'gpt-image';

function fail(message) {
  console.error(`generate-art: ${message}`);
  process.exit(2);
}

function laneAvailable() {
  return spawnSync('bash', ['-lc', `command -v ${LANE_TOOL}`], { encoding: 'utf8' }).status === 0;
}

function parseArgs(argv) {
  const [id, ...rest] = argv;
  let ref = null;
  let identity = process.env.PROSO_ART_IDENTITY ?? 'chatgpt-c';
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--ref') {
      ref = rest[i + 1] ?? null;
      if (!ref) fail('--ref needs an image path');
      i += 1;
    } else if (rest[i] === '--identity') {
      identity = rest[i + 1] ?? null;
      if (!identity) fail('--identity needs a fleet identity name');
      i += 1;
    } else {
      fail(`unknown argument: ${rest[i]}`);
    }
  }
  return { id, ref, identity };
}

function main() {
  const { id, ref, identity } = parseArgs(process.argv.slice(2));
  if (!id) fail('usage: generate-art.mjs <prompt-id> [--ref <image>]');

  const pack = JSON.parse(readFileSync(PROMPTS, 'utf8'));
  const entry = pack[id];
  if (!entry) {
    fail(`unknown prompt id "${id}" (known: ${Object.keys(pack).join(', ')})`);
  }

  const prompt = [entry.prompt, `Reject and redo rather than include: ${entry.bans}.`].join('\n\n');

  if (!laneAvailable()) {
    fail(
      `${LANE_TOOL} is not on PATH — the art lane only exists on hosts with the fleet shims. ` +
        'See docs/visual-assets.md, or run it from the web-automation repo: ' +
        './bin/web-pull chatgpt generate "<prompt>" --out <dir> --json',
    );
  }

  mkdirSync(ART_DIR, { recursive: true });
  const args = [prompt, '--out', ART_DIR, '--json', '--identity', identity];
  if (ref) args.push('--ref', resolve(ROOT, ref));

  const run = spawnSync(LANE_TOOL, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const stdout = (run.stdout ?? '').trim();
  const stderr = (run.stderr ?? '').trim();
  if (run.error) fail(`could not run ${LANE_TOOL}: ${run.error.message}`);

  let result;
  try {
    result = JSON.parse(stdout);
  } catch {
    try {
      result = JSON.parse(stdout.split('\n').filter(Boolean).pop());
    } catch {
      fail(
        `the lane did not return JSON (exit ${run.status}): ` +
          `${stdout.slice(0, 400) || stderr.slice(0, 400) || '<no output>'}`,
      );
    }
  }
  if (run.status !== 0 || result.status !== 'ok' || !result.path) {
    console.error(JSON.stringify(result, null, 2));
    if (result.status === 'refused') {
      console.error(
        'generate-art: the shared composer held foreign text — another driver is on this identity. ' +
          'Retry later; the lane never forces. (docs/visual-assets.md)',
      );
    }
    process.exit(run.status === 0 ? 1 : run.status);
  }

  const produced = resolve(ART_DIR, result.path);
  if (!existsSync(produced)) fail(`the lane reported ${produced} but it is not there`);

  const extent = (result.format ?? 'png').toLowerCase();
  const target = resolve(ART_DIR, `${id}.${extent}`);
  if (target !== produced) {
    if (existsSync(target)) unlinkSync(target);
    renameSync(produced, target);
  }

  const bytes = readFileSync(target);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const sidecar = {
    id,
    kind: entry.kind ?? 'editorial',
    tool: `${LANE_TOOL} — ChatGPT web UI, fleet identity ${identity}`,
    identity,
    prompt,
    reference: ref ? resolve(ROOT, ref) : null,
    generated_at: new Date().toISOString(),
    format: extent,
    width: result.width ?? null,
    height: result.height ?? null,
    bytes: bytes.byteLength,
    sha256,
    source_url: result.source_url ?? null,
  };
  writeFileSync(`${target}.provenance.json`, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        id,
        path: target,
        identity,
        sha256,
        width: sidecar.width,
        height: sidecar.height,
        bytes: sidecar.bytes,
      },
      null,
      2,
    ),
  );
}

main();
