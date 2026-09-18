import { describe, expect, it } from '@jest/globals';

import {
  compilePronunciations,
  type PronunciationEntry,
} from '../../../../src/core/speech/pronunciation-lexicon';
import { buildSpokenPlan } from '../../../../src/core/speech/spoken-plan';

function entry(overrides: Partial<PronunciationEntry> = {}): PronunciationEntry {
  return {
    id: 'e1',
    locale: 'all',
    match: 'Proso',
    spoken: 'Prôzo',
    matchMode: 'word',
    caseSensitive: false,
    enabled: true,
    ...overrides,
  };
}

describe('compilePronunciations', () => {
  it('replaces a whole word, case-insensitively by default', () => {
    const edits = compilePronunciations('Proso reads. PROSO again.', 'en', [entry()]);
    expect(edits.map((e) => e.spokenText)).toEqual(['Prôzo', 'Prôzo']);
  });

  it('never matches inside a bigger word (word mode)', () => {
    expect(compilePronunciations('Prosome is different.', 'en', [entry()])).toEqual([]);
  });

  it('phrase mode matches a literal phrase', () => {
    const edits = compilePronunciations('The World Health Organization met.', 'en', [
      entry({ match: 'World Health Organization', spoken: 'WHO', matchMode: 'phrase' }),
    ]);
    expect(edits).toHaveLength(1);
    expect(edits[0]?.sourceStart).toBe(4);
  });

  it('prefers the longest match on an overlap', () => {
    const edits = compilePronunciations('São Paulo e São Paulo city', 'pt-BR', [
      entry({ id: 'short', match: 'São', spoken: 'Sao' }),
      entry({ id: 'long', match: 'São Paulo', spoken: 'Sam Paulo' }),
    ]);
    expect(edits.map((e) => e.spokenText)).toEqual(['Sam Paulo', 'Sam Paulo']);
  });

  it('filters by locale and skips disabled or no-op entries', () => {
    const entries = [
      entry({ id: 'pt', locale: 'pt-BR', match: 'Proso', spoken: 'Prôzo' }),
      entry({ id: 'off', enabled: false }),
      entry({ id: 'same', spoken: 'Proso' }),
    ];
    expect(compilePronunciations('Proso', 'en', entries)).toEqual([]);
    expect(compilePronunciations('Proso', 'pt-BR', entries)).toHaveLength(1);
  });

  it('enforces the entry cap by itself', () => {
    const many = Array.from({ length: 205 }, (_, i) =>
      entry({ id: `e${i}`, match: `term${i}`, spoken: `spoken${i}` }),
    );
    const edits = compilePronunciations(many.map((e) => e.match).join(' '), 'en', many);
    expect(edits).toHaveLength(200);
  });
});

describe('buildSpokenPlan with a lexicon', () => {
  it('applies user entries and keeps them aligned to printed tokens', () => {
    const plan = buildSpokenPlan('Proso reads 2022.', 'en', [entry()]);
    expect(plan.spokenText).toBe('Prôzo reads two thousand twenty-two.');
    const replacement = plan.segments.find((segment) => segment.kind === 'replace');
    expect(replacement?.sourceStart).toBe(0);
    expect(plan.sourceText.slice(replacement!.sourceStart!, replacement!.sourceEnd!)).toBe('Proso');
  });

  it('lets a user entry outrank a built-in rule on the same span', () => {
    const plan = buildSpokenPlan('In 2022 he wrote.', 'en', [
      entry({ match: '2022', spoken: 'vinte e vinte e dois', matchMode: 'phrase' }),
    ]);
    expect(plan.spokenText).toBe('In vinte e vinte e dois he wrote.');
  });

  it('applies to-locale "all" entries even when the language is unknown', () => {
    const plan = buildSpokenPlan('Proso reads.', null, [entry()]);
    expect(plan.spokenText).toBe('Prôzo reads.');
  });

  it('never rewrites a prefixed dotted version', () => {
    const plan = buildSpokenPlan('Runs v1.2.3 today.', 'en', [
      entry({ match: '1.2.3', spoken: 'um dois três', matchMode: 'phrase' }),
    ]);
    expect(plan.spokenText).toBe('Runs v1.2.3 today.');
  });

  it('leaves text untouched when the lexicon has no matches', () => {
    const plan = buildSpokenPlan('Plain words only.', 'en', [entry({ match: 'Nowhere' })]);
    expect(plan.spokenText).toBe('Plain words only.');
    expect(plan.segments).toEqual([]);
  });
});
