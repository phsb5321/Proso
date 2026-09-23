import { Err, Ok } from '@proso/shared';
import type { Checkpoint, ReadableDocument, Result } from '@proso/shared';
import type { ReadingSourceError } from '../../ports/reading-source.port';
import type { PronunciationEntry } from '../speech/pronunciation-lexicon';
import type { SpokenPlan } from '../speech/spoken-plan';
import { validateDocumentIdentity } from './document-identity';
import type { SourceDigest } from './document-identity';

export function repairSourceOffset(text: string, offset: number): number {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) return 0;
  return /[\uD800-\uDBFF]/.test(text.charAt(offset - 1)) &&
    /[\uDC00-\uDFFF]/.test(text.charAt(offset))
    ? offset - 1
    : offset;
}

/** Point estimates inside expansions conservatively address the expansion's source start. */
export function spokenOffsetToSource(
  plan: SpokenPlan,
  spokenOffset: number,
): Result<number, ReadingSourceError> {
  if (
    !Number.isSafeInteger(spokenOffset) ||
    spokenOffset < 0 ||
    spokenOffset > plan.spokenText.length
  )
    return Err({ type: 'INVALID_RESPONSE' });
  if (spokenOffset === plan.spokenText.length) return Ok(plan.sourceText.length);
  if (!plan.segments.length) return Ok(repairSourceOffset(plan.sourceText, spokenOffset));
  const segment = plan.segments.find(
    (part) => spokenOffset >= part.spokenStart && spokenOffset < part.spokenEnd,
  );
  if (!segment) return Err({ type: 'INVALID_RESPONSE' });
  // Inserted speech cannot advance a source cursor or certify any heard interval.
  const start =
    segment.sourceStart ??
    plan.segments
      .slice(0, plan.segments.indexOf(segment))
      .reverse()
      .find((part) => part.sourceEnd !== null)?.sourceEnd ??
    0;
  return Ok(
    repairSourceOffset(
      plan.sourceText,
      segment.kind === 'copy' && segment.sourceStart !== null
        ? start + spokenOffset - segment.spokenStart
        : start,
    ),
  );
}

/** Exact plan inputs, independent of voice, audio bytes, playback rate and document identity. */
export function spokenPlanKey(
  plan: SpokenPlan,
  lexicon: readonly PronunciationEntry[],
  digest: SourceDigest,
): Promise<Result<string, ReadingSourceError>> {
  const effective = lexicon.filter(
    (entry) => entry.enabled && (entry.locale === 'all' || entry.locale === plan.locale),
  );
  return digest(
    JSON.stringify([
      plan.revision,
      plan.locale,
      effective.map((entry) => [
        entry.locale,
        entry.match,
        entry.spoken,
        entry.matchMode,
        entry.caseSensitive,
      ]),
      plan.sourceText,
      plan.spokenText,
      plan.segments.map((segment) => [
        segment.sourceStart,
        segment.sourceEnd,
        segment.spokenStart,
        segment.spokenEnd,
        segment.kind,
      ]),
    ]),
  );
}

export interface SourceRecovery {
  readonly checkpoint: Checkpoint;
  readonly repaired: boolean;
  readonly discardAudioHint: true;
  /** Caller must discard heard evidence at/after this point and unsent completion intent. */
  readonly invalidateFrom: number | null;
}

/** Source-only recovery. Audio binding/evidence transactions are deliberately deferred to T018/T033. */
export async function recoverSourceCheckpoint(
  document: ReadableDocument,
  checkpoint: Checkpoint,
  digest: SourceDigest,
  changedPlan?: SpokenPlan,
): Promise<Result<SourceRecovery, ReadingSourceError>> {
  const valid = await validateDocumentIdentity(document, digest);
  if (!valid.ok) return valid;
  const block = document.blocks.find((candidate) => candidate.id === checkpoint.blockId);
  if (
    !block ||
    checkpoint.documentRevision !== document.revision ||
    (changedPlan && changedPlan.sourceText !== block.originalText)
  )
    return Err({ type: 'INVALID_RESPONSE' });
  let sourceOffset = repairSourceOffset(block.originalText, checkpoint.sourceOffset);
  const repaired =
    sourceOffset !== checkpoint.sourceOffset ||
    !Number.isFinite(checkpoint.audioOffsetMs) ||
    checkpoint.audioOffsetMs < 0;
  if (changedPlan) {
    const expansion = changedPlan.segments.find(
      (part) =>
        part.kind === 'replace' &&
        part.sourceStart !== null &&
        part.sourceEnd !== null &&
        sourceOffset > part.sourceStart &&
        sourceOffset < part.sourceEnd,
    );
    if (expansion?.sourceStart !== null && expansion?.sourceStart !== undefined)
      sourceOffset = expansion.sourceStart;
  }
  return Ok({
    checkpoint: { ...checkpoint, sourceOffset, audioOffsetMs: 0 },
    repaired,
    discardAudioHint: true,
    invalidateFrom: changedPlan ? 0 : repaired ? sourceOffset : null,
  });
}
