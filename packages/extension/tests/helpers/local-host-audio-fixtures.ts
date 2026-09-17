/**
 * Local-host audio fixture responses
 *
 * Shared fixtures for the local synthesis host (PROSO-110) integration
 * oracles — the reader-journey journey and the Magpie bridge contract test.
 * Keeping them in one place keeps the jscpd ratchet honest about real
 * duplication instead of test plumbing.
 *
 * @module tests/helpers/local-host-audio-fixtures
 */

import { jest } from '@jest/globals';

/**
 * Valid PCM16 WAV response (mono, 22.05 kHz). The optional sentence index is
 * written into the first data byte so a played clip can be identified back to
 * its sentence (ordered-playback oracle).
 */
export function wavResponse(durationMs = 500, sentenceIndex = -1): Response {
  const byteRate = 22050 * 2;
  const dataBytes = Math.round((byteRate * durationMs) / 1000);
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const tag = (offset: number, s: string): void => {
    for (let i = 0; i < 4; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  tag(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, 'data');
  view.setUint32(40, dataBytes, true);
  if (sentenceIndex >= 0) view.setUint8(44, sentenceIndex);
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? 'audio/wav' : null),
    },
    arrayBuffer: async () => buffer,
    json: async () => {
      throw new Error('not json');
    },
  } as unknown as Response;
}

/** JSON response with an explicit content type (capabilities, health). */
export function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => payload,
  } as unknown as Response;
}

/** RFC 9457 problem+json failure response (appliance error contract). */
export function problemJsonResponse(status: number, code: string, retryable: boolean): Response {
  return {
    ok: false,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' ? 'application/problem+json' : null,
    },
    arrayBuffer: async () => new ArrayBuffer(0),
    json: async () => ({
      type: `about:blank#${code}`,
      title: code,
      status,
      code,
      detail: code,
      retryable,
    }),
  } as unknown as Response;
}

/**
 * Fetch mock routed by the host contract: `/health`, `/v1/capabilities`,
 * `/v1/tts`. The tts route receives the request init so callers can vary the
 * audio payload per request (e.g. sentence markers).
 */
export function createLocalHostFetchMock(routes: {
  health: unknown;
  capabilities: unknown;
  tts: (init?: RequestInit) => Response;
}): jest.Mock<typeof fetch> {
  const fetchMock = jest.fn<typeof fetch>();
  fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
    if (String(url).endsWith('/health')) return jsonResponse(routes.health);
    if (String(url).endsWith('/v1/capabilities')) return jsonResponse(routes.capabilities);
    if (String(url).endsWith('/v1/tts')) return routes.tts(init);
    throw new Error(`unexpected url ${String(url)}`);
  });
  return fetchMock;
}

/**
 * jsdom's Crypto exposes no `subtle`; the adapter needs it to derive the
 * idempotency key (spec D-6). Node's webcrypto fills the gap.
 */
export async function ensureWebCryptoSubtle(): Promise<void> {
  if (!globalThis.crypto?.subtle) {
    const { webcrypto } = await import('node:crypto');
    Object.defineProperty(globalThis.crypto, 'subtle', {
      value: webcrypto.subtle,
      configurable: true,
    });
  }
}
