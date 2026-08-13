/**
 * Minimal W3C WebDriver client for geckodriver.
 *
 * The reading smoke needs to install a temporary add-on and drive a real
 * Firefox window; both are plain HTTP calls against geckodriver, so the harness
 * owns a tiny client instead of pulling in a browser-automation dependency.
 *
 * @module scripts/lib/webdriver
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

/** Ask the OS for a free TCP port. */
export async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll `probe` until it returns a truthy value or `timeoutMs` elapses. */
export async function waitFor(label, probe, { timeoutMs = 15_000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label} (last value: ${JSON.stringify(last)})`);
}

class WebDriverError extends Error {}

export class Driver {
  constructor(base, sessionId, proc, processLogs) {
    this.base = base;
    this.sessionId = sessionId;
    this.proc = proc;
    this.processLogs = processLogs;
  }

  /** Snapshot geckodriver/Firefox process output collected so far. */
  getProcessLogs() {
    return this.processLogs.join('');
  }

  async #call(method, path, body) {
    const response = await fetch(`${this.base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new WebDriverError(`${method} ${path} returned non-JSON: ${text.slice(0, 400)}`);
    }
    if (!response.ok) {
      const detail = payload?.value?.message ?? text;
      throw new WebDriverError(`${method} ${path} failed (${response.status}): ${detail}`);
    }
    return payload.value;
  }

  session(method, path, body) {
    return this.#call(method, `/session/${this.sessionId}${path}`, body);
  }

  navigate(url) {
    return this.session('POST', '/url', { url });
  }

  /**
   * Run `script` in the page and return its value.
   *
   * `script` is a function body string; arguments arrive as `arguments[0..n]`.
   */
  execute(script, args = []) {
    return this.session('POST', '/execute/sync', { script, args });
  }

  executeAsync(script, args = []) {
    return this.session('POST', '/execute/async', { script, args });
  }

  /** Install an unpacked add-on for the session lifetime. */
  installAddon(path) {
    return this.session('POST', '/moz/addon/install', { path, temporary: true });
  }

  async quit() {
    try {
      await this.#call('DELETE', `/session/${this.sessionId}`);
    } catch {
      // A dead session is already the desired end state.
    }
    this.proc?.kill('SIGTERM');
  }
}

/**
 * Start geckodriver and open a headless Firefox session.
 *
 * @param {object} options
 * @param {string} options.binary Absolute path to the Firefox binary.
 * @param {Record<string, unknown>} options.prefs Firefox preferences.
 * @param {boolean} options.headless Run without a visible window.
 */
export async function launch({ binary, prefs = {}, headless = true, extraArgs = [] }) {
  const port = await freePort();
  const proc = spawn('geckodriver', ['--port', String(port), '--host', '127.0.0.1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  proc.stdout.on('data', (chunk) => logs.push(String(chunk)));
  proc.stderr.on('data', (chunk) => logs.push(String(chunk)));
  proc.on('exit', (code) => logs.push(`geckodriver exited with ${code}\n`));

  const base = `http://127.0.0.1:${port}`;
  await waitFor(
    'geckodriver to accept connections',
    async () => {
      try {
        const response = await fetch(`${base}/status`);
        return response.ok;
      } catch {
        return false;
      }
    },
    { timeoutMs: 20_000, intervalMs: 200 },
  );

  const capabilities = {
    capabilities: {
      alwaysMatch: {
        'moz:firefoxOptions': {
          binary,
          args: [...(headless ? ['-headless'] : []), ...extraArgs],
          prefs,
        },
        pageLoadStrategy: 'normal',
        acceptInsecureCerts: true,
      },
    },
  };

  const response = await fetch(`${base}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(capabilities),
  });
  const payload = await response.json();
  if (!response.ok) {
    proc.kill('SIGTERM');
    const detail = payload?.value?.message ?? JSON.stringify(payload);
    throw new WebDriverError(`Could not start Firefox: ${detail}\n${logs.join('')}`);
  }
  return new Driver(base, payload.value.sessionId, proc, logs);
}
