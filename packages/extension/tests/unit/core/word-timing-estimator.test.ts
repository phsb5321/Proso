import { describe, expect, it } from '@jest/globals';
import { estimateWordTimings } from '../../../src/core/playback/word-timing-estimator';

describe('estimateWordTimings', () => {
  it('tokenizes accented words and ignores structural-only glyphs', () => {
    const text = '├ Olá, João! └ último item.';
    const timings = estimateWordTimings(text, 6000, 'pt-BR');

    expect(timings.map((timing) => timing.word)).toEqual(['Olá', 'João', 'último', 'item']);
    expect(timings.map((timing) => timing.charOffset)).toEqual([
      text.indexOf('Olá'),
      text.indexOf('João'),
      text.indexOf('último'),
      text.indexOf('item'),
    ]);
    expect(timings[0]?.startTimeMs).toBe(0);
    expect(timings.at(-1)?.endTimeMs).toBeCloseTo(6000, 6);
  });

  it('holds the preceding word through a bounded punctuation pause', () => {
    const plain = estimateWordTimings('one two three', 3000, 'en-US');
    const punctuated = estimateWordTimings('one, two three', 3000, 'en-US');

    expect(punctuated[1]!.startTimeMs).toBeGreaterThan(plain[1]!.startTimeMs);
    expect(punctuated.at(-1)?.endTimeMs).toBeCloseTo(3000, 6);
  });

  it('keeps Portuguese final vowels instead of applying the English silent-e rule', () => {
    const timings = estimateWordTimings('cidade azul', 2500, 'pt-BR');

    expect(timings).toHaveLength(2);
    expect(timings[0]!.endTimeMs).toBeGreaterThan(1250);
  });

  it('segments CJK scripts into independently highlightable characters', () => {
    const timings = estimateWordTimings('日本語', 1500, 'ja-JP');

    expect(timings.map((timing) => timing.word)).toEqual(['日', '本', '語']);
    expect(timings.map((timing) => timing.charOffset)).toEqual([0, 1, 2]);
  });

  it('returns no fake spoken words for formatting glyphs alone', () => {
    expect(estimateWordTimings('├── └──', 1000, 'en-US')).toEqual([]);
  });
});
