/**
 * Deterministic article + Proso API stub for the reading smoke.
 *
 * Serves one fixed article over http://127.0.0.1 so the extension's real
 * extractor has real DOM to work on, and answers `/api/v1/tts/synthesize` with
 * a real MP3 body so the real server-TTS adapter and audio pipeline run. Every
 * synthesize call is recorded, which is what lets the smoke assert that a
 * non-empty TTS request actually left the extension.
 *
 * @module scripts/lib/reading-fixture-server
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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

/** Paragraphs the smoke asserts on. Long enough for the production extractor. */
export const ARTICLE_PARAGRAPHS = [
  'Accessible reading tools should preserve attention while the spoken words remain visibly connected to the source text on the page.',
  'A reliable reader must also let people pause, resume, change speed, and move between paragraphs without ever losing their place.',
  'This third paragraph makes the fixture article long enough for the production extraction heuristic and confirms ordered navigation works.',
];

export const ARTICLE_TITLE = 'Reading Outcome Spine Fixture';

const ARTICLE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${ARTICLE_TITLE}</title>
</head>
<body>
<article>
<h1>${ARTICLE_TITLE}</h1>
${ARTICLE_PARAGRAPHS.map((text) => `<p>${text}</p>`).join('\n')}
</article>
</body>
</html>
`;

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
 * Start the fixture server.
 *
 * @returns {Promise<{origin: string, requests: Array<object>, close: () => Promise<void>}>}
 */
export async function startFixtureServer() {
  const requests = [];
  const audio = audioFixture();

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
      res.end(ARTICLE_HTML);
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
          'Content-Type': 'audio/mpeg',
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

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"status":"ok"}');
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
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
