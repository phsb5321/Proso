import { webcrypto } from 'node:crypto';
import { ReadableStream } from 'node:stream/web';
import { jsonResponse } from './http-response';

export function installSourceCrypto(): void {
  Object.defineProperty(globalThis.crypto, 'subtle', {
    configurable: true,
    value: webcrypto.subtle,
  });
}
export function sourceResponse(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return sourceRawResponse(JSON.stringify(data), status, headers);
}
export function sourceRawResponse(text: string, status = 200, headers: HeadersInit = {}): Response {
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return { ...jsonResponse({}, status, headers), body: body as unknown as Response['body'] };
}
export function sourceEntry(id = 1) {
  return {
    id,
    title: 'Short',
    url: `https://publisher.test/${id}`,
    content: '<p>Hi.</p>',
    author: '',
    published_at: '2026-09-21T00:00:00Z',
    status: 'unread',
  };
}
