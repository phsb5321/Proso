import { describe, expect, it } from '@jest/globals';

import {
  findSpeechDateReplacements,
  type SpeechDateLocale,
} from '../../../../src/core/speech/date-normalizer';

function spoken(source: string, locale: SpeechDateLocale): string[] {
  return findSpeechDateReplacements(source, locale).map((r) => r.spokenText);
}

describe('findSpeechDateReplacements', () => {
  describe('pt-BR dd/mm/yyyy', () => {
    const cases: Array<[string, string]> = [
      ['10/01/2026', 'dez de janeiro de dois mil e vinte e seis'],
      ['29/02/2024', 'vinte e nove de fevereiro de dois mil e vinte e quatro'],
      ['15/03/2026', 'quinze de março de dois mil e vinte e seis'],
      ['01/04/2027', 'um de abril de dois mil e vinte e sete'],
      ['3/5/2026', 'três de maio de dois mil e vinte e seis'],
      ['21/06/2026', 'vinte e um de junho de dois mil e vinte e seis'],
      ['30/07/2026', 'trinta de julho de dois mil e vinte e seis'],
      ['09/08/2030', 'nove de agosto de dois mil e trinta'],
      ['17/09/2026', 'dezessete de setembro de dois mil e vinte e seis'],
      ['12/10/2026', 'doze de outubro de dois mil e vinte e seis'],
      ['23/11/2026', 'vinte e três de novembro de dois mil e vinte e seis'],
      ['25/12/2026', 'vinte e cinco de dezembro de dois mil e vinte e seis'],
      ['29/02/2000', 'vinte e nove de fevereiro de dois mil'],
    ];
    for (const [input, expected] of cases) {
      it(`speaks ${input}`, () => {
        expect(spoken(input, 'pt-BR')).toEqual([expected]);
      });
    }

    const refusals: Array<[string, string]> = [
      ['29/02/1900', 'century non-leap'],
      ['31/02/2026', 'impossible February'],
      ['12/05', 'missing year'],
    ];
    for (const [input, why] of refusals) {
      it(`refuses ${input} (${why})`, () => {
        expect(spoken(input, 'pt-BR')).toEqual([]);
      });
    }
  });

  describe('en dates', () => {
    it('speaks ISO dates', () => {
      expect(spoken('2024-02-29', 'en')).toEqual([
        'February twenty-ninth, two thousand twenty-four',
      ]);
      expect(spoken('2026-09-17', 'en')).toEqual([
        'September seventeenth, two thousand twenty-six',
      ]);
    });

    it('refuses ambiguous slash dates', () => {
      expect(spoken('04/05/2026', 'en')).toEqual([]);
      expect(spoken('12/11/2027', 'en')).toEqual([]);
    });

    it('accepts a slash date only when one reading is impossible', () => {
      expect(spoken('17/05/2026', 'en')).toEqual(['May seventeenth, two thousand twenty-six']);
    });

    it('refuses dates impossible under both readings', () => {
      expect(spoken('31/04/2026', 'en')).toEqual([]);
    });
  });

  it('emits ordered non-overlapping ranges for multiple matches', () => {
    const text = '17/09/2026 e 29/02/2024';
    const replacements = findSpeechDateReplacements(text, 'pt-BR');
    expect(replacements).toHaveLength(2);
    expect(replacements[0]?.sourceStart).toBeLessThan(replacements[1]?.sourceStart ?? 0);
    expect(replacements[0]?.sourceEnd).toBeLessThanOrEqual(replacements[1]?.sourceStart ?? 0);
    for (const r of replacements) {
      expect(text.slice(r.sourceStart, r.sourceEnd)).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
    }
  });

  it('refuses version-adjacent digit groups', () => {
    expect(spoken('v1.12/05/2026', 'pt-BR')).toEqual([]);
  });

  it('speaks proper EN ordinals', () => {
    expect(spoken('2026-09-01', 'en')).toEqual(['September first, two thousand twenty-six']);
    expect(spoken('2026-09-02', 'en')).toEqual(['September second, two thousand twenty-six']);
    expect(spoken('2026-09-03', 'en')).toEqual(['September third, two thousand twenty-six']);
    expect(spoken('2026-09-29', 'en')).toEqual(['September twenty-ninth, two thousand twenty-six']);
  });

  it('speaks round-decade ordinals without the cardinal y', () => {
    expect(spoken('2026-09-20', 'en')).toEqual(['September twentieth, two thousand twenty-six']);
    expect(spoken('2026-09-30', 'en')).toEqual(['September thirtieth, two thousand twenty-six']);
  });

  it('validates ISO dates instead of speaking impossible ones', () => {
    expect(spoken('2023-02-29', 'en')).toEqual([]);
    expect(spoken('2026-02-31', 'en')).toEqual([]);
    expect(spoken('2026-13-01', 'en')).toEqual([]);
  });

  it('keeps slash-date and ISO results ordered by source position', () => {
    const text = '17/05/2026 then 2026-09-17';
    const replacements = findSpeechDateReplacements(text, 'en');
    const starts = replacements.map((r) => r.sourceStart);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('speaks exact hundreds as cem in PT-BR years', () => {
    expect(spoken('01/01/2100', 'pt-BR')).toEqual([
      'um de janeiro de dois mil e cem',
    ]);
  });
});
