/**
 * Deterministic number-to-speech normalization for narration.
 *
 * Ported from Lectrice (tauri-pdf-reader src/lib/speech-normalization.ts) so
 * both readers speak the same grammar. Each replacement pins the exact UTF-16
 * `[start,end)` range of the unchanged source text, so highlight and timing
 * projection stay reversible. The grammar is intentionally conservative: a
 * token the requested locale cannot prove to be a number stays unchanged
 * rather than being guessed. No `Intl`, `Date`, ambient locale, or dependency
 * participates.
 */

export type SpeechNumberLocale = 'en' | 'pt-BR';

export type SpeechNumberRule = 'integer' | 'decimal' | 'percent' | 'currency' | 'time';

export interface SpeechNumberReplacement {
  sourceStart: number;
  sourceEnd: number;
  spokenText: string;
  rule: SpeechNumberRule;
}

const EN_ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const EN_TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];
const EN_SCALES = ['', 'thousand', 'million', 'billion'];

const PT_ONES = [
  'zero',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove',
];
const PT_TENS = [
  '',
  '',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa',
];
const PT_HUNDREDS = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos',
];
const PT_SCALES = [
  { singular: '', plural: '' },
  { singular: 'mil', plural: 'mil' },
  { singular: 'milhão', plural: 'milhões' },
  { singular: 'bilhão', plural: 'bilhões' },
];

function enBelowHundred(value: number): string {
  if (value < 20) return EN_ONES[value];
  const tens = EN_TENS[Math.floor(value / 10)];
  const ones = value % 10;
  return ones === 0 ? tens : `${tens}-${EN_ONES[ones]}`;
}

function enBelowThousand(value: number): string {
  if (value < 100) return enBelowHundred(value);
  const hundreds = `${EN_ONES[Math.floor(value / 100)]} hundred`;
  const rest = value % 100;
  return rest === 0 ? hundreds : `${hundreds} ${enBelowHundred(rest)}`;
}

function ptBelowHundred(value: number): string {
  if (value < 20) return PT_ONES[value];
  const tens = PT_TENS[Math.floor(value / 10)];
  const ones = value % 10;
  return ones === 0 ? tens : `${tens} e ${PT_ONES[ones]}`;
}

function ptBelowThousand(value: number): string {
  if (value < 100) return ptBelowHundred(value);
  if (value === 100) return 'cem';
  const hundreds = PT_HUNDREDS[Math.floor(value / 100)];
  const rest = value % 100;
  return rest === 0 ? hundreds : `${hundreds} e ${ptBelowHundred(rest)}`;
}

/** Least-significant-first groups of three digits. */
function thousandGroups(value: number): number[] {
  const groups: number[] = [];
  let rest = value;
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }
  return groups;
}

function enInteger(value: number): string {
  if (value === 0) return EN_ONES[0];
  const groups = thousandGroups(value);
  const parts: string[] = [];
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    if (group === 0) continue;
    const scale = EN_SCALES[index];
    parts.push(scale ? `${enBelowThousand(group)} ${scale}` : enBelowThousand(group));
  }
  return parts.join(' ');
}

function ptInteger(value: number): string {
  if (value === 0) return PT_ONES[0];
  const groups = thousandGroups(value);
  const parts: string[] = [];
  for (let index = groups.length - 1; index >= 1; index -= 1) {
    const group = groups[index];
    if (group === 0) continue;
    const scale = PT_SCALES[index];
    if (index === 1) {
      parts.push(group === 1 ? scale.singular : `${ptBelowThousand(group)} mil`);
      continue;
    }
    parts.push(group === 1 ? `um ${scale.singular}` : `${ptBelowThousand(group)} ${scale.plural}`);
  }
  const units = groups[0];
  if (units === 0) return parts.join(' ');
  const tail = ptBelowThousand(units);
  if (parts.length === 0) return tail;
  // Portuguese joins the final group with "e" only when it is below one
  // hundred or a round hundred: "dois mil e vinte e dois" but
  // "mil duzentos e trinta e quatro".
  const joiner = units < 100 || units % 100 === 0 ? ' e ' : ' ';
  return `${parts.join(' ')}${joiner}${tail}`;
}

function integerWords(value: number, locale: SpeechNumberLocale): string {
  return locale === 'en' ? enInteger(value) : ptInteger(value);
}

function digitWords(digits: string, locale: SpeechNumberLocale): string {
  const table = locale === 'en' ? EN_ONES : PT_ONES;
  return [...digits].map((digit) => table[Number(digit)]).join(' ');
}

interface CurrencyWords {
  singular: string;
  plural: string;
  fractionSingular: string;
  fractionPlural: string;
}

const CURRENCIES: Record<string, Record<SpeechNumberLocale, CurrencyWords>> = {
  $: {
    en: {
      singular: 'dollar',
      plural: 'dollars',
      fractionSingular: 'cent',
      fractionPlural: 'cents',
    },
    'pt-BR': {
      singular: 'dólar',
      plural: 'dólares',
      fractionSingular: 'centavo',
      fractionPlural: 'centavos',
    },
  },
  US$: {
    en: {
      singular: 'US dollar',
      plural: 'US dollars',
      fractionSingular: 'cent',
      fractionPlural: 'cents',
    },
    'pt-BR': {
      singular: 'dólar americano',
      plural: 'dólares americanos',
      fractionSingular: 'centavo',
      fractionPlural: 'centavos',
    },
  },
  R$: {
    en: {
      singular: 'real',
      plural: 'reais',
      fractionSingular: 'centavo',
      fractionPlural: 'centavos',
    },
    'pt-BR': {
      singular: 'real',
      plural: 'reais',
      fractionSingular: 'centavo',
      fractionPlural: 'centavos',
    },
  },
  '€': {
    en: {
      singular: 'euro',
      plural: 'euros',
      fractionSingular: 'cent',
      fractionPlural: 'cents',
    },
    'pt-BR': {
      singular: 'euro',
      plural: 'euros',
      fractionSingular: 'centavo',
      fractionPlural: 'centavos',
    },
  },
  '£': {
    en: {
      singular: 'pound',
      plural: 'pounds',
      fractionSingular: 'penny',
      fractionPlural: 'pence',
    },
    'pt-BR': {
      singular: 'libra',
      plural: 'libras',
      fractionSingular: 'centavo',
      fractionPlural: 'centavos',
    },
  },
};

interface LocaleGrammar {
  groupedInteger: RegExp;
  decimal: RegExp;
  groupSeparator: string;
  percentWords: string;
  decimalWord: string;
}

const GRAMMARS: Record<SpeechNumberLocale, LocaleGrammar> = {
  en: {
    groupedInteger: /^\d{1,3}(?:,\d{3})+$/u,
    decimal: /^(\d+|\d{1,3}(?:,\d{3})+)\.(\d{1,6})$/u,
    groupSeparator: ',',
    percentWords: 'percent',
    decimalWord: 'point',
  },
  'pt-BR': {
    groupedInteger: /^\d{1,3}(?:\.\d{3})+$/u,
    decimal: /^(\d+|\d{1,3}(?:\.\d{3})+),(\d{1,6})$/u,
    groupSeparator: '.',
    percentWords: 'por cento',
    decimalWord: 'vírgula',
  },
};

/** Ungrouped digit runs stay unspoken past this width: they read as identifiers. */
const MAX_PLAIN_INTEGER_DIGITS = 4;
const MAX_THOUSAND_GROUPS = 4;

function parsePlainInteger(text: string): number | null {
  if (!/^\d+$/u.test(text)) return null;
  if (text.length > MAX_PLAIN_INTEGER_DIGITS) return null;
  if (text.length > 1 && text.startsWith('0')) return null;
  return Number(text);
}

function parseGroupedInteger(text: string, locale: SpeechNumberLocale): number | null {
  const grammar = GRAMMARS[locale];
  if (!grammar.groupedInteger.test(text)) return null;
  const groups = text.split(grammar.groupSeparator);
  if (groups.length > MAX_THOUSAND_GROUPS) return null;
  if (groups[0].length > 1 && groups[0].startsWith('0')) return null;
  return Number(groups.join(''));
}

function parseInteger(text: string, locale: SpeechNumberLocale): number | null {
  const plain = parsePlainInteger(text);
  return plain ?? parseGroupedInteger(text, locale);
}

interface DecimalParts {
  integer: number;
  fraction: string;
}

function parseDecimal(text: string, locale: SpeechNumberLocale): DecimalParts | null {
  const match = GRAMMARS[locale].decimal.exec(text);
  if (!match) return null;
  const integer = parseInteger(match[1], locale);
  return integer === null ? null : { integer, fraction: match[2] };
}

function numberWords(text: string, locale: SpeechNumberLocale): string | null {
  const integer = parseInteger(text, locale);
  if (integer !== null) return integerWords(integer, locale);
  const decimal = parseDecimal(text, locale);
  if (!decimal) return null;
  return `${integerWords(decimal.integer, locale)} ${GRAMMARS[locale].decimalWord} ${digitWords(decimal.fraction, locale)}`;
}

const CLOCK_TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/u;

function timeWords(text: string, locale: SpeechNumberLocale): string | null {
  const match = CLOCK_TIME.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (locale === 'en') {
    if (minute === 0) return `${enInteger(hour)} o'clock`;
    if (minute < 10) return `${enInteger(hour)} oh ${EN_ONES[minute]}`;
    return `${enInteger(hour)} ${enBelowHundred(minute)}`;
  }
  // Portuguese counts hours in the feminine.
  let hourWord: string;
  if (hour === 1) {
    hourWord = 'uma hora';
  } else if (hour === 2) {
    hourWord = 'duas horas';
  } else {
    hourWord = `${ptInteger(hour)} horas`;
  }
  const hourWords = hourWord;
  if (minute === 0) return hourWords;
  const minuteWords = minute === 1 ? 'um minuto' : `${ptInteger(minute)} minutos`;
  return `${hourWords} e ${minuteWords}`;
}

function currencyWords(symbol: string, amount: string, locale: SpeechNumberLocale): string | null {
  const words = CURRENCIES[symbol]?.[locale];
  if (!words) return null;

  const integer = parseInteger(amount, locale);
  if (integer !== null) {
    const unit = integer === 1 ? words.singular : words.plural;
    return `${integerWords(integer, locale)} ${unit}`;
  }

  const decimal = parseDecimal(amount, locale);
  // A currency minor unit is exactly two digits; anything else is ambiguous.
  if (decimal?.fraction.length !== 2) return null;
  const unit = decimal.integer === 1 ? words.singular : words.plural;
  const major = `${integerWords(decimal.integer, locale)} ${unit}`;
  const minor = Number(decimal.fraction);
  if (minor === 0) return major;
  const minorUnit = minor === 1 ? words.fractionSingular : words.fractionPlural;
  const joiner = locale === 'en' ? 'and' : 'e';
  return `${major} ${joiner} ${integerWords(minor, locale)} ${minorUnit}`;
}

/**
 * A maximal numeric token: optional currency, a digit run that may carry
 * grouping/decimal/clock punctuation, and an optional percent sign. Matching
 * maximally is what lets `2.4.1` or `12,34,567` be rejected whole instead of
 * decaying into a plausible-looking prefix.
 */
const NUMERIC_TOKEN =
  /(?<currency>(?:R\$|US\$|[$€£])[\u0020\u00A0]?)?(?<core>\d(?:[\d.,:]*\d)?)(?<percent>[\u0020\u00A0]?%)?/gu;

/**
 * Letters, digits, and range/path punctuation next to a token make it
 * ambiguous: `A2022`, `2022-2023`, and `12/05` are left alone.
 */
const BLOCKING_NEIGHBOR = /[\p{L}\p{N}\-\u2013\u2014/\\_#@]/u;

function isBlocked(source: string, index: number): boolean {
  const character = source[index];
  return character !== undefined && BLOCKING_NEIGHBOR.test(character);
}

type SpokenReplacementPayload = {
  spokenText: string;
  rule: SpeechNumberReplacement['rule'];
};

function spokenReplacementForMatch(
  match: RegExpMatchArray,
  locale: SpeechNumberLocale,
): SpokenReplacementPayload | null {
  const currency = match.groups?.currency;
  const core = match.groups?.core ?? '';
  const percent = match.groups?.percent !== undefined;

  if (currency && percent) return null;

  if (currency) {
    const symbol = currency.replace(/[\u0020\u00A0]$/u, '');
    const spokenText = currencyWords(symbol, core, locale);
    return spokenText ? { spokenText, rule: 'currency' } : null;
  }

  if (percent) {
    const value = numberWords(core, locale);
    return value
      ? {
          spokenText: `${value} ${GRAMMARS[locale].percentWords}`,
          rule: 'percent',
        }
      : null;
  }

  const time = timeWords(core, locale);
  if (time) return { spokenText: time, rule: 'time' };

  const integer = parseInteger(core, locale);
  if (integer !== null) {
    return { spokenText: integerWords(integer, locale), rule: 'integer' };
  }

  const decimal = numberWords(core, locale);
  return decimal ? { spokenText: decimal, rule: 'decimal' } : null;
}

/**
 * Find every number the locale grammar can prove, as ordered, non-overlapping
 * replacements over the unchanged source.
 */
export function findSpeechNumberReplacements(
  source: string,
  locale: SpeechNumberLocale,
): SpeechNumberReplacement[] {
  const replacements: SpeechNumberReplacement[] = [];
  NUMERIC_TOKEN.lastIndex = 0;

  for (const match of source.matchAll(NUMERIC_TOKEN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (isBlocked(source, start - 1) || isBlocked(source, end)) continue;

    const replacement = spokenReplacementForMatch(match, locale);
    if (!replacement) continue;
    replacements.push({ sourceStart: start, sourceEnd: end, ...replacement });
  }

  return replacements;
}
