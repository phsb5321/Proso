import { describe, expect, it } from '@jest/globals';
import {
  CheckpointSchema,
  ReadableDocumentSchema,
  SourceRefSchema,
  checkpointForDocumentSchema,
} from '@proso/shared';
import type { ReadableDocument } from '@proso/shared';

const id = `b1-${'a'.repeat(64)}`;
const otherId = `b1-${'b'.repeat(64)}`;
const document: ReadableDocument = {
  source: {
    provider: 'miniflux',
    connectionId: 'local-1',
    itemId: '1',
    canonicalUrl: 'https://publisher.test/a',
  },
  title: '',
  author: null,
  language: null,
  revision: `r1-${'a'.repeat(64)}`,
  blocks: [{ id, kind: 'paragraph', originalText: 'A😀B' }],
  coverage: { status: 'full', reasons: [] },
  fetchedAt: 0,
};
const checkpoint = {
  documentRevision: document.revision,
  blockId: id,
  sourceOffset: 1,
  audioOffsetMs: 0,
};

describe('reading document boundary schemas', () => {
  it('accepts nullable metadata and exactly the four public field sets', () => {
    expect(ReadableDocumentSchema.safeParse(document).success).toBe(true);
    expect(ReadableDocumentSchema.safeParse({ ...document, language: 'pt-BR' }).success).toBe(true);
    expect(ReadableDocumentSchema.safeParse({ ...document, token: 'secret' }).success).toBe(false);
  });
  it.each([-1, 0.5, NaN, Infinity])('rejects invalid offset %s', (sourceOffset) => {
    expect(CheckpointSchema.safeParse({ ...checkpoint, sourceOffset }).success).toBe(false);
  });
  it('rejects negative or nonfinite audio hints', () => {
    for (const audioOffsetMs of [-1, NaN, Infinity])
      expect(CheckpointSchema.safeParse({ ...checkpoint, audioOffsetMs }).success).toBe(false);
  });
  it('checks revision, block, range and surrogate boundaries against the document', () => {
    const schema = checkpointForDocumentSchema(document);
    for (const sourceOffset of [0, 1, 3, 4])
      expect(schema.safeParse({ ...checkpoint, sourceOffset }).success).toBe(true);
    for (const sourceOffset of [2, 5])
      expect(schema.safeParse({ ...checkpoint, sourceOffset }).success).toBe(false);
    expect(schema.safeParse({ ...checkpoint, blockId: otherId }).success).toBe(false);
    expect(
      schema.safeParse({ ...checkpoint, documentRevision: `r1-${'b'.repeat(64)}` }).success,
    ).toBe(false);
  });
  it('rejects duplicate, dangling, self and cyclic parent identities', () => {
    const block = document.blocks[0];
    for (const blocks of [
      [block, block],
      [{ ...block, parentId: otherId }],
      [{ ...block, parentId: id }],
      [
        { ...block, parentId: otherId },
        { ...block, id: otherId, parentId: id },
      ],
    ]) {
      expect(ReadableDocumentSchema.safeParse({ ...document, blocks }).success).toBe(false);
    }
    expect(
      ReadableDocumentSchema.safeParse({
        ...document,
        blocks: [block, { ...block, id: otherId, parentId: id }],
      }).success,
    ).toBe(true);
  });
  it('rejects malformed identities, active URLs, metadata and dishonest coverage', () => {
    for (const change of [
      { provider: 'other' },
      { connectionId: '' },
      { itemId: 'a\nb' },
      { canonicalUrl: 'javascript:alert(1)' },
      { canonicalUrl: 'https://token@host.test' },
    ]) {
      expect(SourceRefSchema.safeParse({ ...document.source, ...change }).success).toBe(false);
    }
    for (const change of [
      { language: 'not a language' },
      { fetchedAt: -1 },
      { blocks: [] },
      { coverage: { status: 'partial', reasons: [] } },
      { coverage: { status: 'full', reasons: ['omitted'] } },
    ]) {
      expect(ReadableDocumentSchema.safeParse({ ...document, ...change }).success).toBe(false);
    }
  });
});
