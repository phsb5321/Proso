export interface EstimatedWordTiming {
  readonly word: string;
  readonly charOffset: number;
  readonly charLength: number;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
}

interface WordToken {
  readonly word: string;
  readonly charOffset: number;
  readonly charLength: number;
}

const WORD_PATTERN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{M}\p{N}]+(?:['’\-‐‑‒–—][\p{L}\p{M}\p{N}]+)*/gu;

function tokenizeWords(text: string): WordToken[] {
  return Array.from(text.matchAll(WORD_PATTERN), (match) => ({
    word: match[0],
    charOffset: match.index,
    charLength: match[0].length,
  }));
}

export function hasSpeakableWords(text: string): boolean {
  return tokenizeWords(text).length > 0;
}

function speechUnits(word: string, language?: string | null): number {
  if (/^[\p{N}]+$/u.test(word)) return Math.max(1, Array.from(word).length);

  const primaryLanguage = language?.toLowerCase().split('-')[0];
  if (primaryLanguage && ['ja', 'ko', 'zh'].includes(primaryLanguage)) {
    return Math.max(1, Array.from(word).length);
  }

  const normalized = word
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z]/gu, '');
  if (!normalized) return Math.max(1, Array.from(word).length);

  const clusters = normalized.match(/[aeiouy]+/gu);
  let count = clusters?.length ?? 1;
  if (
    primaryLanguage === 'en' &&
    normalized.length > 3 &&
    normalized.endsWith('e') &&
    !/[aeiouy]e$/u.test(normalized.slice(-2))
  ) {
    count = Math.max(1, count - 1);
  }
  return Math.max(1, count);
}

function pauseAfter(separator: string): number {
  if (/[.!?…]/u.test(separator)) return 240;
  if (/[;:]/u.test(separator)) return 180;
  if (/[,]/u.test(separator)) return 120;
  if (/[–—]/u.test(separator)) return 120;
  return 0;
}

/**
 * Build a deterministic no-marks fallback. It is deliberately an estimate:
 * Unicode words receive speech weight and bounded punctuation pauses remain
 * attached to the preceding word, matching how a reader perceives the pause.
 */
export function estimateWordTimings(
  text: string,
  durationMs: number,
  language?: string | null,
): EstimatedWordTiming[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return [];

  const words = tokenizeWords(text);
  if (words.length === 0) return [];

  const rawPauses = words.map((word, index) => {
    const nextOffset = words[index + 1]?.charOffset ?? text.length;
    return pauseAfter(text.slice(word.charOffset + word.charLength, nextOffset));
  });
  const rawPauseTotal = rawPauses.reduce((sum, pause) => sum + pause, 0);
  const pauseLimit = durationMs * 0.35;
  const pauseScale = rawPauseTotal > pauseLimit ? pauseLimit / rawPauseTotal : 1;
  const pauses = rawPauses.map((pause) => pause * pauseScale);
  const pauseTotal = pauses.reduce((sum, pause) => sum + pause, 0);

  const weights = words.map((word) => speechUnits(word.word, language));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const speechBudget = Math.max(0, durationMs - pauseTotal);

  let cursor = 0;
  return words.map((word, index) => {
    const startTimeMs = cursor;
    const speechDuration = (weights[index]! / totalWeight) * speechBudget;
    cursor += speechDuration + pauses[index]!;
    const endTimeMs = index === words.length - 1 ? durationMs : Math.min(durationMs, cursor);
    cursor = endTimeMs;
    return { ...word, startTimeMs, endTimeMs };
  });
}
