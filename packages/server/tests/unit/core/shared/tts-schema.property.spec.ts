import fc from 'fast-check';

import { TTSSynthesizeRequestSchema } from '@proso/shared';

const propertyOptions = {
  seed: Number(process.env.FC_SEED ?? 20260730),
  numRuns: Number(process.env.FC_NUM_RUNS ?? 100),
  verbose: true as const,
};

describe('TTS request schema properties', () => {
  it('accepts every non-empty text value inside the declared boundary', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 2_000 }), (text) => {
        expect(TTSSynthesizeRequestSchema.safeParse({ text }).success).toBe(true);
      }),
      propertyOptions,
    );
  });

  it('rejects empty and oversized text values', () => {
    expect(TTSSynthesizeRequestSchema.safeParse({ text: '' }).success).toBe(false);
    expect(TTSSynthesizeRequestSchema.safeParse({ text: 'x'.repeat(50_001) }).success).toBe(false);
  });
});
