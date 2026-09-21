/** Native Fetch redirect handling with a socket-free HTTP transport. */
import { webcrypto } from 'node:crypto';
import { runInThisContext } from 'node:vm';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { ProsoApiAdapter } from '../../../../src/adapters/api/proso-api.adapter';
import { LocalHostAudioAdapter } from '../../../../src/adapters/audio/local-host-audio.adapter';
import { ServerTtsAudioAdapter } from '../../../../src/adapters/audio/server-tts-audio.adapter';

// jsdom has no Fetch. Use Node's implementation, including its real 307/308
// algorithm; only the HTTP transport is injected (no listener permissions).
const nativeFetch = runInThisContext('fetch') as typeof fetch;
const originalFetch = globalThis.fetch;
beforeAll(() => {
  Object.defineProperty(globalThis.crypto, 'subtle', {
    value: webcrypto.subtle,
    configurable: true,
  });
});
const origin = 'https://synthesis.test';
const request = { text: 'Private page text.', voice: 'test', speed: 1, language: 'en' };

interface TransportRequest {
  origin: string;
  path: string;
  body?: AsyncIterable<Uint8Array>;
}
interface TransportHandler {
  onConnect(abort: () => void): void;
  onHeaders(status: number, headers: Buffer[], resume: () => void, statusText: string): void;
  onData(data: Buffer): void;
  onComplete(trailers: Buffer[]): void;
  onError(error: Error): void;
}

function redirectTransport(status: number, destination: string) {
  const sent: Array<{ url: string; body: string }> = [];
  const dispatcher = {
    dispatch(options: TransportRequest, handler: TransportHandler) {
      void (async () => {
        let body = '';
        if (options.body) {
          for await (const chunk of options.body) body += Buffer.from(chunk).toString();
        }
        const url = `${options.origin}${options.path}`;
        sent.push({ url, body });
        handler.onConnect(() => {});
        if (url.endsWith('/v1/capabilities')) {
          handler.onHeaders(
            200,
            [Buffer.from('content-type'), Buffer.from('application/json')],
            () => {},
            'OK',
          );
          handler.onData(
            Buffer.from(JSON.stringify({ tts: { voices: [{ id: 'test', language: 'en' }] } })),
          );
        } else if (url === destination) {
          handler.onHeaders(200, [], () => {}, 'OK');
        } else {
          handler.onHeaders(
            status,
            [Buffer.from('location'), Buffer.from(destination)],
            () => {},
            'Redirect',
          );
        }
        handler.onComplete([]);
      })().catch((error: Error) => handler.onError(error));
      return true;
    },
  };
  const fetchFn = (url: string, init?: RequestInit) =>
    nativeFetch(url, { ...init, dispatcher } as RequestInit);
  return { fetchFn, sent };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe.each([307, 308])('synthesis confinement on HTTP %s', (status) => {
  describe.each(['https://untrusted.test/receive', 'https://synthesis.test:9443/receive'])(
    '%s',
    (destination) => {
      it('detects the POST body leak when redirect protection is absent', async () => {
        const transport = redirectTransport(status, destination);
        await transport.fetchFn(`${origin}/v1/tts`, { method: 'POST', body: request.text });
        expect(transport.sent).toEqual([
          { url: `${origin}/v1/tts`, body: request.text },
          { url: destination, body: request.text },
        ]);
      });

      it.each(['local', 'server'])(
        '%s returns a typed error without forwarding the body',
        async (route) => {
          const transport = redirectTransport(status, destination);
          const fetchFn = jest.fn(transport.fetchFn);
          // ServerTtsAudioAdapter delegates HTTP to ProsoApiAdapter.
          globalThis.fetch = fetchFn as typeof fetch;
          const adapter =
            route === 'local'
              ? new LocalHostAudioAdapter({ baseUrl: origin, fetchFn })
              : new ServerTtsAudioAdapter(new ProsoApiAdapter(origin));
          const result = await adapter.generateAudio(request);
          expect(result).toEqual({
            ok: false,
            error: expect.objectContaining({ type: 'network' }),
          });
          const posts = transport.sent.filter((entry) => !entry.url.endsWith('/v1/capabilities'));
          expect(posts.length).toBeGreaterThan(0);
          expect(posts.every((entry) => new URL(entry.url).origin === origin)).toBe(true);
          expect(posts.every((entry) => entry.body.includes(request.text))).toBe(true);
          expect(transport.sent.some((entry) => entry.url === destination)).toBe(false);
          for (const [, init] of fetchFn.mock.calls.filter(([, init]) => init?.method === 'POST')) {
            expect(init).toMatchObject({ redirect: 'error', credentials: 'omit' });
          }
        },
      );
    },
  );
});
