import { describe, expect, it } from '@jest/globals';

import {
  formatPronunciationRules,
  parsePronunciationRules,
} from '../../../src/entrypoints/options/pronunciation-rules';

describe('parsePronunciationRules', () => {
  it('parses lines into entries with defaults', () => {
    const { entries, errors } = parsePronunciationRules('INSS => I N S S\nGonçalves => Gonçalvez');
    expect(errors).toEqual([]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      match: 'INSS',
      spoken: 'I N S S',
      locale: 'all',
      matchMode: 'word',
      caseSensitive: false,
      enabled: true,
    });
  });

  it('rejects lines without a separator or with an empty side', () => {
    const { entries, errors } = parsePronunciationRules('no separator\nA =>\n=> B\nok => fine');
    expect(entries.map((e) => e.match)).toEqual(['ok']);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toContain('Line 1');
  });

  it('preserves richer fields for an unchanged match', () => {
    const { entries } = parsePronunciationRules('OMS => Organização Mundial da Saúde', [
      {
        id: 'keep-me',
        locale: 'pt-BR',
        match: 'OMS',
        spoken: 'antigo',
        matchMode: 'phrase',
        caseSensitive: true,
        enabled: false,
      },
    ]);
    expect(entries[0]).toMatchObject({
      id: 'keep-me',
      locale: 'pt-BR',
      matchMode: 'phrase',
      caseSensitive: true,
      enabled: false,
      spoken: 'Organização Mundial da Saúde',
    });
  });

  it('rejects identical pairs and over-long sides', () => {
    const long = 'x'.repeat(200);
    const { entries, errors } = parsePronunciationRules(`same => same\n${long} => short`);
    expect(entries).toEqual([]);
    expect(errors).toHaveLength(2);
  });

  it('preserves duplicated matches across locales without collapsing them', () => {
    const { entries } = parsePronunciationRules('OM => Organização', [
      {
        id: 'pt',
        locale: 'pt-BR',
        match: 'OM',
        spoken: 'antigo',
        matchMode: 'word',
        caseSensitive: false,
        enabled: true,
      },
      {
        id: 'en',
        locale: 'en',
        match: 'OM',
        spoken: 'old',
        matchMode: 'word',
        caseSensitive: false,
        enabled: false,
      },
    ]);
    // One line -> one entry, and it must keep the FIRST stored duplicate's
    // metadata; the old map keyed by match alone kept the LAST one instead.
    expect(entries.map((e) => e.id)).toEqual(['pt']);
    expect(entries[0]?.locale).toBe('pt-BR');
  });

  it('round-trips through the formatter', () => {
    const { entries } = parsePronunciationRules('Proso => Prôzo');
    expect(formatPronunciationRules(entries)).toBe('Proso => Prôzo');
  });
});
