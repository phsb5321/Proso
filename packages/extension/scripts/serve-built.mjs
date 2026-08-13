#!/usr/bin/env node
/**
 * Zero-dependency static server for the visual baseline suite (PROSO #12).
 *
 * Why: the built settings.html references CSS/JS via ABSOLUTE paths
 * (`/assets/settings-*.css`, `/chunks/*.js`). Under `file://` those resolve to
 * the filesystem root, so the visual suite screenshotted an UNSTYLED page and
 * could never catch a styling regression — which is exactly how the broken
 * settings UI shipped. Serving the built extension over HTTP makes the
 * baselines render the real product CSS.
 *
 * Usage (via Playwright webServer): node scripts/serve-built.mjs
 * Serves packages/extension/.output/firefox-mv2 on http://127.0.0.1:4173
 */
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// 4273, not 4173: that port is vite's default and collides with unrelated
// dev servers on shared hosts (measured 12/08/2026 — a different project
// held it). PROSO_BUILT_PORT overrides for CI.
const PORT = Number(process.env.PROSO_BUILT_PORT ?? 4273);
const HOST = '127.0.0.1';
const ROOT = fileURLToPath(new URL('../.output/firefox-mv2/', import.meta.url));

// Fail loudly when the build is missing: a suite that silently skips is how
// vacuous baselines shipped (PROSO #12). The old settingsExists() skip guard
// stays in the test as belt-and-braces, but the webServer must not start a
// half-served root.
{
  const { existsSync } = await import('node:fs');
  if (!existsSync(join(ROOT, 'settings.html'))) {
    console.error(
      `serve-built: build missing — run pnpm --filter @proso/extension build first (expected ${ROOT})`,
    );
    process.exit(1);
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
    // Path traversal guard: serve only inside ROOT.
    const rel = normalize(urlPath).replace(/^([/\\])+/, '');
    const filePath = join(ROOT, rel);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const st = await stat(filePath);
    if (!st.isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, HOST, () => {
  console.log(`serve-built: http://${HOST}:${PORT}/ (root ${ROOT})`);
});
