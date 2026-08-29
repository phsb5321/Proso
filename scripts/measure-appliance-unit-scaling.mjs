/**
 * Measure how synthesis cost scales with request size on the reader's own host.
 *
 * `core/audio/sentence-chunker.ts` dispatches one sentence per request. That
 * policy was chosen against a host measured at RTF 0.195-0.276 (see the module
 * docstring), where per-request overhead was cheap relative to generation. On a
 * host with a large fixed cost per request, the same policy inverts: overhead
 * is paid once per sentence instead of once per paragraph, and sustained RTF
 * can exceed 1.0 — the point at which generation is slower than playback and
 * the reader hears a stall on every unit.
 *
 * This script measures that directly rather than assuming it. It sends units of
 * increasing size SEQUENTIALLY (one in flight, so wall time is generation, not
 * queue waiting) and fits `wall = fixedOverhead + marginal * audioSeconds` by
 * least squares across the samples. `fixedOverhead` is the number that decides
 * whether grouping sentences is worth anything on this host.
 *
 * Read-only and self-contained: it synthesizes its own throwaway prose, writes
 * nothing to the repo, and reads no page or reader data. Every unit carries a
 * unique idempotency key so the host's 900s retention cannot serve a cached
 * response and flatter the measurement.
 *
 * BLOCKED, never skipped-green: an unreachable or unready host exits non-zero.
 *
 * Usage:
 *   LOCAL_HOST_APPLIANCE_URL=http://127.0.0.1:5301 \
 *     node scripts/measure-appliance-unit-scaling.mjs
 */

const BASE_URL = (process.env.LOCAL_HOST_APPLIANCE_URL ?? 'http://127.0.0.1:5301').replace(
  /\/+$/,
  '',
);
const VOICE = process.env.APPLIANCE_VOICE ?? null;
const RUN_ID = process.env.APPLIANCE_RUN_ID ?? `${Date.now()}`;

/**
 * Filler prose, not lorem ipsum: real sentences so the model's tokenizer and
 * prosody see ordinary input. Units are built by taking a prefix of these.
 */
const SENTENCES = [
  'Local narration starts immediately.',
  'A single sentence is the unit this reader dispatches on every chunk today.',
  'Grouping later sentences from the same paragraph into one bounded request lets the model hold its vocal state across the boundary.',
  'The question this measurement answers is whether that grouping buys real throughput on this particular host.',
  'A host with cheap per-request overhead would show almost no difference between the two policies.',
];

/** Unit sizes to sample, in sentences taken from the front of SENTENCES. */
const UNIT_PLAN = [1, 2, 3, 5];

/** Parse duration in seconds from a PCM WAV's own `fmt `/`data` chunks. */
function wavDurationSeconds(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const tag = (at) => String.fromCharCode(...buffer.subarray(at, at + 4));
  if (buffer.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;

  let byteRate = null;
  let cursor = 12;
  while (cursor + 8 <= buffer.byteLength) {
    const id = tag(cursor);
    const size = view.getUint32(cursor + 4, true);
    const body = cursor + 8;
    if (id === 'fmt ' && size >= 16) byteRate = view.getUint32(body + 8, true);
    if (id === 'data') {
      if (!byteRate) return null;
      // Trust the smaller of declared and actual: a streaming WAV can declare
      // u32::MAX, and a truncated body can declare more than it delivered.
      const bytes = Math.min(size, buffer.byteLength - body);
      return bytes / byteRate;
    }
    cursor = body + size + (size % 2);
  }
  return null;
}

async function requireReadyHost() {
  let health;
  try {
    const response = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    health = await response.json();
  } catch (error) {
    throw new Error(`BLOCKED: host ${BASE_URL} is unreachable (${error.message})`);
  }
  if (health?.status !== 'ok' || health?.ready !== true) {
    throw new Error(`BLOCKED: host ${BASE_URL} is not ready: ${JSON.stringify(health)}`);
  }

  const response = await fetch(`${BASE_URL}/v1/capabilities`, {
    signal: AbortSignal.timeout(5000),
  });
  const capabilities = await response.json();
  const voice = VOICE ?? capabilities?.tts?.voices?.[0]?.id;
  if (!voice) throw new Error(`BLOCKED: host ${BASE_URL} publishes no voice to synthesize with`);
  return { health, capabilities, voice };
}

async function synthesize(input, voice, key) {
  const startedAt = performance.now();
  const response = await fetch(`${BASE_URL}/v1/tts`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'audio/wav',
      'Idempotency-Key': key,
    },
    body: JSON.stringify({ input, voice, speed: 1 }),
    signal: AbortSignal.timeout(180_000),
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const wallSeconds = (performance.now() - startedAt) / 1000;
  if (!response.ok) {
    throw new Error(
      `host answered ${response.status}: ${Buffer.from(bytes).toString('utf8', 0, 200)}`,
    );
  }
  const audioSeconds = wavDurationSeconds(bytes);
  if (audioSeconds === null) throw new Error('host response is not a parseable PCM WAV');
  return { wallSeconds, audioSeconds };
}

/** Least-squares fit of wall = fixedOverhead + marginal * audio. */
function fitOverhead(samples) {
  const n = samples.length;
  const sumX = samples.reduce((acc, s) => acc + s.audioSeconds, 0);
  const sumY = samples.reduce((acc, s) => acc + s.wallSeconds, 0);
  const sumXX = samples.reduce((acc, s) => acc + s.audioSeconds ** 2, 0);
  const sumXY = samples.reduce((acc, s) => acc + s.audioSeconds * s.wallSeconds, 0);
  const denominator = n * sumXX - sumX ** 2;
  if (Math.abs(denominator) < 1e-9) return null;
  const marginal = (n * sumXY - sumX * sumY) / denominator;
  return { marginal, fixedOverhead: (sumY - marginal * sumX) / n };
}

async function main() {
  const { health, capabilities, voice } = await requireReadyHost();
  const runtime = capabilities?.runtime ?? {};
  console.log(`host       ${BASE_URL}`);
  console.log(`version    ${health.version ?? 'unpublished'}`);
  console.log(
    `runtime    ${runtime.model ?? 'unpublished'} ${runtime.quantization ?? ''} ` +
      `${runtime.backend ?? ''} ${runtime.device ?? ''}`.trimEnd(),
  );
  console.log(`limits     ${JSON.stringify(capabilities?.limits ?? {})}`);
  console.log(`voice      ${voice}\n`);

  const samples = [];
  let totalWall = 0;
  let totalAudio = 0;
  for (const count of UNIT_PLAN) {
    const input = SENTENCES.slice(0, count).join(' ');
    const utf8Bytes = Buffer.byteLength(input, 'utf8');
    const { wallSeconds, audioSeconds } = await synthesize(
      input,
      voice,
      `unit-scaling-${RUN_ID}-${count}`,
    );
    samples.push({ count, utf8Bytes, wallSeconds, audioSeconds });
    totalWall += wallSeconds;
    totalAudio += audioSeconds;
    console.log(
      `${String(count).padStart(2)} sentence(s)  ${String(utf8Bytes).padStart(4)} B  ` +
        `wall ${wallSeconds.toFixed(2)}s  audio ${audioSeconds.toFixed(2)}s  ` +
        `RTF ${(wallSeconds / audioSeconds).toFixed(3)}`,
    );
  }

  const aggregate = totalWall / totalAudio;
  console.log(`\naggregate sequential RTF  ${aggregate.toFixed(4)}`);

  const fit = fitOverhead(samples);
  if (fit) {
    console.log(
      `fitted model              wall = ${fit.fixedOverhead.toFixed(2)}s + ` +
        `${fit.marginal.toFixed(3)} x audio`,
    );
    console.log(
      fit.fixedOverhead >= 1
        ? `\nPer-request overhead is ${fit.fixedOverhead.toFixed(2)}s. Sentence-granular ` +
            'dispatch pays it once per sentence; grouping amortizes it.'
        : `\nPer-request overhead is ${fit.fixedOverhead.toFixed(2)}s — small enough that ` +
            'sentence-granular dispatch costs little on this host.',
    );
  }

  const worst = samples.reduce((a, b) =>
    a.wallSeconds / a.audioSeconds > b.wallSeconds / b.audioSeconds ? a : b,
  );
  const best = samples.reduce((a, b) =>
    a.wallSeconds / a.audioSeconds < b.wallSeconds / b.audioSeconds ? a : b,
  );
  console.log(
    `smallest unit RTF ${(worst.wallSeconds / worst.audioSeconds).toFixed(3)} ` +
      `(${worst.utf8Bytes} B) vs largest unit RTF ` +
      `${(best.wallSeconds / best.audioSeconds).toFixed(3)} (${best.utf8Bytes} B)`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
