/**
 * Licence status sentences.
 *
 * The settings page shows one line, and that line is the whole report a reader
 * gets about what they paid for. These tests pin the four states it has to
 * tell apart, including the two a hopeful implementation collapses: "saved but
 * the server could not be asked" and "saved but the server says it is not a
 * paid plan".
 *
 * @module tests/unit/license/license-status
 */

import { describe, expect, it } from '@jest/globals';

import {
  type LicenseStatus,
  NO_LICENSE_STATUS,
  describeLicenseAccepted,
  describeLicenseFailure,
  describeLicenseStatus,
  isPaidTier,
} from '../../../src/utils/license/license-status';

const paid: LicenseStatus = {
  configured: true,
  maskedKey: '•••• 4C2A',
  tier: 'pro',
  credits: { total: 500_000, remaining: 412_500 },
  serverReachable: true,
};

describe('isPaidTier', () => {
  it('accepts the tiers that entitle managed synthesis', () => {
    expect(isPaidTier('pro')).toBe(true);
    expect(isPaidTier('enterprise')).toBe(true);
  });

  it('rejects Free, which is what an unknown key resolves to (INV-001)', () => {
    expect(isPaidTier('free')).toBe(false);
    expect(isPaidTier(null)).toBe(false);
    expect(isPaidTier(undefined)).toBe(false);
    expect(isPaidTier('Pro')).toBe(false);
  });
});

describe('describeLicenseStatus', () => {
  it('says no key is needed to read when none is configured', () => {
    const line = describeLicenseStatus(NO_LICENSE_STATUS);
    expect(line).toContain('No licence key saved');
    expect(line).toContain('no account');
  });

  it('reports the plan and the remaining credits for a confirmed paid key', () => {
    const line = describeLicenseStatus(paid);
    expect(line).toContain('•••• 4C2A');
    expect(line).toContain('Plan: Pro');
    expect(line).toContain('412,500 of 500,000 credits remaining');
  });

  it('separates an unreachable server from a rejected key', () => {
    const line = describeLicenseStatus({ ...paid, serverReachable: false, tier: null });
    expect(line).toContain('could not be reached');
    expect(line).not.toContain('no paid plan');
  });

  it('says so plainly when the server reports no paid plan', () => {
    const line = describeLicenseStatus({ ...paid, tier: 'free', credits: null });
    expect(line).toContain('no paid plan');
    expect(line).not.toContain('Plan: ');
  });

  it('never puts a plan on screen without a tier, even with credits present', () => {
    const line = describeLicenseStatus({ ...paid, tier: null });
    expect(line).not.toContain('412,500');
  });
});

describe('describeLicenseAccepted', () => {
  it('leads with the validation, then reports the same facts', () => {
    const line = describeLicenseAccepted(paid);
    expect(line.startsWith('Licence validated.')).toBe(true);
    expect(line).toContain('Plan: Pro');
  });
});

describe('describeLicenseFailure', () => {
  it('promises the previously saved key was left alone', () => {
    const line = describeLicenseFailure('The server does not recognise this key.', paid);
    expect(line).toContain('does not recognise');
    expect(line).toContain('•••• 4C2A');
    expect(line).toContain('left unchanged');
  });

  it('does not claim a key survived when there was none', () => {
    const line = describeLicenseFailure('The server could not be reached.', NO_LICENSE_STATUS);
    expect(line).toContain('Nothing was saved.');
    expect(line).not.toContain('left unchanged');
  });
});
