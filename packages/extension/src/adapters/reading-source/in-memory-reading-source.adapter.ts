import { Err, Ok, ReadableDocumentSchema } from '@proso/shared';
import type { ReadableDocument, Result, SourceRef } from '@proso/shared';
import { sourceIdentity, validateSourceBinding } from '../../core/reading-source/source-binding';
import type {
  IReadingSource,
  ReadingSourceError,
  ReadingSourcePage,
  ReadingSourceQuery,
} from '../../ports/reading-source.port';

/** Synthetic set-read state only; never a production persistence fallback. */
export class InMemoryReadingSourceAdapter implements IReadingSource {
  private readonly read = new Set<string>();
  private readonly cursors = new Map<string, readonly ReadableDocument[]>();
  private sequence = 0;
  private fault: ReadingSourceError | undefined;
  constructor(
    private readonly connectionId: string,
    private readonly documents: readonly ReadableDocument[] = [],
  ) {}

  failNext(error: ReadingSourceError): void {
    this.fault = error;
  }
  private check(signal?: AbortSignal): ReadingSourceError | undefined {
    if (signal?.aborted) return { type: 'ABORTED' };
    const fault = this.fault;
    this.fault = undefined;
    return fault;
  }
  async list(
    query: ReadingSourceQuery = {},
    signal?: AbortSignal,
  ): Promise<Result<ReadingSourcePage, ReadingSourceError>> {
    const fault = this.check(signal);
    if (fault) return Err(fault);
    const remaining =
      query.cursor === undefined
        ? this.documents.filter((doc) => !this.read.has(sourceIdentity(doc.source)))
        : this.cursors.get(query.cursor);
    if (!remaining) return Err({ type: 'SOURCE_BINDING' });
    if (query.cursor === undefined) this.cursors.clear();
    else this.cursors.delete(query.cursor);
    if (
      remaining.some(
        (doc) =>
          !validateSourceBinding(doc.source, this.connectionId).ok ||
          !ReadableDocumentSchema.safeParse(doc).success,
      )
    )
      return Err({ type: 'INVALID_RESPONSE' });
    const unique = [...new Map(remaining.map((doc) => [sourceIdentity(doc.source), doc])).values()];
    const items = unique
      .slice(0, 50)
      .map((doc) => ({ source: doc.source, title: doc.title, publishedAt: null }));
    // At most two pages per refresh, regardless of fixture size.
    const cursor =
      query.cursor === undefined && unique.length > 50
        ? `${this.connectionId}:${++this.sequence}`
        : undefined;
    if (cursor) this.cursors.set(cursor, unique.slice(50, 100));
    return Ok({ items, ...(cursor ? { cursor } : {}) });
  }
  async get(
    source: SourceRef,
    signal?: AbortSignal,
  ): Promise<Result<ReadableDocument, ReadingSourceError>> {
    const fault = this.check(signal);
    if (fault) return Err(fault);
    const binding = validateSourceBinding(source, this.connectionId);
    if (!binding.ok) return binding;
    const document = this.documents.find(
      (doc) => sourceIdentity(doc.source) === sourceIdentity(source),
    );
    if (!document) return Err({ type: 'NOT_FOUND' });
    const parsed = ReadableDocumentSchema.safeParse(document);
    return parsed.success ? Ok(parsed.data) : Err({ type: 'INVALID_RESPONSE' });
  }
  async acknowledge(
    source: SourceRef,
    signal?: AbortSignal,
  ): Promise<Result<void, ReadingSourceError>> {
    const found = await this.get(source, signal);
    if (!found.ok) return found;
    this.read.add(sourceIdentity(source));
    return Ok(undefined);
  }
}
