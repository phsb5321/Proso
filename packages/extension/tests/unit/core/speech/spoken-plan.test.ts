import { describe, expect, it } from '@jest/globals';

import {
  buildSpokenPlan,
  planLocaleFor,
  projectCharTimings,
  projectChunkWordTimings,
  SPOKEN_PLAN_REVISION,
} from '../../../../src/core/speech/spoken-plan';

describe('buildSpokenPlan', () => {
  it('is identity for unsupported locales', () => {
    const plan = buildSpokenPlan('In 2022 he wrote.', null);
    expect(plan.spokenText).toBe('In 2022 he wrote.');
    expect(plan.segments).toEqual([]);
    expect(plan.revision).toBe(SPOKEN_PLAN_REVISION);
  });

  it('is identity when nothing needs rewriting', () => {
    const source = 'Plain words only.';
    const plan = buildSpokenPlan(source, 'en');
    expect(plan.spokenText).toBe(source);
  });

  it('expands an EN year while keeping the source text immutable', () => {
    const source = 'In 2022 he wrote.';
    const plan = buildSpokenPlan(source, 'en');
    expect(plan.sourceText).toBe(source);
    expect(plan.spokenText).toBe(
      'In two thousand twenty-two he wrote.',
    );
  });

  it('expands pt-BR currency and percent forms', () => {
    const plan = buildSpokenPlan('Custou R$ 1.234,50 (12,5%).', 'pt-BR');
    expect(plan.spokenText).not.toContain('R$');
    expect(plan.spokenText).toContain('por cento');
  });

  it('protects URLs and version numbers from rewriting', () => {
    const source = 'See https://example.com/a?b=2022 and v1.2.3 since 2022.';
    const plan = buildSpokenPlan(source, 'en');
    expect(plan.spokenText).toContain('https://example.com/a?b=2022');
    expect(plan.spokenText).toContain('v1.2.3');
    expect(plan.spokenText).toContain('two thousand twenty-two');
  });

  it('planLocaleFor maps language tags by primary subtag', () => {
    expect(planLocaleFor('pt-BR')).toBe('pt-BR');
    expect(planLocaleFor('en-US')).toBe('en');
    expect(planLocaleFor('de-DE')).toBeNull();
    expect(planLocaleFor(null)).toBeNull();
  });
});

describe('projectChunkWordTimings', () => {
  const plan = buildSpokenPlan('In 2022 he wrote.', 'en');
  const spoken = plan.spokenText; // "In two thousand twenty-two he wrote."

  function evenTimings(text: string): Array<{ word: string; startMs: number; endMs: number }> {
    const words = text.match(/\S+/g) ?? [];
    return words.map((word, i) => ({
      word,
      startMs: i * 100,
      endMs: i * 100 + 90,
    }));
  }

  it('collapses the expansion onto the printed token', () => {
    const projected = projectChunkWordTimings(evenTimings(spoken), plan, spoken, 0);
    const words = projected.map((t) => t.word);
    expect(words).toEqual(['In', '2022', 'he', 'wrote']);
    // The printed token carries the whole expansion's time.
    const year = projected[1]!;
    expect(year.endMs - year.startMs).toBeGreaterThanOrEqual(180);
  });

  it('keeps timings aligned for paragraphs without edits', () => {
    const identity = buildSpokenPlan('Plain words only.', 'en');
    const timings = evenTimings(identity.spokenText);
    const projected = projectChunkWordTimings(timings, identity, identity.spokenText, 0);
    expect(projected.map((t) => t.word)).toEqual(['Plain', 'words', 'only.']);
  });

  it('maps replace char offsets from the source match, not elapsed time', () => {
    // Two printed words inside one replacement: their offsets must point at
    // the source positions of those words.
    const paragraph = 'Custou R$ 1.234,50 ontem.';
    const plan = buildSpokenPlan(paragraph, 'pt-BR');
    expect(plan.spokenText).not.toContain('1.234,50');
    const items = [
      { word: 'Custou', charOffset: 0, charLength: 6, startMs: 0, endMs: 100 },
      { word: 'mil', charOffset: 7, charLength: 3, startMs: 100, endMs: 200 },
      { word: 'duzentos', charOffset: 11, charLength: 8, startMs: 200, endMs: 300 },
      { word: 'e', charOffset: 20, charLength: 1, startMs: 300, endMs: 320 },
      { word: 'trinta', charOffset: 22, charLength: 6, startMs: 320, endMs: 420 },
      { word: 'e', charOffset: 29, charLength: 1, startMs: 420, endMs: 440 },
      { word: 'cinquenta', charOffset: 31, charLength: 9, startMs: 440, endMs: 560 },
      { word: 'centavos', charOffset: 41, charLength: 8, startMs: 560, endMs: 680 },
      { word: 'ontem', charOffset: 50, charLength: 5, startMs: 680, endMs: 760 },
    ];
    const projected = projectCharTimings(items, plan);
    const reais = projected.find((item) => item.word === 'R$');
    const cents = projected.find((item) => item.word === '1.234,50');
    expect(reais?.charOffset).toBe(paragraph.indexOf('R$'));
    expect(cents?.charOffset).toBe(paragraph.indexOf('1.234,50'));
    expect(paragraph.slice(reais!.charOffset, reais!.charOffset + reais!.charLength)).toBe('R$');
  });

  it('fails open when any timing falls outside the plan segments', () => {
    const plan = buildSpokenPlan('In 2022 he wrote.', 'en');
    const items = [
      { word: 'In', charOffset: 0, charLength: 2, startMs: 0, endMs: 50 },
      { word: 'stray', charOffset: 999, charLength: 5, startMs: 50, endMs: 80 },
      { word: 'stray2', charOffset: 1010, charLength: 6, startMs: 80, endMs: 110 },
    ];
    expect(projectCharTimings(items, plan)).toEqual([]);
  });

  it('protects uppercase URL schemes too', () => {
    const source = 'See HTTPS://example.com/?n=2022 and 2022 now.';
    const plan = buildSpokenPlan(source, 'en');
    expect(plan.spokenText).toContain('HTTPS://example.com/?n=2022');
    expect(plan.spokenText).toContain('two thousand twenty-two');
  });

  it('validates cardinality for identity plans too', () => {
    const identity = buildSpokenPlan('Read words', null);
    const timings = [{ word: 'Read', startMs: 0, endMs: 100 }];
    expect(projectChunkWordTimings(timings, identity, identity.spokenText, 0)).toEqual([]);
  });

  it('returns empty when timings and spoken words disagree (fail-open)', () => {
    const tooFew = [{ word: 'In', startMs: 0, endMs: 10 }];
    expect(projectChunkWordTimings(tooFew, plan, spoken, 0)).toEqual([]);
  });
});
