/**
 * `make smoke-server-boot` — acceptance test that the built server starts.
 *
 * Runs the real `packages/server/dist/main.js` in a child process and asserts
 * the shipped bootstrap chain end to end:
 *
 *   NestFactory.create -> module wiring -> enableCors -> Express routing
 *   -> listening socket -> HTTP response
 *
 * Nothing inside the server is mocked or stubbed. The assertion is
 * deliberately "the process serves an HTTP response", not "/health is 200":
 * `/health` probes Prisma, so it answers 503 without a database, and gating on
 * 200 would make this a Postgres test instead of a bootstrap test. Any status
 * code proves the app booted and Express is routing.
 *
 * This exists because a dependency override can resolve a transitive package
 * to an incompatible major (Express 4 receiving path-to-regexp v8, whose
 * default export is an object rather than a function) and crash
 * `NestFactory.create` at `enableCors`. Unit and contract tests construct the
 * DI container directly, so they never touch that path and stay green while
 * the deployable artifact cannot start.
 *
 * @module scripts/smoke-server-boot
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const entrypoint = path.join(repoRoot, 'packages/server/dist/main.js');

/** Long enough for a cold Nest bootstrap, short enough to fail fast in CI. */
const BOOT_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 250;

/**
 * The server only checks that these are present (`REQUIRED_IN_PRODUCTION` in
 * `infrastructure/config/app.config.ts` tests truthiness), and nothing is
 * dialled during a bootstrap probe, so one neutral value serves for all of
 * them. Deliberately not written in the shape of a real credential — a literal
 * like `sk-...` next to a key named `*_API_KEY` is what secret scanners exist
 * to catch, and a placeholder is not worth teaching them to ignore.
 */
const ABSENT = 'not-a-credential';

const PROBE_ENV = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://smoke:smoke@127.0.0.1:5432/smoke',
  JWT_SECRET: ABSENT,
  OPENAI_API_KEY: ABSENT,
  ELEVENLABS_API_KEY: ABSENT,
  STRIPE_SECRET_KEY: ABSENT,
  STRIPE_WEBHOOK_SECRET: ABSENT,
};

function record(name, detail) {
  process.stdout.write(`  ok  ${name}${detail ? ` — ${detail}` : ''}\n`);
}

/** Ask the kernel for a free port, then hand it to the child. */
function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (!existsSync(entrypoint)) {
    throw new Error(
      `built server not found at ${path.relative(repoRoot, entrypoint)} — run \`make build\` first`,
    );
  }
  record('built server present', path.relative(repoRoot, entrypoint));

  const port = await reservePort();
  const child = spawn(process.execPath, [entrypoint], {
    cwd: path.join(repoRoot, 'packages/server'),
    env: { ...process.env, ...PROBE_ENV, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });

  let exited = null;
  child.on('exit', (code, signal) => {
    exited = { code, signal };
  });

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  try {
    while (Date.now() < deadline) {
      if (exited) {
        throw new Error(
          `server exited before serving a request (code ${exited.code}, signal ${exited.signal})\n` +
            `--- server output ---\n${output.trimEnd()}`,
        );
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        record('server bootstrapped and is routing', `HTTP ${response.status} on /health`);
        return;
      } catch {
        await sleep(POLL_INTERVAL_MS);
      }
    }
    throw new Error(
      `server did not answer on port ${port} within ${BOOT_TIMEOUT_MS}ms\n` +
        `--- server output ---\n${output.trimEnd()}`,
    );
  } finally {
    if (!exited) child.kill('SIGTERM');
  }
}

main()
  .then(() => {
    process.stdout.write('smoke-server-boot: the built server starts and serves HTTP\n');
    process.exit(0);
  })
  .catch((error) => {
    process.stderr.write(`smoke-server-boot FAILED: ${error.message}\n`);
    process.exit(1);
  });
