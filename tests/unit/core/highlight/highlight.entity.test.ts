/**
 * Unit tests for Highlight entity domain logic
 * @module tests/unit/core/highlight/highlight.entity
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import {
  createHighlight,
  validateHighlight,
  isOrphaned,
  hasNote,
  getNote,
  getExactText,
  getSelectors,
  withColor,
  withNote,
  withOrphanedStatus,
  compareByCreated,
  compareByModified,
} from '../../../../src/core/highlight/highlight.entity';
import type { Highlight } from '../../../../src/core/highlight/highlight.entity';

// Ensure crypto.randomUUID is available
beforeAll(() => {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    Object.defineProperty(globalThis, 'crypto', {
      value: webcrypto,
      writable: true,
    });
  }
});

// Valid UUID for test fixtures (matches Zod uuid() validation)
const VALID_UUID = '12345678-1234-4234-8234-123456789abc';

/**
 * Helper: create a valid highlight for testing
 */
function makeHighlight(overrides: Partial<Highlight> = {}): Highlight {
  const base: Highlight = {
    id: VALID_UUID,
    url: 'https://example.com/page',
    target: {
      source: 'https://example.com/page',
      selector: [
        {
          type: 'TextQuoteSelector',
          exact: 'Hello world',
          prefix: 'before ',
          suffix: ' after',
        },
      ],
    },
    color: 'yellow',
    orphaned: false,
    created: '2026-01-15T10:00:00.000Z',
  };
  return { ...base, ...overrides };
}

describe('Highlight entity', () => {
  describe('createHighlight', () => {
    it('creates a highlight with required fields', () => {
      const highlight = createHighlight({
        url: 'https://example.com/article',
        exact: 'Selected text',
      });

      expect(highlight.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(highlight.url).toBe('https://example.com/article');
      expect(highlight.target.source).toBe('https://example.com/article');
      expect(highlight.target.selector).toHaveLength(1);
      expect(highlight.target.selector[0].exact).toBe('Selected text');
      expect(highlight.color).toBe('yellow'); // default
      expect(highlight.orphaned).toBe(false);
      expect(highlight.created).toBeDefined();
    });

    it('creates a highlight with optional prefix/suffix', () => {
      const highlight = createHighlight({
        url: 'https://example.com',
        exact: 'some text',
        prefix: 'before ',
        suffix: ' after',
      });

      expect(highlight.target.selector[0].prefix).toBe('before ');
      expect(highlight.target.selector[0].suffix).toBe(' after');
    });

    it('creates a highlight with custom color', () => {
      const highlight = createHighlight({
        url: 'https://example.com',
        exact: 'text',
        color: 'blue',
      });

      expect(highlight.color).toBe('blue');
    });

    it('creates a highlight with a note', () => {
      const highlight = createHighlight({
        url: 'https://example.com',
        exact: 'text',
        note: 'Important point',
      });

      expect(highlight.body).toBeDefined();
      expect(highlight.body?.type).toBe('TextualBody');
      expect(highlight.body?.value).toBe('Important point');
      expect(highlight.body?.format).toBe('text/plain');
    });

    it('creates highlight without note by default', () => {
      const highlight = createHighlight({
        url: 'https://example.com',
        exact: 'text',
      });

      expect(highlight.body).toBeUndefined();
    });
  });

  describe('validateHighlight', () => {
    it('validates a proper highlight', () => {
      const data = makeHighlight();
      const result = validateHighlight(data);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(VALID_UUID);
    });

    it('returns null for invalid data', () => {
      expect(validateHighlight({})).toBeNull();
      expect(validateHighlight(null)).toBeNull();
      expect(validateHighlight('string')).toBeNull();
    });

    it('returns null for missing required fields', () => {
      expect(validateHighlight({ id: VALID_UUID })).toBeNull();
    });

    it('validates highlight with optional body', () => {
      const data = makeHighlight({
        body: { type: 'TextualBody', value: 'note', format: 'text/plain' },
      });
      const result = validateHighlight(data);
      expect(result?.body?.value).toBe('note');
    });
  });

  describe('isOrphaned', () => {
    it('returns true for orphaned highlight', () => {
      expect(isOrphaned(makeHighlight({ orphaned: true }))).toBe(true);
    });

    it('returns false for non-orphaned highlight', () => {
      expect(isOrphaned(makeHighlight({ orphaned: false }))).toBe(false);
    });
  });

  describe('hasNote', () => {
    it('returns true when highlight has a note', () => {
      const h = makeHighlight({
        body: { type: 'TextualBody', value: 'My note', format: 'text/plain' },
      });
      expect(hasNote(h)).toBe(true);
    });

    it('returns false when no body', () => {
      expect(hasNote(makeHighlight())).toBe(false);
    });

    it('returns false when body has empty value', () => {
      const h = makeHighlight({
        body: { type: 'TextualBody', value: '', format: 'text/plain' },
      });
      expect(hasNote(h)).toBe(false);
    });
  });

  describe('getNote', () => {
    it('returns note text', () => {
      const h = makeHighlight({
        body: { type: 'TextualBody', value: 'Important', format: 'text/plain' },
      });
      expect(getNote(h)).toBe('Important');
    });

    it('returns null when no body', () => {
      expect(getNote(makeHighlight())).toBeNull();
    });
  });

  describe('getExactText', () => {
    it('returns exact text from first selector', () => {
      expect(getExactText(makeHighlight())).toBe('Hello world');
    });
  });

  describe('getSelectors', () => {
    it('returns all selectors', () => {
      const selectors = getSelectors(makeHighlight());
      expect(selectors).toHaveLength(1);
      expect(selectors[0].exact).toBe('Hello world');
    });
  });

  describe('withColor', () => {
    it('returns new highlight with updated color', () => {
      const original = makeHighlight({ color: 'yellow' });
      const updated = withColor(original, 'blue');

      expect(updated.color).toBe('blue');
      expect(updated.modified).toBeDefined();
      // Original unchanged
      expect(original.color).toBe('yellow');
    });

    it('preserves all other fields', () => {
      const original = makeHighlight();
      const updated = withColor(original, 'green');

      expect(updated.id).toBe(original.id);
      expect(updated.url).toBe(original.url);
      expect(updated.target).toEqual(original.target);
    });
  });

  describe('withNote', () => {
    it('adds a note to a highlight', () => {
      const h = makeHighlight();
      const updated = withNote(h, 'New note');

      expect(updated.body).toEqual({
        type: 'TextualBody',
        value: 'New note',
        format: 'text/plain',
      });
      expect(updated.modified).toBeDefined();
    });

    it('removes note when null', () => {
      const h = makeHighlight({
        body: { type: 'TextualBody', value: 'old note', format: 'text/plain' },
      });
      const updated = withNote(h, null);

      expect(updated.body).toBeUndefined();
      expect(updated.modified).toBeDefined();
    });

    it('removes note when empty string', () => {
      const h = makeHighlight({
        body: { type: 'TextualBody', value: 'old note', format: 'text/plain' },
      });
      const updated = withNote(h, '');

      expect(updated.body).toBeUndefined();
    });
  });

  describe('withOrphanedStatus', () => {
    it('marks highlight as orphaned', () => {
      const h = makeHighlight({ orphaned: false });
      const updated = withOrphanedStatus(h, true);

      expect(updated.orphaned).toBe(true);
      expect(updated.modified).toBeDefined();
    });

    it('marks highlight as not orphaned', () => {
      const h = makeHighlight({ orphaned: true });
      const updated = withOrphanedStatus(h, false);

      expect(updated.orphaned).toBe(false);
    });
  });

  describe('compareByCreated', () => {
    it('sorts newest first', () => {
      const older = makeHighlight({ created: '2026-01-01T00:00:00.000Z' });
      const newer = makeHighlight({ created: '2026-01-15T00:00:00.000Z' });

      expect(compareByCreated(older, newer)).toBeGreaterThan(0);
      expect(compareByCreated(newer, older)).toBeLessThan(0);
    });

    it('returns 0 for same date', () => {
      const a = makeHighlight({ created: '2026-01-01T00:00:00.000Z' });
      const b = makeHighlight({ created: '2026-01-01T00:00:00.000Z' });

      expect(compareByCreated(a, b)).toBe(0);
    });

    it('works with Array.sort', () => {
      const items = [
        makeHighlight({ created: '2026-01-02T00:00:00.000Z' }),
        makeHighlight({ created: '2026-01-03T00:00:00.000Z' }),
        makeHighlight({ created: '2026-01-01T00:00:00.000Z' }),
      ];

      const sorted = [...items].sort(compareByCreated);
      expect(sorted[0].created).toBe('2026-01-03T00:00:00.000Z');
      expect(sorted[2].created).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('compareByModified', () => {
    it('sorts by modified date newest first', () => {
      const older = makeHighlight({
        created: '2026-01-01T00:00:00.000Z',
        modified: '2026-01-05T00:00:00.000Z',
      });
      const newer = makeHighlight({
        created: '2026-01-01T00:00:00.000Z',
        modified: '2026-01-10T00:00:00.000Z',
      });

      expect(compareByModified(older, newer)).toBeGreaterThan(0);
    });

    it('falls back to created when modified is undefined', () => {
      const a = makeHighlight({ created: '2026-01-10T00:00:00.000Z' });
      const b = makeHighlight({ created: '2026-01-01T00:00:00.000Z' });

      // a.modified is undefined, so uses a.created (Jan 10)
      // b.modified is undefined, so uses b.created (Jan 1)
      expect(compareByModified(a, b)).toBeLessThan(0); // a is newer
    });
  });
});
