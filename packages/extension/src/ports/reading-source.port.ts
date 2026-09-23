import type { ReadableDocument, Result, SourceRef } from '@proso/shared';

/** Stable, redacted discriminants; UI localization belongs at the presentation boundary. */
export type ReadingSourceError = {
  readonly type:
    | 'NOT_CONFIGURED'
    | 'GOVERNANCE_DISABLED'
    | 'PERMISSION_DENIED'
    | 'UNAUTHORIZED'
    | 'SOURCE_BINDING'
    | 'REDIRECT_REJECTED'
    | 'NOT_FOUND'
    | 'INVALID_RESPONSE'
    | 'UNREADABLE'
    | 'NETWORK'
    | 'TIMEOUT'
    | 'RATE_LIMIT'
    | 'SOURCE_UNAVAILABLE'
    | 'ABORTED'
    | 'LIMIT';
  readonly notBefore?: number;
};

export interface ReadingSourceQuery {
  readonly cursor?: string;
}
export interface ReadingSourceSummary {
  readonly source: SourceRef;
  readonly title: string;
  readonly publishedAt: number | null;
}
export interface ReadingSourcePage {
  readonly items: readonly ReadingSourceSummary[];
  readonly cursor?: string;
}

/** Each instance owns one connection. A cursor is local, opaque and connection-bound. */
export interface IReadingSource {
  list(
    query?: ReadingSourceQuery,
    signal?: AbortSignal,
  ): Promise<Result<ReadingSourcePage, ReadingSourceError>>;
  get(
    source: SourceRef,
    signal?: AbortSignal,
  ): Promise<Result<ReadableDocument, ReadingSourceError>>;
  /** Idempotent set-read; only a durable completion coordinator may call this in production. */
  acknowledge(source: SourceRef, signal?: AbortSignal): Promise<Result<void, ReadingSourceError>>;
}
