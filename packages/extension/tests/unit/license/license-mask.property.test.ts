/**
 * Licence mask properties.
 *
 * The settings page has to say "a key is saved" after a reload without putting
 * the key back on screen. That makes the mask a disclosure boundary, and a
 * boundary is worth stating as properties rather than as three examples: what
 * matters is that NO key survives it, not that the three keys someone thought
 * of do not.
 *
 * @module tests/unit/license/license-mask.property
 */

import { describe, expect, it } from '@jest/globals';
import fc from 'fast-check';

import { maskLicenseKey } from '../../../src/utils/license/license-status';

const propertyOptions = {
  seed: Number(process.env.FC_SEED ?? 20260730),
  numRuns: Number(process.env.FC_NUM_RUNS ?? 100),
  verbose: true as const,
};

/** The alphabet real licence keys are drawn from. */
const keyChar = fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-'.split(''));
const licenseKey = fc
  .array(keyChar, { minLength: 1, maxLength: 64 })
  .map((chars) => chars.join(''));
const longKey = fc.array(keyChar, { minLength: 8, maxLength: 64 }).map((chars) => chars.join(''));

describe('licence mask properties', () => {
  it('never contains the key it describes', () => {
    fc.assert(
      fc.property(licenseKey, (key) => {
        const masked = maskLicenseKey(key);
        expect(masked).not.toBeNull();
        expect(masked as string).not.toContain(key);
      }),
      propertyOptions,
    );
  });

  it('reveals at most four characters of the key', () => {
    fc.assert(
      fc.property(licenseKey, (key) => {
        const revealed = (maskLicenseKey(key) as string).replace(/[•\s]/g, '');
        expect(revealed.length).toBeLessThanOrEqual(4);
        if (revealed.length > 0) {
          expect(key.endsWith(revealed)).toBe(true);
        }
      }),
      propertyOptions,
    );
  });

  it('discloses no length: every key of usable length masks to the same width', () => {
    fc.assert(
      fc.property(longKey, longKey, (a, b) => {
        expect((maskLicenseKey(a) as string).length).toBe((maskLicenseKey(b) as string).length);
      }),
      propertyOptions,
    );
  });

  it('cannot distinguish two keys that differ only in the hidden part', () => {
    fc.assert(
      fc.property(longKey, longKey, (a, b) => {
        // Another key's hidden prefix, this key's revealed suffix: still at
        // least eight characters, and indistinguishable from `a` in the UI.
        const sameSuffix = `${b.slice(0, -4)}${a.slice(-4)}`;
        expect(maskLicenseKey(sameSuffix)).toBe(maskLicenseKey(a));
      }),
      propertyOptions,
    );
  });

  it('describes nothing when there is nothing to describe', () => {
    fc.assert(
      fc.property(fc.constantFrom('', '   ', '\n\t'), (blank) => {
        expect(maskLicenseKey(blank)).toBeNull();
      }),
      propertyOptions,
    );
    expect(maskLicenseKey(null)).toBeNull();
    expect(maskLicenseKey(undefined)).toBeNull();
  });

  it('reveals nothing at all for a key too short to hide behind four characters', () => {
    fc.assert(
      fc.property(
        fc.array(keyChar, { minLength: 1, maxLength: 7 }).map((chars) => chars.join('')),
        (shortKey) => {
          expect(maskLicenseKey(shortKey)).toBe('••••');
        },
      ),
      propertyOptions,
    );
  });
});
