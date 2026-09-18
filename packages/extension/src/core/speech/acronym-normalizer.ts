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
// Unicode-aware standalone-token check: \b is ASCII-only in JS and would
// falsely match `API` inside `caféAPI` or `APIção`.
const ACRONYM_TOKEN = /[A-Z]{3,}/g;

/** The full code point ending at `index` (surrogate-pair aware). */
function codePointBefore(text: string, index: number): string {
  if (index <= 0) return '';
  const unit = text.charCodeAt(index - 1);
  if (unit >= 0xdc00 && unit <= 0xdfff && index - 2 >= 0) {
    const lead = text.charCodeAt(index - 2);
    if (lead >= 0xd800 && lead <= 0xdbff) return text.slice(index - 2, index);
  }
  return text.slice(index - 1, index);
}

/** The full code point starting at `index` (surrogate-pair aware). */
function codePointAt(text: string, index: number): string {
  if (index >= text.length) return '';
  const unit = text.charCodeAt(index);
  if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < text.length) {
    const trail = text.charCodeAt(index + 1);
    if (trail >= 0xdc00 && trail <= 0xdfff) return text.slice(index, index + 2);
  }
  return text.slice(index, index + 1);
}

function standalone(text: string, start: number, end: number): boolean {
  // Marks matter too: `cafe\u0301API` must not spell the token.
  const letterish = (ch: string) => /[\p{L}\p{N}\p{M}_]/u.test(ch);
  return !letterish(codePointBefore(text, start)) && !letterish(codePointAt(text, end));
}

export function findSpeechAcronymReplacements(
  text: string,
  locale: SpeechDateLocale,
): SpeechAcronymReplacement[] {
  void locale;
  const replacements: SpeechAcronymReplacement[] = [];
  for (const match of text.matchAll(ACRONYM_TOKEN)) {
    const token = match[0];
    if (!SPELL_SET.has(token)) continue;
    if (!standalone(text, match.index, match.index + token.length)) continue;
    replacements.push({
      sourceStart: match.index,
      sourceEnd: match.index + token.length,
      spokenText: token.split('').join(' '),
      rule: 'acronym',
    });
  }
  return replacements;
}
