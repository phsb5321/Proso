// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

import { describe, expect, it } from '@jest/globals';
import {
  recordEngagedOrigin,
  shouldOfferHoverAffordance,
} from '../../../src/utils/content/hover-affordance-policy';

const ORIGIN = 'https://example.com';

describe('shouldOfferHoverAffordance', () => {
  it('requires prior engagement with the exact origin', () => {
    expect(shouldOfferHoverAffordance({ origin: ORIGIN, engagedOrigins: [] })).toBe(false);
    expect(shouldOfferHoverAffordance({ origin: ORIGIN, engagedOrigins: [ORIGIN] })).toBe(true);
    for (const origin of ['http://example.com', 'https://example.com:8443', 'https://sub.example.com']) {
      expect(shouldOfferHoverAffordance({ origin, engagedOrigins: [ORIGIN] })).toBe(false);
    }
  });

  it('does not treat an extension popup as a page origin or transfer engagement to another origin', () => {
    const engagedOrigins = recordEngagedOrigin([], ORIGIN);
    expect(shouldOfferHoverAffordance({ origin: ORIGIN, engagedOrigins })).toBe(true);
    expect(shouldOfferHoverAffordance({ origin: 'https://first-visit.example', engagedOrigins })).toBe(false);
    const popupOrigin = 'moz-extension://22900000-0000-4000-8000-000000000023';
    expect(recordEngagedOrigin(engagedOrigins, popupOrigin)).toEqual(engagedOrigins);
    expect(shouldOfferHoverAffordance({ origin: popupOrigin, engagedOrigins: [popupOrigin] })).toBe(false);
  });

  it.each([undefined, null, '', 'null', 'file://', 'not a url', `${ORIGIN}/page`])(
    'rejects missing or invalid origin %s even if present in storage', (origin) => {
      expect(shouldOfferHoverAffordance({ origin, engagedOrigins: [origin] })).toBe(false);
    },
  );

  it.each([undefined, null, ORIGIN, {}, 42])('fails closed on malformed storage %s', (engagedOrigins) => {
    expect(shouldOfferHoverAffordance({ origin: ORIGIN, engagedOrigins })).toBe(false);
  });
});

describe('recordEngagedOrigin', () => {
  it('deduplicates and moves a repeated origin to the front without mutating the input', () => {
    const list = Object.freeze(['https://other.example', ORIGIN, ORIGIN]);
    expect(recordEngagedOrigin(list, ORIGIN)).toEqual([ORIGIN, 'https://other.example']);
    expect(list).toHaveLength(3);
  });

  it('caps at 50 most recent origins, dropping the oldest', () => {
    const list = Array.from({ length: 50 }, (_, i) => `https://site${i}.example`);
    expect(recordEngagedOrigin(list, ORIGIN)).toEqual([ORIGIN, ...list.slice(0, 49)]);
  });

  it.each([undefined, null, '', 'null', 'not a url'])('does not record absent origin %s', (origin) => {
    expect(recordEngagedOrigin([ORIGIN], origin)).toEqual([ORIGIN]);
  });

  it('recovers from malformed storage and removes invalid entries', () => {
    expect(recordEngagedOrigin({}, ORIGIN)).toEqual([ORIGIN]);
    expect(recordEngagedOrigin([null, 3, 'null', `${ORIGIN}/path`, ORIGIN], ORIGIN)).toEqual([ORIGIN]);
  });
});
