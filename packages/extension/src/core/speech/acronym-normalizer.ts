/**
 * Deterministic acronym-to-speech normalization.
 *
 * Two allowlists drive behavior: initialisms are spelled letter by letter
 * (spokenText = uppercase letters space-separated, which any TTS reads as
 * letters) and acronym words are left unchanged. Everything else — mixed
 * case, lowercase, two-letter initials, unknown uppercase sequences — is
 * refused by omission. Unicode word boundaries keep `API` inside `rapidx`
 * from matching.
 */

import type { SpeechDateLocale } from './date-normalizer';
import { isStandaloneAt } from './text-boundaries';

export type SpeechAcronymRule = 'acronym';

export interface SpeechAcronymReplacement {
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly spokenText: string;
  readonly rule: SpeechAcronymRule;
}

/** Spoken as ordinary words — left unchanged. */
export const PRONOUNCE_AS_WORD: readonly string[] = ['NASA', 'UNESCO', 'CAPES', 'FAPESP', 'JSON'];

/** Spelled letter by letter — replaced with space-separated letters. */
export const SPELL_LETTER_BY_LETTER: readonly string[] = [
  'API',
  'CPF',
  'CNPJ',
  'HTML',
  'HTTP',
  'USB',
  'INSS',
  'LGPD',
  'PDF',
  'SQL',
  'URL',
];

const SPELL_SET = new Set(SPELL_LETTER_BY_LETTER);
// \b in JS is ASCII-only and would falsely match `API` inside `cafeAPI`;
// standalone-ness is checked through the shared code-point helper instead.
const ACRONYM_TOKEN = /[A-Z]{3,}/g;

export function findSpeechAcronymReplacements(
  text: string,
  locale: SpeechDateLocale,
): SpeechAcronymReplacement[] {
  void locale;
  const replacements: SpeechAcronymReplacement[] = [];
  for (const match of text.matchAll(ACRONYM_TOKEN)) {
    const token = match[0];
    if (!SPELL_SET.has(token)) continue;
    if (!isStandaloneAt(text, match.index, match.index + token.length)) continue;
    replacements.push({
      sourceStart: match.index,
      sourceEnd: match.index + token.length,
      spokenText: token.split('').join(' '),
      rule: 'acronym',
    });
  }
  return replacements;
}
