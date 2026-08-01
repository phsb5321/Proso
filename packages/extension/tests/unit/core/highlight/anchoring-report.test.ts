/**
 * Unit tests for the anchoring report
 * @module tests/unit/core/highlight/anchoring-report
 */

import { describe, it, expect } from '@jest/globals';
import { toAnchoringReport } from '../../../../src/core/highlight/anchoring-report';

describe('toAnchoringReport', () => {
  it('reports a highlight that stopped matching its page', () => {
    const report = toAnchoringReport([{ id: 'a', orphaned: false }], new Map([['a', true]]));

    expect(report).toEqual([{ id: 'a', orphaned: true }]);
  });

  it('reports a highlight that matches again, so the flag can be cleared', () => {
    // The whole reason the render pass reports successes at all: a page can be
    // edited back into matching, and failures alone could only ever set.
    const report = toAnchoringReport([{ id: 'a', orphaned: true }], new Map([['a', false]]));

    expect(report).toEqual([{ id: 'a', orphaned: false }]);
  });

  it('says nothing about highlights whose status did not move', () => {
    // Each report becomes a write, and every write restamps `modified`. Echoing
    // an unchanged status would turn "last time the reader touched this" into
    // "last time the page was opened", on every load, for every highlight.
    const report = toAnchoringReport(
      [
        { id: 'a', orphaned: false },
        { id: 'b', orphaned: true },
      ],
      new Map([
        ['a', false],
        ['b', true],
      ]),
    );

    expect(report).toEqual([]);
  });

  it('says nothing about a highlight the render pass never reported on', () => {
    // Absent from the map means it was never attempted. Reading that as either
    // value would be inventing a measurement — and the `false` reading would
    // silently clear a legitimate orphan flag.
    const report = toAnchoringReport([{ id: 'a', orphaned: true }], new Map());

    expect(report).toEqual([]);
  });

  it('carries each changed highlight under its own id', () => {
    const report = toAnchoringReport(
      [
        { id: 'a', orphaned: false },
        { id: 'b', orphaned: false },
        { id: 'c', orphaned: true },
      ],
      new Map([
        ['a', false],
        ['b', true],
        ['c', false],
      ]),
    );

    expect(report).toEqual([
      { id: 'b', orphaned: true },
      { id: 'c', orphaned: false },
    ]);
  });
});
