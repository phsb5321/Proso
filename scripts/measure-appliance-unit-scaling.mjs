/**
 * Measure how synthesis cost scales with request size on the reader's own host.
 *
 * `core/audio/sentence-chunker.ts` dispatches one sentence per request. That
 * policy was chosen against a host measured at RTF 0.195-0.276 (see the module
 * docstring), where per-request overhead was cheap relative to generation. On a
 * host with a large fixed cost per request, the same policy inverts: overhead
 * is paid once per sentence instead of once per paragraph, and sustained RTF
 * can approach or exceed 1.0 — the point at which the reader stops staying
 * comfortably ahead of playback.
 *
 * This script measures that rather than assuming it, and is deliberately built
 * against the ways such a measurement goes wrong:
 *
 * - **Only in-bound units.** Every unit stays within the host's published
 *   `limits.maxTextUtf8Bytes`. An oversize request measures the host's internal
 *   defensive split, not the client-side policy this is meant to inform.
 * - **Repeated samples, randomized order.** Sizes are sampled REPEATS times
 *   each in a seeded shuffle, so a monotonic warm-up trend cannot masquerade as
 *   a size effect. Per-size RTF is reported as a median with observed spread.
 * - **A discarded warm-up.** The first request pays model/GPU warm-up and is
 *   thrown away rather than fitted.
 * - **No cache hits.** Every request carries a unique idempotency key, so the
 *   host's retention window cannot serve a prior response and flatter a sample.
 *
 * The fit is `wall = fixedOverhead + marginal * audioSeconds`, computed by
 * least squares over the per-size medians. `fixedOverhead` is the number that
 * decides whether grouping sentences buys anything on this host. The fit is
 * reported with its residuals and R^2 so a poor fit is visible rather than
 * implied — with few distinct sizes it is a summary, not a law.
 *
 * Read-only and self-contained: it synthesizes its own throwaway prose, writes
 * nothing to the repo, and reads no page or reader data.
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
const REPEATS = Number(process.env.APPLIANCE_REPEATS ?? 3);
const SEED = Number(process.env.APPLIANCE_SEED ?? 20260829);

/**
 * Target unit sizes in UTF-8 bytes. Chosen to bracket the two policies under
 * comparison: ~40-90 B is what one-sentence dispatch produces for ordinary
 * prose, ~150-290 B is what bounded grouping produces. All are clamped below
 * the host's published ceiling at runtime.
 */
const TARGET_SIZES = [40, 85, 150, 220, 290];

/** Ordinary prose, so the tokenizer and prosody see realistic input. */
const CORPUS =
  'Local narration starts immediately. A single sentence is the unit this reader ' +
  'dispatches on every chunk today. Grouping later sentences from the same paragraph ' +
  'into one bounded request lets the model hold its vocal state across the boundary. ' +
  'The question this measurement answers is whether that grouping buys real throughput ' +
  'on this particular host. A host with cheap per-request overhead would show almost no ' +
  'difference between the two policies, and the chunking rule could be left alone.';

/** Deterministic PRNG so a run is reproducible from its seed. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Prefix of CORPUS at a whole-word boundary, at most `bytes` UTF-8 bytes. */
function unitOfSize(bytes) {
  const words = CORPUS.split(' ');
  let text = '';
  for (const word of words) {
    const candidate = text ? `${text} ${word}` : word;
    if (Buffer.byteLength(candidate, 'utf8') > bytes) break;
    text = candidate;
  }
  return text;
}

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
    const detail = Buffer.from(bytes).toString('utf8', 0, 200);
    throw new Error(`host answered ${response.status}: ${detail}`);
  }
  const audioSeconds = wavDurationSeconds(bytes);
  if (audioSeconds === null) throw new Error('host response is not a parseable PCM WAV');
  return { wallSeconds, audioSeconds };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Least-squares fit of wall = fixedOverhead + marginal * audio, with R^2. */
function fitOverhead(points) {
  const n = points.length;
  if (n < 3) return null;
  const sumX = points.reduce((acc, p) => acc + p.audioSeconds, 0);
  const sumY = points.reduce((acc, p) => acc + p.wallSeconds, 0);
  const sumXX = points.reduce((acc, p) => acc + p.audioSeconds ** 2, 0);
  const sumXY = points.reduce((acc, p) => acc + p.audioSeconds * p.wallSeconds, 0);
  const denominator = n * sumXX - sumX ** 2;
  if (Math.abs(denominator) < 1e-9) return null;

  const marginal = (n * sumXY - sumX * sumY) / denominator;
  const fixedOverhead = (sumY - marginal * sumX) / n;
  const meanY = sumY / n;
  const residuals = points.map((p) => p.wallSeconds - (fixedOverhead + marginal * p.audioSeconds));
  const ssResidual = residuals.reduce((acc, r) => acc + r ** 2, 0);
  const ssTotal = points.reduce((acc, p) => acc + (p.wallSeconds - meanY) ** 2, 0);
  const rSquared = ssTotal < 1e-9 ? null : 1 - ssResidual / ssTotal;
  return { marginal, fixedOverhead, residuals, rSquared };
}

async function main() {
  const { health, capabilities, voice } = await requireReadyHost();
  const runtime = capabilities?.runtime ?? {};
  const publishedCeiling = capabilities?.limits?.maxTextUtf8Bytes ?? null;

  console.log(`host       ${BASE_URL}`);
  console.log(`version    ${health.version ?? 'unpublished'}`);
  console.log(
    `runtime    ${runtime.model ?? 'unpublished'} ${runtime.quantization ?? ''} ` +
      `${runtime.backend ?? ''} ${runtime.device ?? ''}`.trimEnd(),
  );
  console.log(`limits     ${JSON.stringify(capabilities?.limits ?? {})}`);
  console.log(`voice      ${voice}`);
  console.log(
    `sampling   ${REPEATS}x per size, seeded shuffle (seed ${SEED}), 1 warm-up discarded`,
  );

  // Only in-bound units: an oversize request measures the host's defensive
  // split, not the client policy this informs.
  const sizes = TARGET_SIZES.filter(
    (size) => publishedCeiling === null || size <= publishedCeiling,
  );
  const skipped = TARGET_SIZES.filter((size) => !sizes.includes(size));
  if (skipped.length > 0) {
    console.log(`skipped    ${skipped.join(', ')} B — above published ceiling ${publishedCeiling}`);
  }
  if (sizes.length < 3) throw new Error('BLOCKED: fewer than 3 in-bound sizes to compare');
  console.log('');

  const random = mulberry32(SEED);
  const schedule = sizes.flatMap((size) => Array.from({ length: REPEATS }, () => size));
  for (let i = schedule.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [schedule[i], schedule[j]] = [schedule[j], schedule[i]];
  }

  await synthesize(unitOfSize(sizes[0]), voice, `unit-scaling-${RUN_ID}-warmup`);

  const observations = new Map(sizes.map((size) => [size, []]));
  for (const [index, size] of schedule.entries()) {
    const input = unitOfSize(size);
    const sample = await synthesize(input, voice, `unit-scaling-${RUN_ID}-${index}`);
    observations.get(size).push({ ...sample, utf8Bytes: Buffer.byteLength(input, 'utf8') });
  }

  const points = [];
  for (const size of sizes) {
    const samples = observations.get(size);
    const rtfs = samples.map((s) => s.wallSeconds / s.audioSeconds);
    const point = {
      utf8Bytes: samples[0].utf8Bytes,
      wallSeconds: median(samples.map((s) => s.wallSeconds)),
      audioSeconds: median(samples.map((s) => s.audioSeconds)),
      medianRtf: median(rtfs),
      minRtf: Math.min(...rtfs),
      maxRtf: Math.max(...rtfs),
    };
    points.push(point);
    console.log(
      `${String(point.utf8Bytes).padStart(4)} B  median wall ${point.wallSeconds.toFixed(2)}s  ` +
        `audio ${point.audioSeconds.toFixed(2)}s  RTF ${point.medianRtf.toFixed(3)} ` +
        `[${point.minRtf.toFixed(3)}-${point.maxRtf.toFixed(3)}]`,
    );
  }

  const smallest = points[0];
  const largest = points[points.length - 1];
  console.log(
    `\nsmallest unit (${smallest.utf8Bytes} B) median RTF ${smallest.medianRtf.toFixed(3)}  vs  ` +
      `largest in-bound unit (${largest.utf8Bytes} B) median RTF ${largest.medianRtf.toFixed(3)}`,
  );

  const fit = fitOverhead(points);
  if (fit) {
    console.log(
      `fitted model  wall = ${fit.fixedOverhead.toFixed(2)}s + ${fit.marginal.toFixed(3)} x audio` +
        `${fit.rSquared === null ? '' : `  (R^2 ${fit.rSquared.toFixed(3)})`}`,
    );
    console.log(`residuals     ${fit.residuals.map((r) => r.toFixed(2)).join(', ')} s`);
    console.log(
      fit.fixedOverhead >= 1
        ? `\nPer-request overhead is ${fit.fixedOverhead.toFixed(2)}s on this run. ` +
            'Sentence-granular dispatch pays it once per sentence; grouping amortizes it.'
        : `\nPer-request overhead is ${fit.fixedOverhead.toFixed(2)}s on this run — small enough ` +
            'that sentence-granular dispatch costs little on this host.',
    );
    console.log(
      `${points.length} distinct sizes is a summary of this run, not an established constant. ` +
        'Re-run with a different seed before relying on the coefficients.',
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
