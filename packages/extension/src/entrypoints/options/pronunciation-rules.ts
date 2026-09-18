/**
 * Pronunciation-rule text format.
 *
 * The settings UI edits the reader's pronunciation lexicon as plain lines
 * (`printed text => spoken text`); this module owns the pure parse/format so
 * the controller stays thin and the format is unit-testable. Entries keep any
 * richer fields (locale, mode, case sensitivity) already stored — the line
 * format only edits the match/spoken pair.
 *
 * @module entrypoints/options/pronunciation-rules
 */

import {
  PRONUNCIATION_MAX_ENTRIES,
  PRONUNCIATION_MAX_MATCH_LENGTH,
  PRONUNCIATION_MAX_SPOKEN_LENGTH,
  type PronunciationEntry,
} from '../../core/speech/pronunciation-lexicon';

export interface ParsePronunciationResult {
  readonly entries: PronunciationEntry[];
  /** Human-readable problems, one per bad line (1-based line numbers). */
  readonly errors: string[];
}

/** Format stored entries as editable lines. */
export function formatPronunciationRules(entries: readonly PronunciationEntry[]): string {
  return entries.map((entry) => `${entry.match} => ${entry.spoken}`).join('\n');
}

/** Parse edited lines into entries, preserving richer fields by match text. */
export function parsePronunciationRules(
  text: string,
  previous: readonly PronunciationEntry[] = [],
): ParsePronunciationResult {
  const byMatch = new Map(previous.map((entry) => [entry.match, entry]));
  const entries: PronunciationEntry[] = [];
  const errors: string[] = [];

  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (line.length === 0) continue;
    if (entries.length >= PRONUNCIATION_MAX_ENTRIES) {
      errors.push(`Line ${index + 1}: the rules list is full (${PRONUNCIATION_MAX_ENTRIES}).`);
      break;
    }
    const separator = line.indexOf('=>');
    if (separator < 0) {
      errors.push(`Line ${index + 1}: expected "printed text => spoken text".`);
      continue;
    }
    const match = line.slice(0, separator).trim();
    const spoken = line.slice(separator + 2).trim();
    if (!match || !spoken) {
      errors.push(`Line ${index + 1}: both sides of "=>" are required.`);
      continue;
    }
    if (match.length > PRONUNCIATION_MAX_MATCH_LENGTH) {
      errors.push(
        `Line ${index + 1}: "${match.slice(0, 20)}…" is too long to match (max ${PRONUNCIATION_MAX_MATCH_LENGTH}).`,
      );
      continue;
    }
    if (spoken.length > PRONUNCIATION_MAX_SPOKEN_LENGTH) {
      errors.push(
        `Line ${index + 1}: the spoken text is too long (max ${PRONUNCIATION_MAX_SPOKEN_LENGTH}).`,
      );
      continue;
    }
    if (match === spoken) {
      errors.push(`Line ${index + 1}: the spoken text is identical to the printed text.`);
      continue;
    }
    const existing = byMatch.get(match);
    entries.push({
      id: existing?.id ?? `rule-${index + 1}-${entries.length + 1}`,
      locale: existing?.locale ?? 'all',
      match,
      spoken,
      matchMode: existing?.matchMode ?? 'word',
      caseSensitive: existing?.caseSensitive ?? false,
      enabled: existing?.enabled ?? true,
    });
  }

  return { entries, errors };
}
