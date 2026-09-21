/**
 * Popup progress must not regress on a pause.
 *
 * @module tests/unit/popup/progress-hold
 */

import { describe, expect, it } from '@jest/globals';

import { holdProgressWithinItem } from '../../../src/utils/popup/progress-hold';

describe('holdProgressWithinItem', () => {
  it('holds the maximum within one paragraph', () => {
    expect(holdProgressWithinItem(25, 0, true)).toBe(25);
    expect(holdProgressWithinItem(25, 40, true)).toBe(40);
  });

  it('lets a seek backwards through when the paragraph changed', () => {
    expect(holdProgressWithinItem(25, 0, false)).toBe(0);
    expect(holdProgressWithinItem(25, 60, false)).toBe(60);
  });

  it('keeps the previous value when the update is not a number', () => {
    expect(holdProgressWithinItem(25, Number.NaN, true)).toBe(25);
    expect(holdProgressWithinItem(25, Number.POSITIVE_INFINITY, false)).toBe(25);
  });
});
