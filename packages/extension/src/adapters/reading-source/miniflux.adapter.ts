import { Err, Ok, SourceRefSchema } from '@proso/shared';
import type { ReadableDocument, Result, SourceRef } from '@proso/shared';
import { z } from 'zod';
import { createReadableDocument } from '../../core/reading-source/document-identity';
import { validateSourceBinding } from '../../core/reading-source/source-binding';
import type {
  IReadingSource,
  ReadingSourceError,
  ReadingSourcePage,
  ReadingSourceQuery,
  ReadingSourceSummary,
} from '../../ports/reading-source.port';
import { sourceDigest } from './source-digest';
import { extractSourceText } from './source-text';

export interface MinifluxConnection {
  readonly connectionId: string;
  readonly baseUrl: string;
  readonly token: string;
}
export interface MinifluxDependencies {
  readonly fetch: typeof fetch;
  readonly now: () => number;
}
const entrySchema = z.object({
  id: z.number().int().positive().safe(),
  title: z.string(),
  url: z.string(),
  content: z.string().optional(),
  author: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  published_at: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(['unread', 'read', 'removed']).optional(),
});
const pageSchema = z.object({
  total: z.number().int().nonnegative().safe(),
  entries: z.array(entrySchema).max(50),
});
type Entry = z.infer<typeof entrySchema>;

/** Transport since T008 with T009 set-read; consent/permissions/credentials belong to T013/T024. */
export class MinifluxReadingSourceAdapter implements IReadingSource {
  private readonly cursors = new Map<
    string,
    { readonly offset: number; readonly seen: ReadonlySet<string> }
  >();
  private sequence = 0;
  private constructor(
    private readonly connection: MinifluxConnection,
    private readonly deps: MinifluxDependencies,
  ) {}

  static create(
    connection: MinifluxConnection,
    deps: MinifluxDependencies,
  ): Result<MinifluxReadingSourceAdapter, ReadingSourceError> {
    try {
      const url = new URL(connection.baseUrl);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        /[%\\]/.test(url.pathname) ||
        !connection.token ||
        /[\p{Cc}]/u.test(connection.token) ||
        !SourceRefSchema.safeParse({
          provider: 'miniflux',
          connectionId: connection.connectionId,
          itemId: '1',
          canonicalUrl: url.href,
        }).success
      )
        return Err({ type: 'SOURCE_BINDING' });
      return Ok(
        new MinifluxReadingSourceAdapter(
          { ...connection, baseUrl: url.href.replace(/\/+$/, '') },
          deps,
        ),
      );
    } catch {
      return Err({ type: 'SOURCE_BINDING' });
    }
  }

  private source(entry: Entry): Result<SourceRef, ReadingSourceError> {
    const parsed = SourceRefSchema.safeParse({
      provider: 'miniflux',
      connectionId: this.connection.connectionId,
      itemId: String(entry.id),
      canonicalUrl: entry.url,
    });
    return parsed.success ? Ok(parsed.data) : Err({ type: 'INVALID_RESPONSE' });
  }

  async list(
    query: ReadingSourceQuery = {},
    signal?: AbortSignal,
  ): Promise<Result<ReadingSourcePage, ReadingSourceError>> {
    if (signal?.aborted) return Err({ type: 'ABORTED' });
    const continuation =
      query.cursor === undefined
        ? { offset: 0, seen: new Set<string>() }
        : this.cursors.get(query.cursor);
    if (!continuation) return Err({ type: 'SOURCE_BINDING' });
    if (query.cursor === undefined) this.cursors.clear();
    else this.cursors.delete(query.cursor);
    const response = await this.request(
      `/v1/entries?status=unread&limit=50&offset=${continuation.offset}&order=published_at&direction=asc`,
      4 * 1024 * 1024,
      signal,
    );
    if (!response.ok) return response;
    const parsed = pageSchema.safeParse(response.value);
    if (!parsed.success) {
      return Err({
        type: parsed.error.issues.some((issue) => issue.code === 'too_big')
          ? 'LIMIT'
          : 'INVALID_RESPONSE',
      });
    }
    const items: ReadingSourceSummary[] = [];
    const seen = new Set(continuation.seen);
    for (const entry of parsed.data.entries) {
      if (entry.status !== undefined && entry.status !== 'unread')
        return Err({ type: 'INVALID_RESPONSE' });
      if (entry.content && new TextEncoder().encode(entry.content).byteLength > 2 * 1024 * 1024)
        return Err({ type: 'LIMIT' });
      const source = this.source(entry);
      if (!source.ok) return source;
      if (seen.has(source.value.itemId)) continue;
      seen.add(source.value.itemId);
      items.push({
        source: source.value,
        title: entry.title,
        publishedAt: entry.published_at ? Date.parse(entry.published_at) : null,
      });
    }
    if (continuation.offset === 0 && parsed.data.entries.length === 50 && parsed.data.total > 50) {
      const cursor = `${this.connection.connectionId}:${++this.sequence}`;
      this.cursors.set(cursor, { offset: 50, seen });
      return Ok({ items, cursor });
    }
    return Ok({ items });
  }

  async get(
    source: SourceRef,
    signal?: AbortSignal,
  ): Promise<Result<ReadableDocument, ReadingSourceError>> {
    if (signal?.aborted) return Err({ type: 'ABORTED' });
    const binding = validateSourceBinding(source, this.connection.connectionId);
    if (!binding.ok) return binding;
    const response = await this.request(`/v1/entries/${binding.value}`, 2 * 1024 * 1024, signal);
    if (!response.ok) return response;
    const parsed = entrySchema.required({ content: true }).safeParse(response.value);
    if (!parsed.success || parsed.data.id !== binding.value)
      return Err({ type: 'INVALID_RESPONSE' });
    const actualSource = this.source(parsed.data);
    if (!actualSource.ok) return actualSource;
    const content = extractSourceText(parsed.data.content);
    if (!content.ok) return content;
    const document = await createReadableDocument(
      {
        source: actualSource.value,
        title: parsed.data.title,
        author: parsed.data.author || null,
        language: parsed.data.language || null,
        fetchedAt: this.deps.now(),
      },
      content.value,
      sourceDigest,
    );
    return signal?.aborted ? Err({ type: 'ABORTED' }) : document;
  }

  /**
   * One-item idempotent set-read (REQ-008): an absolute status re-assertion,
   * never a toggle or mark-all. Repeating a lost-response request sends the
   * same bytes again, so a duplicate delivery stays benign.
   */
  async acknowledge(
    source: SourceRef,
    signal?: AbortSignal,
  ): Promise<Result<void, ReadingSourceError>> {
    if (signal?.aborted) return Err({ type: 'ABORTED' });
    const binding = validateSourceBinding(source, this.connection.connectionId);
    if (!binding.ok) return binding;
    // Annex v1 body: exactly entry_ids + status; the ID is a validated safe integer.
    const response = await this.request('/v1/entries', 0, signal, {
      method: 'PUT',
      body: JSON.stringify({ entry_ids: [binding.value], status: 'read' }),
    });
    return response.ok ? Ok(undefined) : response;
  }

  private async request(
    path: string,
    limit: number,
    signal?: AbortSignal,
    write?: { readonly method: 'PUT'; readonly body: string },
  ): Promise<Result<unknown, ReadingSourceError>> {
    if (signal?.aborted) return Err({ type: 'ABORTED' });
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let cancel: (result: Result<never, ReadingSourceError>) => void = () => {};
    const cancelled = new Promise<Result<never, ReadingSourceError>>((resolve) => {
      cancel = resolve;
    });
    const abort = () => {
      cancel(Err({ type: 'ABORTED' }));
      controller.abort();
    };
    const timer = setTimeout(() => {
      cancel(Err({ type: 'TIMEOUT' }));
      controller.abort();
    }, 15_000);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const operation = async (): Promise<Result<unknown, ReadingSourceError>> => {
        // Only fixed endpoint paths and validated integer IDs reach this method.
        const url = `${this.connection.baseUrl}${path}`;
        const target = new URL(url);
        const configured = new URL(this.connection.baseUrl);
        if (
          target.origin !== configured.origin ||
          !target.pathname.startsWith(`${configured.pathname.replace(/\/$/, '')}/v1/entries`)
        )
          return Err({ type: 'SOURCE_BINDING' });
        const response = await this.deps.fetch(url, {
          method: write?.method ?? 'GET',
          headers: write
            ? { 'X-Auth-Token': this.connection.token, 'Content-Type': 'application/json' }
            : { 'X-Auth-Token': this.connection.token, Accept: 'application/json' },
          credentials: 'omit',
          redirect: 'error',
          body: write?.body,
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          void response.body?.cancel().catch(() => {});
          return Err({ type: 'ABORTED' });
        }
        if (response.redirected || (response.status >= 300 && response.status < 400))
          return Err({ type: 'REDIRECT_REJECTED' });
        if (response.url && response.url !== url) return Err({ type: 'SOURCE_BINDING' });
        if (response.status === 401 || response.status === 403)
          return Err({ type: 'UNAUTHORIZED' });
        if (response.status === 404) return Err({ type: 'NOT_FOUND' });
        if (response.status === 429) {
          const retry = response.headers.get('Retry-After');
          const now = this.deps.now();
          const notBefore =
            retry && /^\d+$/.test(retry)
              ? now + Number(retry) * 1000
              : retry
                ? Date.parse(retry)
                : NaN;
          return Err({
            type: 'RATE_LIMIT',
            ...(Number.isSafeInteger(notBefore) && notBefore >= now ? { notBefore } : {}),
          });
        }
        if (response.status >= 500) return Err({ type: 'SOURCE_UNAVAILABLE' });
        if (write) {
          // Only a 204 acknowledges (queue-envelope v1 rule 5); a body is neither read nor trusted.
          void response.body?.cancel().catch(() => {});
          if (response.status !== 204) return Err({ type: 'INVALID_RESPONSE' });
          return Ok(undefined);
        }
        if (response.status !== 200 || !response.body) return Err({ type: 'INVALID_RESPONSE' });
        const length = response.headers.get('Content-Length');
        if (length && Number(length) > limit) return Err({ type: 'LIMIT' });
        reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8', { fatal: true });
        let size = 0;
        let body = '';
        while (true) {
          const chunk = await reader.read();
          if (controller.signal.aborted) return Err({ type: 'ABORTED' });
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > limit) return Err({ type: 'LIMIT' });
          try {
            body += decoder.decode(chunk.value, { stream: true });
          } catch {
            return Err({ type: 'INVALID_RESPONSE' });
          }
        }
        if (length !== null && (!/^\d+$/.test(length) || Number(length) !== size))
          return Err({ type: 'INVALID_RESPONSE' });
        try {
          body += decoder.decode();
          return Ok(JSON.parse(body) as unknown);
        } catch {
          return Err({ type: 'INVALID_RESPONSE' });
        }
      };
      return await Promise.race([operation(), cancelled]);
    } catch {
      // Fetch deliberately hides redirect-error detail; never reflect exception text or token.
      return Err({ type: signal?.aborted ? 'ABORTED' : 'NETWORK' });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      controller.abort();
      void reader?.cancel().catch(() => {});
    }
  }
}
