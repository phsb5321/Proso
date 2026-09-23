import { Err } from '@proso/shared';
import type { ReadableDocument, Result, SourceRef } from '@proso/shared';
import type {
  IReadingSource,
  ReadingSourceError,
  ReadingSourcePage,
  ReadingSourceQuery,
} from '../../ports/reading-source.port';

/** No dependencies, no requests, and never a successful remote acknowledgement. */
export class NoOpReadingSourceAdapter implements IReadingSource {
  async list(
    _query?: ReadingSourceQuery,
    _signal?: AbortSignal,
  ): Promise<Result<ReadingSourcePage, ReadingSourceError>> {
    return Err({ type: 'NOT_CONFIGURED' });
  }
  async get(
    _source: SourceRef,
    _signal?: AbortSignal,
  ): Promise<Result<ReadableDocument, ReadingSourceError>> {
    return Err({ type: 'NOT_CONFIGURED' });
  }
  async acknowledge(
    _source: SourceRef,
    _signal?: AbortSignal,
  ): Promise<Result<void, ReadingSourceError>> {
    return Err({ type: 'NOT_CONFIGURED' });
  }
}
