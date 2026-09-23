import { Err, Ok, SourceRefSchema } from '@proso/shared';
import type { Result, SourceRef } from '@proso/shared';
import type { ReadingSourceError } from '../../ports/reading-source.port';

export function validateSourceBinding(
  source: SourceRef,
  connectionId: string,
): Result<number, ReadingSourceError> {
  if (
    !SourceRefSchema.safeParse(source).success ||
    source.connectionId !== connectionId ||
    !/^[1-9][0-9]*$/.test(source.itemId) ||
    !Number.isSafeInteger(Number(source.itemId))
  ) {
    return Err({ type: 'SOURCE_BINDING' });
  }
  return Ok(Number(source.itemId));
}

/** URL is deliberately excluded: the tuple is the namespace. */
export function sourceIdentity(source: SourceRef): string {
  return JSON.stringify([source.provider, source.connectionId, source.itemId]);
}
