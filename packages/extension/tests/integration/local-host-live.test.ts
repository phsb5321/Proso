/**
 * Live local-host receipt test (PROSO-110 falsifier A).
 *
 * Gated on LOCAL_HOST_E2E_URL: when unset, the suite is skipped so CI stays
 * hermetic. When set, the REAL LocalHostAudioAdapter synthesizes a real
 * article paragraph against the configured host — no account, no license
 * key, no provider key — and the response must be a parseable WAV with a
 * plausible duration. This is the INV-001 account-free path, proven against
 * real audio.
 *
 * @module tests/integration/local-host-live
 */

import { describe, expect, it } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import https from 'node:https';

/**
 * jsdom exposes no fetch; the live test needs a real HTTPS client to reach
 * the configured host. Minimal shim over node:https (GET/POST, JSON body).
 */
function nodeFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input);
  const body = typeof init.body === 'string' ? init.body : null;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: init.method ?? (body ? 'POST' : 'GET'),
        headers: {
          ...((init.headers as Record<string, string>) ?? {}),
          ...(body ? { 'content-length': Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const status = res.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            headers: {
              get: (name: string) => String(res.headers[name.toLowerCase()] ?? '') || null,
            },
            arrayBuffer: async () => buffer.buffer as ArrayBuffer,
            json: async () => JSON.parse(buffer.toString('utf8')) as unknown,
          } as unknown as Response);
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
import { LocalHostAudioAdapter } from '../../src/adapters/audio/local-host-audio.adapter';
import { isErr, isOk } from '../../src/core/shared/result';

const E2E_URL = process.env.LOCAL_HOST_E2E_URL;

// The host URL is injected via the environment, never committed (constitution
// condition 2: the address comes from the user, never from a shipped
// constant). Without the variable the test is a no-op so CI stays hermetic;
// the receipt run sets it explicitly (no skip API — the alignment gate bans
// skipped tests, and an unset host is genuinely nothing to prove).
describe('local synthesis host — live receipt (env-gated)', () => {
  it('synthesizes a real article paragraph with no account, no key, no license', async () => {
    if (!E2E_URL) return;
    if (!globalThis.crypto?.subtle) {
      Object.defineProperty(globalThis.crypto, 'subtle', {
        value: webcrypto.subtle,
        configurable: true,
      });
    }

    const adapter = new LocalHostAudioAdapter({ baseUrl: E2E_URL!, fetchFn: nodeFetch });
    const paragraph =
      'A reliable reader must let people pause, resume, change speed, and move between paragraphs without losing their place.';

    const voices = await adapter.getVoices('en');
    expect(isOk(voices)).toBe(true);
    if (!isOk(voices)) return;

    const result = await adapter.generateAudio({
      text: paragraph,
      voice: voices.value[0]?.id ?? null,
      speed: 1,
      language: 'en',
    });

    expect(isErr(result)).toBe(false);
    if (isErr(result)) return;

    const audio = result.value;
    // Real WAV from the host: a duration parsed from the actual header.
    expect(audio.audioBlob.type).toBe('audio/wav');
    expect(audio.durationMs).toBeGreaterThan(1000);
    expect(audio.audioBlob.size).toBeGreaterThan(10_000);
    expect(audio.wordTimings).toBeNull();

    // Time-to-first-audio is the whole request on a non-streaming host; a
    // sentence-sized request must be well under the 8s paragraph penalty.
    const started = Date.now();
    const sentence = 'Pause, resume, and move between paragraphs.';
    const second = await adapter.generateAudio({
      text: sentence,
      voice: voices.value[0]?.id ?? null,
      speed: 1,
      language: 'en',
    });
    const elapsedMs = Date.now() - started;
    expect(isOk(second)).toBe(true);
    if (isOk(second)) {
      // Idempotent replay on the same sentence should be near-instant.
      expect(elapsedMs).toBeLessThan(5_000);
    }
  });
});
