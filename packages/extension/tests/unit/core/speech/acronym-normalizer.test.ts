import { describe, expect, it } from '@jest/globals';

import {
  findSpeechAcronymReplacements,
  PRONOUNCE_AS_WORD,
  SPELL_LETTER_BY_LETTER,
} from '../../../../src/core/speech/acronym-normalizer';

function spoken(source: string): string[] {
  return findSpeechAcronymReplacements(source, 'en').map((r) => r.spokenText);
}

describe('findSpeechAcronymReplacements', () => {
  const spelled: Array<[string, string]> = [
    ['API', 'A P I'],
    ['CPF', 'C P F'],
    ['CNPJ', 'C N P J'],
    ['HTML', 'H T M L'],
    ['HTTP', 'H T T P'],
    ['USB', 'U S B'],
    ['INSS', 'I N S S'],
    ['LGPD', 'L G P D'],
    ['PDF', 'P D F'],
    ['SQL', 'S Q L'],
    ['URL', 'U R L'],
  ];
  for (const [token, expected] of spelled) {
    it(`spells ${token}`, () => {
      expect(spoken(token)).toEqual([expected]);
    });
  }

  const words = ['JSON', 'NASA', 'UNESCO', 'CAPES', 'FAPESP'];
  for (const token of words) {
    it(`leaves ${token} unchanged (pronounce as word)`, () => {
      expect(spoken(token)).toEqual([]);
    });
  }

  it('exports the allowlists the tests pin', () => {
    expect(SPELL_LETTER_BY_LETTER).toContain('API');
    expect(PRONOUNCE_AS_WORD).toContain('NASA');
  });

  const refusals: Array<[string, string]> = [
    ['Api', 'mixed case'],
    ['Nato', 'mixed case'],
    ['api', 'lowercase'],
    ['IT', 'two letters'],
    ['rapidx', 'embedded token'],
    ['XYZQW', 'unknown uppercase'],
  ];
  for (const [input, why] of refusals) {
    it(`refuses ${input} (${why})`, () => {
      expect(spoken(input)).toEqual([]);
    });
  }

  it('refuses tokens beside combining marks and non-BMP letters', () => {
    expect(spoken('cafe\u0301API')).toEqual([]);
    expect(spoken('API\u0301acao')).toEqual([]);
    expect(spoken('\u{10400}API')).toEqual([]);
    expect(spoken('API\u{10400}')).toEqual([]);
  });

  it('emits ordered non-overlapping ranges for multiple matches', () => {
    const text = 'A API e o PDF';
    const replacements = findSpeechAcronymReplacements(text, 'pt-BR');
    expect(replacements).toHaveLength(2);
    expect(replacements[0]?.sourceStart).toBeLessThan(replacements[1]?.sourceStart ?? 0);
    for (const r of replacements) {
      expect(text.slice(r.sourceStart, r.sourceEnd)).toMatch(/^[A-Z]{3,}$/);
    }
  });
});
