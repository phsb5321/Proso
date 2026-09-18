/**
 * User pronunciation lexicon.
 *
 * Literal word or phrase entries the reader owns: `match` is what the page
 * prints, `spoken` is what the engine should say. Entries compile into the
 * same source-span edit model as the deterministic normalizers and are merged
 * into the spoken plan, so every provider — managed, BYOK, or a local host —
 * gets the corrected pronunciation without any provider-specific markup.
 *
 * Precedence: user entries outrank built-in rules. Among entries, longer
 * matches win over shorter ones inside an overlap, then declaration order.
 * Literal matching only; no user-supplied regular expressions (a ReDoS surface
 * this feature deliberately does not open).
 *
 * @module core/speech/pronunciation-lexicon
 */

import { isStandaloneAt } from './text-boundaries';

export type PronunciationLocale = 'all' | 'en' | 'pt-BR';

export interface PronunciationEntry {
  readonly id: string;
  readonly locale: PronunciationLocale;
  /** Printed text to match (literal). */
  readonly match: string;
  /** What the engine should say instead. */
  readonly spoken: string;
  readonly matchMode: 'word' | 'phrase';
  readonly caseSensitive: boolean;
  readonly enabled: boolean;
}

export interface PronunciationEdit {
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly spokenText: string;
  readonly rule: 'lexicon';
}

/** Guard rails applied at the settings boundary and here. */
export const PRONUNCIATION_MAX_ENTRIES = 200;
export const PRONUNCIATION_MAX_MATCH_LENGTH = 80;
export const PRONUNCIATION_MAX_SPOKEN_LENGTH = 120;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function localeMatches(entry: PronunciationEntry, locale: 'en' | 'pt-BR'): boolean {
  return entry.locale === 'all' || entry.locale === locale;
}

function isUsable(entry: PronunciationEntry): boolean {
  return (
    entry.enabled &&
    entry.match.trim().length > 0 &&
    entry.spoken.trim().length > 0 &&
    entry.match !== entry.spoken &&
    entry.match.length <= PRONUNCIATION_MAX_MATCH_LENGTH &&
    entry.spoken.length <= PRONUNCIATION_MAX_SPOKEN_LENGTH
  );
}

/**
 * Compile lexicon entries into ordered, non-overlapping source-span edits for
 * `locale`. Entries are tried longest-match-first, then in declaration order;
 * a candidate overlapping an already-claimed range is skipped.
 */
export function compilePronunciations(
  text: string,
  locale: 'en' | 'pt-BR',
  entries: readonly PronunciationEntry[],
): PronunciationEdit[] {
  const candidates = entries
    .filter((entry) => isUsable(entry) && localeMatches(entry, locale))
    .map((entry, order) => ({ entry, order }))
    .sort((a, b) => b.entry.match.length - a.entry.match.length || a.order - b.order);

  const claimed: Array<[number, number]> = [];
  const overlapsClaimed = (start: number, end: number): boolean =>
    claimed.some(([s, e]) => start < e && end > s);

  const edits: PronunciationEdit[] = [];
  for (const { entry } of candidates) {
    const pattern = new RegExp(escapeRegExp(entry.match), entry.caseSensitive ? 'gu' : 'giu');
    for (const found of text.matchAll(pattern)) {
      const start = found.index;
      const end = start + entry.match.length;
      if (entry.matchMode === 'word' && !isStandaloneAt(text, start, end)) continue;
      if (overlapsClaimed(start, end)) continue;
      claimed.push([start, end]);
      edits.push({ sourceStart: start, sourceEnd: end, spokenText: entry.spoken, rule: 'lexicon' });
    }
  }

  return edits.sort((a, b) => a.sourceStart - b.sourceStart);
}
