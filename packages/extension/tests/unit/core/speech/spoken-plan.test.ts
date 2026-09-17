import { describe, expect, it } from '@jest/globals';

import {
  buildSpokenPlan,
  planLocaleFor,
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

  it('returns empty when timings and spoken words disagree (fail-open)', () => {
    const tooFew = [{ word: 'In', startMs: 0, endMs: 10 }];
    expect(projectChunkWordTimings(tooFew, plan, spoken, 0)).toEqual([]);
  });
});
