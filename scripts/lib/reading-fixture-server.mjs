/**
 * Deterministic article + Proso API stub for the reading smoke.
 *
 * Serves one fixed article over http://127.0.0.1 so the extension's real
 * extractor has real DOM to work on, and answers `/api/v1/tts/synthesize` with
 * a real MP3 body so the real server-TTS adapter and audio pipeline run. Every
 * synthesize call is recorded, which is what lets the smoke assert that a
 * non-empty TTS request actually left the extension.
 *
 * The same server also speaks the reader-operated synthesis host's wire
 * contract (`/v1/capabilities`, `/v1/tts`) so the local-host journey can be
 * driven without a machine on the tailnet. The two surfaces record into
 * separate arrays: `requests` is the managed server route, `localRequests` is
 * the reader's own host. Which array a run fills is the whole question behind
 * PROSO-135/136/137 — a provider that silently stayed on the server route is
 * what produced two days of 402s.
 *
 * @module scripts/lib/reading-fixture-server
 */

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Mirror of the production CORS contract
 * (`packages/server/src/infrastructure/config/cors.config.ts`). Kept as a
 * literal because this is a plain `.mjs` script and the server source is
 * TypeScript; `cors-exposed-headers.spec.ts` is what pins the server side.
 */
const CORS = {
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-License-Key'],
  exposedHeaders: ['X-Credits-Used', 'X-Credits-Remaining', 'X-Cache-Hit', 'X-Provider'],
};

/** Two clips whose boundary makes sentence-level synchronization observable. */
export const WORD_SYNC_SENTENCES = [
  'Sentence timing starts with these spoken words.',
  'Boundary alignment now moves into the second sentence ├ without jumping backward └.',
];

/** Paragraphs the smoke asserts on. Long enough for the production extractor. */
export const ARTICLE_PARAGRAPHS = [
  WORD_SYNC_SENTENCES.join(' '),
  'A reliable reader must also let people pause, resume, change speed, and move between paragraphs without ever losing their place.',
  'This third paragraph makes the fixture article long enough for the production extraction heuristic and confirms ordered navigation works.',
];

export const ARTICLE_TITLE = 'Reading Outcome Spine Fixture';
export const STALE_PROSO_ARTIFACT_COUNT = 22;

/**
 * The shape a reader reported silently skipped: a paragraph that ends in a
 * colon, the list it introduces, and the paragraph that refers back to it. The
 * items are one word each, which is the normal case for a list like this and
 * the reason a length filter cannot be what admits them.
 */
export const ARTICLE_LIST_LEAD_IN = 'The reading pipeline runs in five ordered stages:';
export const ARTICLE_LIST_ITEMS = ['Generate', 'Store', 'Ingest', 'Transform', 'Serve'];
export const ARTICLE_LIST_FOLLOW_UP =
  'The undercurrents running underneath all five stages are where most of the real work happens, which is why the list above has to be spoken rather than skipped.';

/**
 * Page chrome that is also `<li>`. None of it may reach the reader, which is
 * the assertion that stops "read the list" from becoming "read the menu".
 */
export const ARTICLE_NAV_ITEMS = ['Home', 'Guides', 'Archive', 'About'];
export const ARTICLE_FOOTER_ITEMS = ['Privacy policy', 'Terms of use', 'Cookie settings'];

const firstParagraphRemainder = ARTICLE_PARAGRAPHS[0].slice('Sentence'.length);
const articleParagraphsHtml = ARTICLE_PARAGRAPHS.map((text, index) =>
  index === 0
    ? `<p class="proso-highlight" data-proso-index="0"><span class="proso-w proso-w--active"><span class="proso-w proso-w--glow">Sentence</span></span>${firstParagraphRemainder}</p>`
    : `<p>${text}</p>`,
).join('\n');
const staleFooterRoots = Array.from(
  { length: STALE_PROSO_ARTIFACT_COUNT },
  () => '<div id="proso-sticky-footer"></div>',
).join('\n');

const listHtml = (items) => `<ul>${items.map((text) => `<li>${text}</li>`).join('')}</ul>`;
const linkListHtml = (items) =>
  `<ul>${items
    .map((text) => `<li><a href="/${encodeURIComponent(text)}">${text}</a></li>`)
    .join('')}</ul>`;

/**
 * @param {{listInNav?: boolean}} options `listInNav` moves the article's own
 *   list into the page navigation. The reading must lose it — that is the
 *   plant proving the landmark guard, and the gate's list assertion, are both
 *   load-bearing.
 */
function articleHtml(options = {}) {
  const listInNav = options.listInNav === true;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${ARTICLE_TITLE}</title>
</head>
<body style="padding-bottom: ${STALE_PROSO_ARTIFACT_COUNT * 80}px">
${staleFooterRoots}
<nav aria-label="Primary">
${linkListHtml(ARTICLE_NAV_ITEMS)}
${listInNav ? listHtml(ARTICLE_LIST_ITEMS) : ''}
</nav>
<article>
<h1>${ARTICLE_TITLE}</h1>
${articleParagraphsHtml}
<p>${ARTICLE_LIST_LEAD_IN}</p>
${listInNav ? '' : listHtml(ARTICLE_LIST_ITEMS)}
<p>${ARTICLE_LIST_FOLLOW_UP}</p>
<a id="open-companion-tab" href="/article?tab=second" target="_blank" rel="noopener">Open companion article</a>
</article>
<footer>
${linkListHtml(ARTICLE_FOOTER_ITEMS)}
</footer>
</body>
</html>
`;
}

/**
 * A short real MP3 so the audio element has something decodable to play.
 * Reuses the tracked extension audio fixture rather than adding another blob.
 */
function audioFixture() {
  return readFileSync(
    path.join(here, '../../packages/extension/tests/fixtures/audio/short-speech.mp3'),
  );
}

/**
 * Voices the synthesis host publishes, mirroring the appliance's own list
 * (`markKinds: []` — the host emits no word marks, so the adapter must never
 * return word timings). Language matching is on the primary subtag, so an
 * English article reaches `en-US` here exactly as it does on the real host.
 */
export const LOCAL_HOST_VOICES = [
  { id: 'en_US-ljspeech-medium', language: 'en-US', mediaTypes: ['audio/wav'], markKinds: [] },
  { id: 'pt_BR-faber-medium', language: 'pt-BR', mediaTypes: ['audio/wav'], markKinds: [] },
];

/** The host's published input bound, in UTF-8 bytes. */
export const LOCAL_HOST_MAX_TEXT_UTF8_BYTES = 2000;

/**
 * The one key this fixture treats as a sold licence. Any other key is answered
 * the way the real server answers an unknown one — `{valid:false, tier:'free'}`
 * (INV-001, `license-validation.service.ts:39-47`) — so a gate that accepts
 * anything at all is caught here rather than in production.
 */
export const PAID_LICENSE_KEY = 'test-licence-key-4c2a';

/**
 * A second otherwise-valid key whose authenticated subscription readback is
 * deliberately unavailable. It exercises rollback after the live client has
 * already adopted a candidate, without changing fixture state mid-journey.
 */
export const INTERRUPTED_LICENSE_KEY = ['test', 'interrupted', 'licence', '5000'].join('-');

/** The plan the fixture sells, mirroring `TIER_CREDITS[Pro] = 500_000`. */
export const PAID_LICENSE_PLAN = {
  tier: 'pro',
  status: 'active',
  credits: { total: 500_000, remaining: 412_500, usagePercent: 17.5 },
  features: { managedTts: true, premiumVoices: true, prioritySupport: false },
};

const FREE_PLAN = {
  tier: 'free',
  status: 'active',
  credits: { total: 0, remaining: 0, usagePercent: 0 },
  features: { managedTts: false, premiumVoices: false, prioritySupport: false },
};

/**
 * Synthesize silence as a real RIFF/WAVE buffer.
 *
 * The adapter reads duration from the `fmt ` byte rate and the `data` chunk
 * size, so the header has to be genuine — a fake body would be rejected as
 * `appliance_invalid_response`, which is a different failure from the one this
 * fixture exists to exercise. 16-bit mono at 16 kHz matches the appliance's
 * own output format. Duration tracks input length the way real synthesis does,
 * so a sentence yields seconds of audio rather than an instant clip that ends
 * before pause and resume can be observed.
 */
export function fixtureAudioDurationMs(text) {
  return Math.min(12, Math.max(1.2, text.length * 0.04)) * 1000;
}

function wavForText(text) {
  const sampleRate = 16_000;
  const bytesPerSample = 2;
  const seconds = fixtureAudioDurationMs(text) / 1000;
  const frames = Math.round(sampleRate * seconds);
  const dataBytes = frames * bytesPerSample;

  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // PCM fmt chunk size
  buffer.writeUInt16LE(1, 20); // audio format: PCM
  buffer.writeUInt16LE(1, 22); // channels
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  // Samples stay zero: the gate mutes output anyway, and silence keeps the
  // fixture deterministic byte-for-byte for a given input length.
  return buffer;
}

/** RFC-9457 problem document, the only error shape the host produces. */
function problem(res, status, code, detail) {
  const body = JSON.stringify({ type: `about:blank#${code}`, title: code, status, code, detail });
  res.writeHead(status, { 'Content-Type': 'application/problem+json' });
  res.end(body);
}

/**
 * Start the fixture server.
 *
 * `localHostVoices` lets plant suites prove the real-host gate against a host
 * whose catalog differs from the Orange Pi fixture, including an empty catalog.
 *
 * @param {{audio?: Buffer, audioContentType?: string, licenseMode?: string, localHostVoices?: Array<object>, localHostDelayMs?: number, localHostFailFirstVoice?: string, listInNav?: boolean}} options
 * @returns {Promise<{origin: string, requests: Array<object>, close: () => Promise<void>}>}
 */
export async function startFixtureServer(options = {}) {
  const requests = [];
  const localRequests = [];
  /** Every call to the public validation route, with the body it carried. */
  const licenseRequests = [];
  /** Every call to the authenticated subscription route, with its header. */
  const subscriptionRequests = [];
  const audio = options.audio ?? audioFixture();

  /**
   * How the licence surface behaves. `sold` is the product's intended
   * behavior; the others are the plants the licence gate has to catch.
   *
   *   sold              the paid key validates and the subscription confirms Pro.
   *   unknown-key       every key is answered `{valid:false, tier:'free'}`.
   *   subscription-free validation says Pro, the subscription route says Free.
   *   subscription-no-credits validation says Pro, but readback omits credits.
   *   validate-500      the validation route fails outright.
   */
  const licenseMode = options.licenseMode ?? 'sold';
  const localHostVoices = options.localHostVoices ?? LOCAL_HOST_VOICES;
  const localHostDelayMs = Math.max(0, options.localHostDelayMs ?? 0);
  const article = articleHtml({ listInNav: options.listInNav === true });

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    // The extension declares no host permission for the API origin, so every
    // call it makes is a real cross-origin request. Mirror the production
    // `app.enableCors()` config (packages/server/src/infrastructure/config/
    // cors.config.ts) rather than blanket-allowing: a fixture that is more
    // permissive than production would let the smoke pass on a contract the
    // real server does not offer.
    const corsHeaders = {
      'Access-Control-Allow-Origin': req.headers.origin ?? '*',
      'Access-Control-Allow-Methods': CORS.methods.join(','),
      'Access-Control-Allow-Headers': CORS.allowedHeaders.join(','),
      'Access-Control-Expose-Headers': CORS.exposedHeaders.join(','),
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    if (url.pathname === '/article') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(article);
      return;
    }

    if (url.pathname === '/api/v1/tts/synthesize' && req.method === 'POST') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try {
          body = JSON.parse(raw);
        } catch {
          body = { parseError: raw.slice(0, 200) };
        }
        requests.push({ at: Date.now(), body, licenseKey: req.headers['x-license-key'] ?? null });
        res.writeHead(200, {
          ...corsHeaders,
          'Content-Type': options.audioContentType ?? 'audio/mpeg',
          'Content-Length': String(audio.length),
          'X-Cache-Hit': 'false',
          'X-Credits-Used': '1',
          'X-Credits-Remaining': '41',
          'X-Provider': 'openai',
        });
        res.end(audio);
      });
      return;
    }

    // ---- reader-operated synthesis host surface (PROSO-110) ----
    // Deliberately NOT CORS-enabled: the real host publishes no CORS headers,
    // and the extension reaches it through the host permission the reader
    // grants. A fixture that allowed the origin outright would let the journey
    // pass without the grant that makes it work in the product.
    if (url.pathname === '/v1/capabilities' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ready: true,
          limits: { maxTextUtf8Bytes: LOCAL_HOST_MAX_TEXT_UTF8_BYTES },
          tts: { voices: localHostVoices },
        }),
      );
      return;
    }

    if (url.pathname === '/v1/tts' && req.method === 'POST') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try {
          body = JSON.parse(raw);
        } catch {
          problem(res, 400, 'invalid_json', 'Body is not JSON');
          return;
        }

        // The host's real admission rules, mirrored so the fixture cannot pass
        // a request the appliance would refuse.
        const key = req.headers['idempotency-key'];
        if (typeof key !== 'string' || key.length < 16 || key.length > 128) {
          problem(res, 400, 'missing_idempotency_key', 'Idempotency-Key must be 16-128 chars');
          return;
        }
        const extra = Object.keys(body).filter((k) => !['input', 'voice', 'speed'].includes(k));
        if (extra.length > 0) {
          problem(res, 422, 'unknown_field', `Unknown field(s): ${extra.join(', ')}`);
          return;
        }
        if (typeof body.speed !== 'number') {
          problem(res, 422, 'unknown_field', 'speed is required and must be a number');
          return;
        }
        if (!localHostVoices.some((voice) => voice.id === body.voice)) {
          problem(res, 422, 'unknown_voice', `Unknown voice: ${body.voice}`);
          return;
        }
        if (Buffer.byteLength(String(body.input), 'utf8') > LOCAL_HOST_MAX_TEXT_UTF8_BYTES) {
          problem(res, 413, 'payload_too_large', 'input exceeds maxTextUtf8Bytes');
          return;
        }

        const failVoice = options.localHostFailFirstVoice;
        const shouldFail =
          body.voice === failVoice &&
          !localRequests.some((request) => request.body.voice === failVoice);
        const requestRecord = { at: Date.now(), respondedAt: null, body, idempotencyKey: key };
        localRequests.push(requestRecord);
        if (shouldFail) {
          requestRecord.respondedAt = Date.now();
          requestRecord.status = 422;
          problem(
            res,
            422,
            'fixture_synthesis_failed',
            'Fixture synthesis failed; press Play to retry',
          );
          return;
        }
        const respond = () => {
          requestRecord.respondedAt = Date.now();
          const wav = wavForText(String(body.input));
          res.writeHead(200, {
            'Content-Type': 'audio/wav',
            'Content-Length': String(wav.length),
          });
          res.end(wav);
        };
        if (localHostDelayMs > 0) {
          setTimeout(respond, localHostDelayMs);
        } else {
          respond();
        }
      });
      return;
    }

    // ---- managed licence surface (PROSO-153) ----
    if (url.pathname === '/api/v1/license/validate' && req.method === 'POST') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try {
          body = JSON.parse(raw);
        } catch {
          body = { parseError: raw.slice(0, 200) };
        }
        licenseRequests.push({
          at: Date.now(),
          url: req.url,
          body,
          header: req.headers['x-license-key'] ?? null,
        });

        if (licenseMode === 'validate-500') {
          res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end('{"message":"licence service unavailable"}');
          return;
        }

        const sold =
          licenseMode !== 'unknown-key' &&
          (body?.licenseKey === PAID_LICENSE_KEY || body?.licenseKey === INTERRUPTED_LICENSE_KEY);
        const plan = sold ? PAID_LICENSE_PLAN : FREE_PLAN;
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            valid: sold,
            tier: plan.tier,
            status: plan.status,
            features: plan.features,
            credits: plan.credits,
          }),
        );
      });
      return;
    }

    if (url.pathname === '/api/v1/subscription' && req.method === 'GET') {
      const header = req.headers['x-license-key'] ?? null;
      subscriptionRequests.push({ at: Date.now(), url: req.url, header });

      // Predetermined by the candidate, not mutated by the observer: this key
      // validates as paid, then its authenticated confirmation fails after the
      // extension has adopted it. The client retries, so every attempt is
      // recorded and must still leave the prior key intact.
      if (header === INTERRUPTED_LICENSE_KEY) {
        res.writeHead(503, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end('{"message":"subscription service unavailable"}');
        return;
      }

      // Only the sold key on the header buys a paid answer. Under
      // `subscription-free` the route contradicts its own validation route,
      // which is the plant for "paid response, Free subscription".
      const paid =
        header === PAID_LICENSE_KEY &&
        (licenseMode === 'sold' || licenseMode === 'subscription-no-credits');
      const plan = paid ? PAID_LICENSE_PLAN : FREE_PLAN;
      const response =
        paid && licenseMode === 'subscription-no-credits'
          ? { tier: plan.tier, status: plan.status }
          : { tier: plan.tier, status: plan.status, credits: plan.credits };
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
      return;
    }

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // `ready` is what the host's own readiness gate answers on; the managed
      // server's `/health` ignores it, so one body serves both callers.
      res.end('{"status":"ok","ready":true}');
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    localRequests,
    licenseRequests,
    subscriptionRequests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
