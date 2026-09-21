// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

export const HOVER_PLAY_ORIGINS_KEY = 'hoverPlayOrigins';
const MAX_ENGAGED_ORIGINS = 50;

function isPageOrigin(origin: unknown): origin is string {
  if (typeof origin !== 'string') return false;
  try {
    const url = new URL(origin);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === origin;
  } catch {
    return false;
  }
}

/** Storage is untrusted; missing, malformed and opaque origins fail closed. */
export function shouldOfferHoverAffordance({
  origin,
  engagedOrigins,
}: {
  readonly origin: string | null | undefined;
  readonly engagedOrigins: unknown;
}): boolean {
  return isPageOrigin(origin) && Array.isArray(engagedOrigins) && engagedOrigins.includes(origin);
}

/** Retain only origins, most recently read first, without mutating the input. */
export function recordEngagedOrigin(list: unknown, origin: string | null | undefined): string[] {
  const previous = Array.isArray(list) ? list.filter(isPageOrigin) : [];
  const origins = isPageOrigin(origin) ? [origin, ...previous] : previous;
  return [...new Set(origins)].slice(0, MAX_ENGAGED_ORIGINS);
}
