import { describe, expect, it } from '@jest/globals';
import fc from 'fast-check';

import {
  initialPlaybackState,
  playbackStateTransitions,
  type PlaybackState,
} from '../../../src/core/playback/playback-state';

const propertyOptions = {
  seed: Number(process.env.FC_SEED ?? 20260730),
  numRuns: Number(process.env.FC_NUM_RUNS ?? 100),
  verbose: true as const,
};

function stateWithParagraphs(paragraphs: readonly string[]): PlaybackState {
  return playbackStateTransitions.startLoading(
    initialPlaybackState,
    paragraphs,
    1,
    'https://example.test/article',
  );
}

describe('playback state properties', () => {
  it('keeps progress finite and inside the normalized interval', () => {
    fc.assert(
      fc.property(fc.double({ noDefaultInfinity: false, noNaN: false }), (progress) => {
        const next = playbackStateTransitions.updateProgress(initialPlaybackState, progress);

        expect(Number.isFinite(next.progress)).toBe(true);
        expect(next.progress).toBeGreaterThanOrEqual(0);
        expect(next.progress).toBeLessThanOrEqual(1);
      }),
      propertyOptions,
    );
  });

  it('keeps paragraph navigation inside the current document', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { maxLength: 100 }),
        fc.array(fc.integer(), { maxLength: 100 }),
        (paragraphs, requestedIndexes) => {
          let state = stateWithParagraphs(paragraphs);

          for (const index of requestedIndexes) {
            state = playbackStateTransitions.seekToParagraph(state, index);
            state = playbackStateTransitions.nextParagraph(state);
            state = playbackStateTransitions.previousParagraph(state);

            if (state.totalParagraphs === 0) {
              expect(state.currentParagraphIndex).toBe(0);
            } else {
              expect(state.currentParagraphIndex).toBeGreaterThanOrEqual(0);
              expect(state.currentParagraphIndex).toBeLessThan(state.totalParagraphs);
            }
          }
        },
      ),
      propertyOptions,
    );
  });
});
