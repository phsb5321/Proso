import { webcrypto } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import type { Block, Checkpoint } from '@proso/shared';
import vectors from '../../../../../../specs/252-listening-queue/identity-vectors.json';
import { sourceDigest } from '../../../../src/adapters/reading-source/source-digest';
import { extractSourceText } from '../../../../src/adapters/reading-source/source-text';
import {
  createReadableDocument,
  deriveDocumentIdentity,
  documentPreimage,
  validateDocumentIdentity,
} from '../../../../src/core/reading-source/document-identity';
import {
  recoverSourceCheckpoint,
  spokenOffsetToSource,
  spokenPlanKey,
} from '../../../../src/core/reading-source/source-position';
import type { PronunciationEntry } from '../../../../src/core/speech/pronunciation-lexicon';
import { buildSpokenPlan } from '../../../../src/core/speech/spoken-plan';

Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, value: webcrypto.subtle });
const metadata = {
  source: {
    provider: 'miniflux' as const,
    connectionId: 'a',
    itemId: '1',
    canonicalUrl: 'https://publisher.test/a',
  },
  title: 'Title',
  author: null,
  language: null,
  fetchedAt: 0,
};
async function makeDocument(html = '<p>A😀 2022 Proso</p>') {
  const extracted = extractSourceText(html);
  if (!extracted.ok) throw new Error('Invalid fixture');
  const result = await createReadableDocument(metadata, extracted.value, sourceDigest);
  if (!result.ok) throw new Error('Invalid fixture identity');
  return result.value;
}

describe('document-golden-vectors', () => {
  it.each(vectors)('matches literal bytes, full SHA-256 and ordinal IDs: $name', async (vector) => {
    const [version, rows] = vector.preimage as [string, [Block['kind'], string, number | null][]];
    const blocks = rows.map(([kind, originalText, parentOrdinal]) => ({
      kind,
      originalText,
      parentOrdinal,
    }));
    expect(Buffer.from(documentPreimage(blocks, version)).toString('hex')).toBe(
      vector.preimageUtf8Hex,
    );
    const result = await deriveDocumentIdentity(
      { blocks, coverage: { status: 'full', reasons: [] } },
      sourceDigest,
      version,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.revision).toBe(vector.revision);
    expect(result.value.blocks.map((block) => block.id)).toEqual(vector.blockIds);
    for (const [ordinal, block] of result.value.blocks.entries()) {
      const parent = rows[ordinal][2];
      expect(block.parentId).toBe(parent === null ? undefined : vector.blockIds[parent]);
    }
  });
  it('ignores all metadata and read state, but changes on text or order', async () => {
    const document = await makeDocument('<p>Echo</p><p>Echo</p>');
    expect(document.revision).toBe(vectors[0].revision);
    const updated = {
      ...document,
      title: 'new',
      author: 'Author',
      language: 'pt-BR',
      fetchedAt: 123,
      source: { ...document.source, connectionId: 'b', canonicalUrl: 'https://other.test/' },
      coverage: { status: 'partial' as const, reasons: ['omitted'] },
      read: true,
    };
    const { read: _read, ...snapshot } = updated;
    expect(await validateDocumentIdentity(snapshot, sourceDigest)).toEqual({
      ok: true,
      value: undefined,
    });
    expect((await makeDocument('<p>Different</p><p>Echo</p>')).revision).not.toBe(
      document.revision,
    );
    expect((await makeDocument('<h2>Start</h2><p>Echo</p>')).revision).not.toBe(
      (await makeDocument('<p>Echo</p><h2>Start</h2>')).revision,
    );
  });
  it('rejects corrupt text and IDs even if their shape is valid', async () => {
    const document = await makeDocument();
    expect(
      (
        await validateDocumentIdentity(
          { ...document, blocks: [{ ...document.blocks[0], originalText: 'tampered' }] },
          sourceDigest,
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await validateDocumentIdentity(
          { ...document, blocks: [{ ...document.blocks[0], id: `b1-${'0'.repeat(64)}` }] },
          sourceDigest,
        )
      ).ok,
    ).toBe(false);
  });
});

describe('source-relative checkpoint recovery', () => {
  it('repairs emoji splits backwards and malformed positions to start, never forward to completion', async () => {
    const document = await makeDocument();
    for (const [sourceOffset, expected] of [
      [2, 1],
      [-1, 0],
      [0.5, 0],
      [NaN, 0],
      [Infinity, 0],
      [1000, 0],
    ]) {
      const checkpoint: Checkpoint = {
        documentRevision: document.revision,
        blockId: document.blocks[0].id,
        sourceOffset,
        audioOffsetMs: 20,
      };
      const result = await recoverSourceCheckpoint(document, checkpoint, sourceDigest);
      expect(result.ok && result.value).toEqual({
        checkpoint: { ...checkpoint, sourceOffset: expected, audioOffsetMs: 0 },
        repaired: true,
        discardAudioHint: true,
        invalidateFrom: expected,
      });
    }
  });
  it('keeps end-of-block on the same block; unknown blocks/revisions are quarantined', async () => {
    const document = await makeDocument('<p>First</p><p>Second</p>');
    const checkpoint = {
      documentRevision: document.revision,
      blockId: document.blocks[0].id,
      sourceOffset: 5,
      audioOffsetMs: 0,
    };
    const result = await recoverSourceCheckpoint(document, checkpoint, sourceDigest);
    expect(result.ok && result.value.checkpoint).toEqual(checkpoint);
    for (const change of [
      { blockId: `b1-${'0'.repeat(64)}` },
      { documentRevision: `r1-${'0'.repeat(64)}` },
    ])
      expect(
        (await recoverSourceCheckpoint(document, { ...checkpoint, ...change }, sourceDigest)).ok,
      ).toBe(false);
  });
  it('projects speech expansions to source starts and invalidates changed lexicon/version evidence', async () => {
    const document = await makeDocument();
    const text = document.blocks[0].originalText;
    const plan = buildSpokenPlan(text, 'en');
    const replacement = plan.segments.find((part) => part.kind === 'replace');
    expect(replacement).toBeDefined();
    if (!replacement) return;
    expect(spokenOffsetToSource(plan, replacement.spokenStart + 3)).toEqual({ ok: true, value: 4 });
    expect(spokenOffsetToSource(plan, plan.spokenText.length)).toEqual({
      ok: true,
      value: text.length,
    });
    expect(spokenOffsetToSource(plan, 2)).toEqual({ ok: true, value: 1 });
    const lexicon: PronunciationEntry[] = [
      {
        id: 'p',
        locale: 'en',
        match: 'Proso',
        spoken: 'Pro zoo',
        matchMode: 'word',
        caseSensitive: true,
        enabled: true,
      },
    ];
    const changed = buildSpokenPlan(text, 'en', lexicon);
    expect(await spokenPlanKey(changed, lexicon, sourceDigest)).not.toEqual(
      await spokenPlanKey(plan, [], sourceDigest),
    );
    expect(
      await spokenPlanKey({ ...plan, revision: 'future-version' }, [], sourceDigest),
    ).not.toEqual(await spokenPlanKey(plan, [], sourceDigest));
    const checkpoint = {
      documentRevision: document.revision,
      blockId: document.blocks[0].id,
      sourceOffset: 6,
      audioOffsetMs: 100,
    };
    const result = await recoverSourceCheckpoint(document, checkpoint, sourceDigest, changed);
    expect(result.ok && result.value.checkpoint.sourceOffset).toBe(4);
    expect(result.ok && result.value.invalidateFrom).toBe(0);
    expect(result.ok && result.value.checkpoint.audioOffsetMs).toBe(0);
    expect((await validateDocumentIdentity(document, sourceDigest)).ok).toBe(true);
  });
});
