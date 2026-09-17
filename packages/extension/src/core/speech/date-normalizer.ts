/**
 * Deterministic date-to-speech normalization.
 *
 * Sibling of text-normalizer.ts: same replacement shape and the same
 * conservative contract — a form the locale cannot prove is refused rather
 * than guessed. Pure string/number calendar math: no Date parsing, no Intl,
 * no ambient clock.
 */

export type SpeechDateRule = 'date';

export interface SpeechDateReplacement {
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly spokenText: string;
  readonly rule: SpeechDateRule;
}

export type SpeechDateLocale = 'en' | 'pt-BR';

const PT_MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const EN_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

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
const PT_HUNDREDS: Record<number, string> = {
  1: 'cento',
  2: 'duzentos',
  3: 'trezentos',
  4: 'quatrocentos',
  5: 'quinhentos',
  6: 'seiscentos',
  7: 'setecentos',
  8: 'oitocentos',
  9: 'novecentos',
};

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
const EN_SCALES = ['', ' thousand', ' million', ' billion'];

function belowHundredPt(value: number): string {
  if (value < 20) return PT_ONES[value] ?? String(value);
  const tens = PT_TENS[Math.floor(value / 10)] ?? String(value);
  const ones = value % 10;
  return ones === 0 ? tens : `${tens} e ${PT_ONES[ones]}`;
}

function belowHundredEn(value: number): string {
  if (value < 20) return EN_ONES[value] ?? String(value);
  const tens = EN_TENS[Math.floor(value / 10)] ?? String(value);
  const ones = value % 10;
  return ones === 0 ? tens : `${tens}-${EN_ONES[ones]}`;
}

/** Cardinal words for a year in 1000-9999 (the range a dated year can carry). */
function yearWordsPt(year: number): string | null {
  if (year < 1000 || year > 9999) return null;
  const thousands = Math.floor(year / 1000);
  const hundreds = Math.floor((year % 1000) / 100);
  const tail = year % 100;
  let spoken = thousands === 1 ? 'mil' : `${PT_ONES[thousands]} mil`;
  if (hundreds > 0) {
    // "cem" stands alone; "cento" only composes with a tail.
    const hundredsWord = hundreds === 1 && tail === 0 ? 'cem' : PT_HUNDREDS[hundreds];
    spoken += ` e ${hundredsWord}`;
  }
  if (tail > 0) spoken += ` e ${belowHundredPt(tail)}`;
  return spoken;
}

function yearWordsEn(year: number): string | null {
  if (year < 1000 || year > 9999) return null;
  const thousands = Math.floor(year / 1000);
  const rest = year % 1000;
  let spoken = `${EN_ONES[thousands]}${EN_SCALES[1]}`;
  if (rest === 0) return spoken;
  if (rest < 100) return `${spoken} ${belowHundredEn(rest)}`;
  const hundreds = Math.floor(rest / 100);
  const tail = rest % 100;
  spoken += ` ${EN_ONES[hundreds]} hundred`;
  if (tail > 0) spoken += ` ${belowHundredEn(tail)}`;
  return spoken;
}

const EN_ORDINAL_ONES = [
  'zeroth',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
  'thirteenth',
  'fourteenth',
  'fifteenth',
  'sixteenth',
  'seventeenth',
  'eighteenth',
  'nineteenth',
];

function ordinalEn(day: number): string {
  if (day < 20) return EN_ORDINAL_ONES[day] ?? `${day}th`;
  const tens = EN_TENS[Math.floor(day / 10)] ?? String(Math.floor(day / 10));
  const ones = day % 10;
  if (ones === 0) return `${tens}ieth`; // twentieth, thirtieth
  return `${tens}-${EN_ORDINAL_ONES[ones]}`; // twenty-first, thirty-ninth
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return lengths[month - 1] ?? 0;
}

function isDateReal(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/** Adjacency guard: a date embedded in digits/slashes (versions, ranges) is refused. */
function borderClean(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : '';
  const after = end < text.length ? text[end] : '';
  return !/[\d/.-]/.test(before) && !/[\d/.-]/.test(after);
}

// The border group is captured so match.index points at it; the date starts
// one character later when a border character was consumed.
const PT_SLASH_DATE = /(^|[^\d/.-])(\d{1,2})\/(\d{1,2})\/(\d{4})(?![\d/.-])/g;
const EN_ISO_DATE = /(^|[^\d/.-])(\d{4})-(\d{2})-(\d{2})(?![\d/.-])/g;
const EN_SLASH_DATE = /(^|[^\d/.-])(\d{1,2})\/(\d{1,2})\/(\d{4})(?![\d/.-])/g;

/**
 * Collect ordered, non-overlapping date replacements for `locale`. Forms the
 * locale cannot prove are refused by omission, never guessed. EN slash dates
 * are spoken only when exactly one of the two day/month readings is real.
 */
export function findSpeechDateReplacements(
  text: string,
  locale: SpeechDateLocale,
): SpeechDateReplacement[] {
  const replacements: SpeechDateReplacement[] = [];
  const taken: Array<[number, number]> = [];
  const overlapsTaken = (start: number, end: number): boolean =>
    taken.some(([s, e]) => start < e && end > s);
  const claim = (start: number, end: number, spokenText: string): void => {
    if (borderClean(text, start, end) === false) return;
    if (overlapsTaken(start, end)) return;
    taken.push([start, end]);
    replacements.push({ sourceStart: start, sourceEnd: end, spokenText, rule: 'date' });
  };

  const claimEnDate = (
    month: number,
    day: number,
    year: number,
    start: number,
    length: number,
  ): void => {
    const yearSpoken = yearWordsEn(year);
    if (yearSpoken === null) return;
    claim(start, start + length, `${EN_MONTHS[month - 1]} ${ordinalEn(day)}, ${yearSpoken}`);
  };

  if (locale === 'pt-BR') {
    for (const match of text.matchAll(PT_SLASH_DATE)) {
      const day = Number(match[2]);
      const month = Number(match[3]);
      const year = Number(match[4]);
      if (!isDateReal(year, month, day)) continue;
      const yearSpoken = yearWordsPt(year);
      if (yearSpoken === null) continue;
      const start = match.index + match[1].length;
      claim(
        start,
        start + match[0].length - match[1].length,
        `${belowHundredPt(day)} de ${PT_MONTHS[month - 1]} de ${yearSpoken}`,
      );
    }
    return replacements;
  }

  for (const match of text.matchAll(EN_ISO_DATE)) {
    const year = Number(match[2]);
    const month = Number(match[3]);
    const day = Number(match[4]);
    if (!isDateReal(year, month, day)) continue;
    claimEnDate(
      month,
      day,
      year,
      match.index + match[1].length,
      match[0].length - match[1].length,
    );
  }

  for (const match of text.matchAll(EN_SLASH_DATE)) {
    const first = Number(match[2]);
    const second = Number(match[3]);
    const year = Number(match[4]);
    const asMdy = isDateReal(year, first, second);
    const asDmy = isDateReal(year, second, first);
    if (asMdy === asDmy) continue; // ambiguous or impossible — refuse
    claimEnDate(
      asMdy ? first : second,
      asMdy ? second : first,
      year,
      match.index + match[1].length,
      match[0].length - match[1].length,
    );
  }

  replacements.sort((a, b) => a.sourceStart - b.sourceStart);
  return replacements;
}
