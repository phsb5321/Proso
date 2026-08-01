/**
 * Unit tests for the highlight export mapper
 * @module tests/unit/core/highlight/highlight-export
 */

import { describe, it, expect } from '@jest/globals';
import {
  HIGHLIGHT_EXPORT_FILENAME,
  serializeHighlightAnchors,
  toHighlightAnchors,
} from '../../../../src/core/highlight/highlight-export';
import type { Highlight } from '../../../../src/utils/schemas/highlight.schema';

function makeHighlight(overrides: Partial<Highlight> & { created: string }): Highlight {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    url: 'https://www.databass.dev/chapters/1',
    target: {
      source: 'https://www.databass.dev/chapters/1',
      selector: [
        {
          type: 'TextQuoteSelector',
          exact: 'B-Trees are a family of data structures',
          prefix: 'In this chapter we discuss how ',
          suffix: ' used to index on-disk data.',
        },
      ],
    },
    color: 'yellow',
    orphaned: false,
    ...overrides,
  };
}

describe('toHighlightAnchors', () => {
  it('keeps the selector and the page, and drops everything else', () => {
    const anchors = toHighlightAnchors([makeHighlight({ created: '2026-07-30T12:00:00.000Z' })]);

    expect(anchors).toEqual([
      {
        url: 'https://www.databass.dev/chapters/1',
        exact: 'B-Trees are a family of data structures',
        prefix: 'In this chapter we discuss how ',
        suffix: ' used to index on-disk data.',
        createdAt: '2026-07-30T12:00:00.000Z',
      },
    ]);

    // Storage bookkeeping is ours, not the consumer's — leaking it would
    // invite something downstream to depend on an id we are free to change.
    const [anchor] = anchors;
    expect(anchor).not.toHaveProperty('id');
    expect(anchor).not.toHaveProperty('color');
    expect(anchor).not.toHaveProperty('target');
  });

  it('carries the reader note when there is one', () => {
    const anchors = toHighlightAnchors([
      makeHighlight({
        created: '2026-07-30T12:00:00.000Z',
        body: {
          type: 'TextualBody',
          value: 'compare with LSM write amplification',
          format: 'text/plain',
        },
      }),
    ]);

    expect(anchors[0].note).toBe('compare with LSM write amplification');
  });

  it('omits a note that is empty or only whitespace', () => {
    // An empty note is the absence of a note. Emitting `"note": ""` would make
    // the consumer branch on a distinction the reader never drew.
    const anchors = toHighlightAnchors([
      makeHighlight({
        created: '2026-07-30T12:00:00.000Z',
        body: { type: 'TextualBody', value: '   ', format: 'text/plain' },
      }),
    ]);

    expect(anchors[0].note).toBeUndefined();
    expect(
      serializeHighlightAnchors([
        makeHighlight({
          created: '2026-07-30T12:00:00.000Z',
          body: { type: 'TextualBody', value: '   ', format: 'text/plain' },
        }),
      ]),
    ).not.toContain('note');
  });

  it('exports orphaned highlights too, and says which ones they are', () => {
    // Re-anchoring failing against the live page says nothing about whether the
    // reader's quote was real, and the consumer anchors against its own copy —
    // so the highlight ships. Leaving the keep-or-drop decision to the consumer
    // is only a real offer if the file marks them.
    const anchors = toHighlightAnchors([
      makeHighlight({ created: '2026-07-30T12:00:00.000Z', orphaned: true }),
    ]);

    expect(anchors).toHaveLength(1);
    expect(anchors[0].exact).toBe('B-Trees are a family of data structures');
    expect(anchors[0].orphaned).toBe(true);
  });

  it('omits the orphaned flag when the quote still matches its page', () => {
    // Same rule as the note: absent rather than `false`, so a consumer testing
    // for the key and one testing the value cannot disagree. Absent means "not
    // known to be orphaned" — which includes a page never re-opened — so there
    // is nothing to assert by emitting it.
    const highlight = makeHighlight({ created: '2026-07-30T12:00:00.000Z', orphaned: false });

    expect(toHighlightAnchors([highlight])[0].orphaned).toBeUndefined();
    // The written file is the contract, and that is where the key is gone:
    // an undefined-valued property still exists on the object in memory.
    expect(serializeHighlightAnchors([highlight])).not.toContain('orphaned');
  });

  it('orders oldest first regardless of the order it was handed', () => {
    // The repository sorts newest-first by default. Exporting in that order
    // would put every new highlight at the top of the file and reshuffle the
    // whole document on each write.
    const anchors = toHighlightAnchors([
      makeHighlight({ created: '2026-07-30T12:00:00.000Z' }),
      makeHighlight({ created: '2026-07-28T09:30:00.000Z' }),
      makeHighlight({ created: '2026-07-29T18:15:00.000Z' }),
    ]);

    expect(anchors.map((a) => a.createdAt)).toEqual([
      '2026-07-28T09:30:00.000Z',
      '2026-07-29T18:15:00.000Z',
      '2026-07-30T12:00:00.000Z',
    ]);
  });

  it('breaks same-instant ties the same way every time', () => {
    // Two highlights created in the same millisecond leave the store free to
    // yield them in either order. Without a total order the file churns
    // between exports that changed nothing, and every diff is noise.
    const sameInstant = '2026-07-30T12:00:00.000Z';
    const a = makeHighlight({
      created: sameInstant,
      url: 'https://www.databass.dev/chapters/1',
      target: {
        source: 'https://www.databass.dev/chapters/1',
        selector: [{ type: 'TextQuoteSelector', exact: 'anti-entropy' }],
      },
    });
    const b = makeHighlight({
      created: sameInstant,
      url: 'https://www.databass.dev/chapters/2',
      target: {
        source: 'https://www.databass.dev/chapters/2',
        selector: [{ type: 'TextQuoteSelector', exact: 'gossip dissemination' }],
      },
    });

    expect(toHighlightAnchors([a, b])).toEqual(toHighlightAnchors([b, a]));
  });
});

describe('serializeHighlightAnchors', () => {
  it('renders a JSON array a script can read straight off disk', () => {
    const json = serializeHighlightAnchors([
      makeHighlight({ created: '2026-07-30T12:00:00.000Z' }),
    ]);

    expect(json.endsWith('\n')).toBe(true);
    expect(JSON.parse(json)).toEqual([
      {
        url: 'https://www.databass.dev/chapters/1',
        exact: 'B-Trees are a family of data structures',
        prefix: 'In this chapter we discuss how ',
        suffix: ' used to index on-disk data.',
        createdAt: '2026-07-30T12:00:00.000Z',
      },
    ]);
  });

  it('renders an empty array rather than nothing when there is nothing to export', () => {
    // A consumer reading a fixed path needs a parseable file even on the first
    // run, otherwise "no highlights yet" is indistinguishable from a crash.
    expect(JSON.parse(serializeHighlightAnchors([]))).toEqual([]);
  });

  it('writes to a fixed name so the consumer can hard-code the path', () => {
    expect(HIGHLIGHT_EXPORT_FILENAME).toBe('proso-highlights.json');
  });
});
