/**
 * HTTP Server Fixture for Playwright E2E Tests
 *
 * Provides a local HTTP server to serve test HTML fixtures.
 * Content scripts don't inject on file:// URLs, so we need HTTP.
 *
 * @see specs/038-browser-e2e-hardening/research.md - file:// URL limitation
 *
 * Key insight: Chrome extensions' content scripts only inject on http:// and https://
 * URLs by default (unless "file://" is explicitly added to matches and user enables
 * "Allow access to file URLs" in chrome://extensions).
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to fixtures directory
const FIXTURES_DIR = path.join(__dirname, '../../../fixtures');

// Default server port
const DEFAULT_PORT = 3333;

// MIME types for common file extensions
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
};

/**
 * State for the HTTP server fixture
 */
export interface HttpServerState {
  server: Server | null;
  port: number;
  baseUrl: string;
  isRunning: boolean;
  requestLog: Array<{ method: string; url: string; timestamp: number }>;
}

/**
 * Create and start the HTTP server
 */
export async function startHttpServer(
  port: number = DEFAULT_PORT
): Promise<HttpServerState> {
  const state: HttpServerState = {
    server: null,
    port,
    baseUrl: `http://localhost:${port}`,
    isRunning: false,
    requestLog: [],
  };

  return new Promise((resolve, reject) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url || '/';
      
      // Log request
      state.requestLog.push({
        method: req.method || 'GET',
        url,
        timestamp: Date.now(),
      });

      // Parse the URL path
      let filePath: string;
      
      if (url === '/' || url === '/index.html') {
        // Default to simple-paragraphs.html
        filePath = path.join(FIXTURES_DIR, 'html', 'simple-paragraphs.html');
      } else if (url.startsWith('/html/')) {
        // Serve from html fixtures
        filePath = path.join(FIXTURES_DIR, url);
      } else if (url.startsWith('/audio/')) {
        // Serve from audio fixtures
        filePath = path.join(FIXTURES_DIR, url);
      } else if (url.startsWith('/pdfs/')) {
        // Serve from PDF fixtures
        filePath = path.join(FIXTURES_DIR, url);
      } else {
        // Try to serve from fixtures root
        filePath = path.join(FIXTURES_DIR, url);
      }

      // Security: prevent directory traversal
      const normalizedPath = path.normalize(filePath);
      if (!normalizedPath.startsWith(FIXTURES_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      // Check if file exists
      if (!existsSync(normalizedPath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`Not Found: ${url}`);
        return;
      }

      try {
        const content = await readFile(normalizedPath);
        const ext = path.extname(normalizedPath).toLowerCase();
        const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
          'Content-Type': mimeType,
          'Content-Length': content.length,
          // Allow extension access
          'Access-Control-Allow-Origin': '*',
        });
        res.end(content);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${error}`);
      }
    });

    // Handle server errors
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Port in use - try next port
        console.log(`[HTTP Server] Port ${port} in use, trying ${port + 1}`);
        startHttpServer(port + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });

    // Start listening
    server.listen(port, '127.0.0.1', () => {
      state.server = server;
      state.port = port;
      state.baseUrl = `http://localhost:${port}`;
      state.isRunning = true;
      console.log(`[HTTP Server] Started on ${state.baseUrl}`);
      resolve(state);
    });
  });
}

/**
 * Stop the HTTP server
 */
export async function stopHttpServer(state: HttpServerState): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!state.server || !state.isRunning) {
      resolve();
      return;
    }

    const server = state.server;
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        state.isRunning = false;
        state.server = null;
        console.log(`[HTTP Server] Stopped (served ${state.requestLog.length} requests)`);
        resolve();
      }
    });

    // Force-close keep-alive sockets so close() can resolve promptly. Chromium
    // holds a persistent connection to the fixture server; without this,
    // server.close() waits for that socket and the fixture teardown hangs until
    // the 60s test timeout (observed only on CI, where the socket lingers).
    server.closeAllConnections?.();
  });
}

/**
 * Get URL for a fixture file
 *
 * @param state - HTTP server state
 * @param fixturePath - Path relative to fixtures directory (e.g., 'html/simple-paragraphs.html')
 * @returns Full URL to the fixture
 */
export function getFixtureUrl(state: HttpServerState, fixturePath: string): string {
  // Ensure path starts with /
  const normalizedPath = fixturePath.startsWith('/') ? fixturePath : `/${fixturePath}`;
  return `${state.baseUrl}${normalizedPath}`;
}

/**
 * Convenience URLs for common fixtures
 */
export const FixtureUrls = {
  SIMPLE_PARAGRAPHS: 'html/simple-paragraphs.html',
  WIKIPEDIA_ARTICLE: 'html/wikipedia-article.html',
} as const;

/**
 * Export the default port for external reference
 */
export { DEFAULT_PORT };
