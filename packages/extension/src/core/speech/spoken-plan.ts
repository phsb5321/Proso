/**
 * Source-aligned spoken text planning.
 *
 * Builds the string a synthesis engine should receive (the spoken text) while
 * keeping a reversible alignment back to the article's printed source, so
 * expansions like `2022` -> "two thousand twenty-two" keep the highlight on
 * the printed token. Transfer of Lectrice's SpokenRun idea
 * (tauri-pdf-reader src/lib/prosody-plan.ts), narrowed to Proso's needs.
 *
 * Slice 1 scope: deterministic EN/PT-BR number normalization via
 * text-normalizer.ts. User lexicons, dates and acronyms compile through the
 * same segment model in later slices.
 */

import type { WordTiming } from '../../ports/audio-generator.port';
import { tokenizeWords } from '../playback/word-timing-estimator';
import { findSpeechNumberReplacements } from './text-normalizer';

export type SpokenPlanLocale = 'en' | 'pt-BR';

export const SPOKEN_PLAN_REVISION = 'spoken-plan-v1';

export interface SpokenSegment {
  readonly spokenStart: number;
  readonly spokenEnd: number;
  /** null when the spoken text was inserted without a source token. */
  readonly sourceStart: number | null;
  readonly sourceEnd: number | null;
  readonly kind: 'copy' | 'replace';
}

export interface SpokenPlan {
  readonly sourceText: string;
  readonly spokenText: string;
  readonly locale: SpokenPlanLocale | null;
  readonly revision: string;
  readonly segments: readonly SpokenSegment[];
}

// URLs and dotted version numbers are never rewritten.
const PROTECTED_PATTERN = /https?:\/\/\S+|\b\d+(?:\.\d+){2,}\b/gi;

/** Map a playback language tag to a plan locale, or null when unsupported. */
export function planLocaleFor(language: string | null | undefined): SpokenPlanLocale | null {
  const primary = language?.toLowerCase().split('-')[0];
  if (primary === 'pt') return 'pt-BR';
  if (primary === 'en') return 'en';
  return null;
}

function identityPlan(sourceText: string, locale: SpokenPlanLocale | null): SpokenPlan {
  return {
    sourceText,
    spokenText: sourceText,
    locale,
    revision: SPOKEN_PLAN_REVISION,
    segments: [],
  };
}

/**
 * Compile the spoken plan for one paragraph: ordered copy/replace segments
 * over the immutable source, with protected spans (URLs, version numbers)
 * excluded from rewriting.
 */
export function buildSpokenPlan(sourceText: string, locale: SpokenPlanLocale | null): SpokenPlan {
  if (locale === null) return identityPlan(sourceText, null);

  const protectedRanges: Array<[number, number]> = Array.from(
    sourceText.matchAll(PROTECTED_PATTERN),
  ).map((match) => [match.index, match.index + match[0].length]);
  const isProtected = (start: number, end: number): boolean =>
    protectedRanges.some(([s, e]) => start < e && end > s);

  const edits = findSpeechNumberReplacements(sourceText, locale).filter(
    (edit) => !isProtected(edit.sourceStart, edit.sourceEnd),
  );
  if (edits.length === 0) return identityPlan(sourceText, locale);

  const segments: SpokenSegment[] = [];
  let cursor = 0;
  let spokenText = '';
  for (const edit of edits) {
    if (edit.sourceStart < cursor || edit.sourceEnd > sourceText.length) continue;
    if (edit.sourceStart > cursor) {
      const spokenStart = spokenText.length;
      spokenText += sourceText.slice(cursor, edit.sourceStart);
      segments.push({
        spokenStart,
        spokenEnd: spokenText.length,
        sourceStart: cursor,
        sourceEnd: edit.sourceStart,
        kind: 'copy',
      });
    }
    const spokenStart = spokenText.length;
    spokenText += edit.spokenText;
    segments.push({
      spokenStart,
      spokenEnd: spokenText.length,
      sourceStart: edit.sourceStart,
      sourceEnd: edit.sourceEnd,
      kind: 'replace',
    });
    cursor = edit.sourceEnd;
  }
  if (cursor < sourceText.length) {
    const spokenStart = spokenText.length;
    spokenText += sourceText.slice(cursor);
    segments.push({
      spokenStart,
      spokenEnd: spokenText.length,
      sourceStart: cursor,
      sourceEnd: sourceText.length,
      kind: 'copy',
    });
  }

  return { sourceText, spokenText, locale, revision: SPOKEN_PLAN_REVISION, segments };
}

/** Map a position in spoken text to a position in source text (null = inserted). */
function spokenPosToSource(plan: SpokenPlan, spokenPos: number): number | null {
  for (const segment of plan.segments) {
    if (spokenPos >= segment.spokenStart && spokenPos <= segment.spokenEnd) {
      if (segment.sourceStart === null || segment.sourceEnd === null) return null;
      const clamped = Math.min(spokenPos, segment.spokenEnd);
      const ratio =
        segment.spokenEnd === segment.spokenStart
          ? 0
          : (clamped - segment.spokenStart) / (segment.spokenEnd - segment.spokenStart);
      return Math.round(segment.sourceStart + ratio * (segment.sourceEnd - segment.sourceStart));
    }
  }
  return spokenPos <= plan.sourceText.length ? spokenPos : null;
}

/**
 * Project word timings estimated over a spoken chunk back onto the printed
 * source words. Consecutive spoken timings that belong to one source
 * replacement collapse into per-source-word timings with proportional time,
 * so the highlight tracks the printed token while the audio says the
 * expansion. `chunkSpokenStart` is where the chunk begins inside
 * `plan.spokenText`.
 *
 * Fail-open: when the timings do not line up with the spoken words, the
 * projection returns an empty array and the caller keeps paragraph-level
 * highlighting instead of drifting word marks.
 */
export function projectChunkWordTimings(
  spokenTimings: ReadonlyArray<WordTiming>,
  plan: SpokenPlan,
  chunkSpokenText: string,
  chunkSpokenStart: number,
): WordTiming[] {
  const tokens: Array<{ word: string; charOffset: number; charLength: number }> =
    tokenizeWords(chunkSpokenText);
  // Cardinality is validated for identity plans too: a mismatch means the
  // timings do not describe this text, and returning them would mis-anchor.
  if (tokens.length !== spokenTimings.length) return [];
  if (plan.segments.length === 0) {
    return spokenTimings.map((timing) => ({ ...timing }));
  }
  const charItems = tokens.map((token, i) => {
    const timing = spokenTimings[i]!;
    return {
      charOffset: chunkSpokenStart + token.charOffset,
      charLength: token.charLength,
      startMs: timing.startMs,
      endMs: timing.endMs,
    };
  });
  return projectCharTimings(charItems, plan).map((item) => ({
    word: item.word,
    startMs: item.startMs,
    endMs: item.endMs,
  }));
}

/**
 * Char-offset variant of the projection used by the chunked path, whose
 * timings already carry their position inside the paragraph's spoken text.
 * Groups consecutive timings belonging to one replace segment and splits the
 * group's time across the printed words; copy segments map arithmetically.
 */
export function projectCharTimings(
  timings: ReadonlyArray<{
    word?: string;
    charOffset: number;
    charLength: number;
    startMs: number;
    endMs: number;
  }>,
  plan: SpokenPlan,
): Array<{ word: string; charOffset: number; charLength: number; startMs: number; endMs: number }> {
  if (plan.segments.length === 0) {
    return timings.map((timing) => ({
      word: timing.word ?? '',
      charOffset: timing.charOffset,
      charLength: timing.charLength,
      startMs: timing.startMs,
      endMs: timing.endMs,
    }));
  }

  const classified = timings.map((timing) => {
    const midpoint = timing.charOffset + timing.charLength / 2;
    for (let s = 0; s < plan.segments.length; s++) {
      const segment = plan.segments[s]!;
      if (midpoint < segment.spokenStart || midpoint > segment.spokenEnd) continue;
      if (segment.sourceStart === null || segment.sourceEnd === null) {
        return { segmentIndex: s, charOffset: 0, charLength: 0 };
      }
      const charOffset = segment.sourceStart + (timing.charOffset - segment.spokenStart);
      return { segmentIndex: s, charOffset, charLength: timing.charLength };
    }
    return { segmentIndex: -1, charOffset: timing.charOffset, charLength: timing.charLength };
  });
  // A timing that lands outside every segment means the alignment is invalid
  // (e.g. provider timings for text this plan does not describe): fail open
  // rather than publishing mis-anchored marks.
  if (classified.some((item) => item.segmentIndex < 0)) return [];

  const projected: Array<{
    word: string;
    charOffset: number;
    charLength: number;
    startMs: number;
    endMs: number;
  }> = [];
  let groupStart = 0;
  while (groupStart < classified.length) {
    const head = classified[groupStart]!;
    let groupEnd = groupStart + 1;
    while (
      groupEnd < classified.length &&
      head.segmentIndex >= 0 &&
      classified[groupEnd]!.segmentIndex === head.segmentIndex &&
      plan.segments[head.segmentIndex]!.kind === 'replace'
    ) {
      groupEnd += 1;
    }
    const startTime = timings[groupStart]!.startMs;
    const endTime = timings[groupEnd - 1]!.endMs;

    const segment = plan.segments[head.segmentIndex]!;
    if (segment.kind === 'replace') {
      const slice = plan.sourceText.slice(segment.sourceStart ?? 0, segment.sourceEnd ?? 0);
      const sourceWords = Array.from(slice.matchAll(/\S+/g));
      const total = sourceWords.reduce((sum, w) => sum + w[0].length, 0) || 1;
      let elapsed = 0;
      for (const word of sourceWords) {
        const share = (word[0].length / total) * (endTime - startTime);
        projected.push({
          word: word[0],
          // Character offset comes from the source match, never from elapsed
          // time (they are unrelated quantities).
          charOffset: (segment.sourceStart ?? 0) + (word.index ?? 0),
          charLength: word[0].length,
          startMs: Math.round(startTime + elapsed),
          endMs: Math.round(startTime + elapsed + share),
        });
        elapsed += share;
      }
    } else {
      for (let i = groupStart; i < groupEnd; i++) {
        const timing = timings[i]!;
        const item = classified[i]!;
        projected.push({
          word: plan.sourceText.slice(item.charOffset, item.charOffset + item.charLength),
          charOffset: item.charOffset,
          charLength: item.charLength,
          startMs: timing.startMs,
          endMs: timing.endMs,
        });
      }
    }
    groupStart = groupEnd;
  }
  return projected;
}
