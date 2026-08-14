// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Host-pattern helpers (PROSO-114 / Feature 169).
 *
 * WebExtension MatchPattern grammar supports a scheme and host but has no port
 * component. A reader-entered origin on a non-default port therefore needs a
 * host-wide permission pattern, while the network adapter remains pinned to
 * the exact persisted origin. These pure helpers keep request construction and
 * effective-grant checks on the same browser-valid grammar.
 *
 * @module utils/permissions/match-pattern
 */

/** A granted origin pattern from `browser.permissions.getAll().origins`. */
export type GrantedOriginPattern = string;

/**
 * Return the narrowest browser-expressible host permission for an exact
 * http(s) origin. Paths, credentials, queries, fragments, and foreign schemes
 * fail closed because callers must pass an origin, not an arbitrary URL.
 *
 * MatchPattern cannot encode a port. For example, an exact destination of
 * `http://127.0.0.1:45019` requires `http://127.0.0.1/*`; callers MUST still
 * send traffic only to the original destination.
 */
export function hostPermissionPatternForOrigin(origin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
  if (parsed.pathname !== '/') return null;

  return `${parsed.protocol}//${parsed.hostname}/*`;
}

export type HostPermissionRequestResult =
  | { readonly ok: true; readonly pattern: string }
  | {
      readonly ok: false;
      readonly reason: 'invalid' | 'denied' | 'unavailable';
      readonly message: string;
    };

export interface HostPermissionRequester {
  request(permissions: { origins: string[] }): Promise<boolean>;
}

/**
 * Invoke the browser permission API synchronously from the caller's user
 * gesture, then convert denial and API rejection into a typed result. This
 * function never rejects, so every public grant surface can remain actionable.
 */
export async function requestHostPermissionForOrigin(
  origin: string,
  requester: HostPermissionRequester,
): Promise<HostPermissionRequestResult> {
  const pattern = hostPermissionPatternForOrigin(origin);
  if (!pattern) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'The browser cannot request host access for this address.',
    };
  }

  try {
    // Calling request() before this function's first await preserves the user
    // activation inherited from the click handler.
    const granted = await requester.request({ origins: [pattern] });
    return granted
      ? { ok: true, pattern }
      : { ok: false, reason: 'denied', message: 'Host permission was not granted.' };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: 'unavailable',
      message: `The browser could not request host access. ${detail}`,
    };
  }
}

/**
 * Parse the exact subset of WebExtension MatchPattern hosts Proso grants.
 * Requiring `/*` and forbidding a port is intentional: Firefox can retain a
 * port-bearing string in its grant table even though that pattern covers no
 * request. Treating such a string as effective creates an unrecoverable retry
 * loop, so malformed and legacy port-bearing patterns fail closed.
 */
function parseSupportedPattern(
  pattern: string,
): { readonly protocol: 'http:' | 'https:'; readonly hostname: string } | null {
  const match = /^(https?):\/\/(\*|\[[0-9a-f:.]+\]|[^/:*]+)\/\*$/i.exec(pattern);
  if (!match) return null;

  const protocol = `${match[1].toLowerCase()}:` as 'http:' | 'https:';
  const rawHostname = match[2];
  if (rawHostname === '*') return { protocol, hostname: rawHostname };

  try {
    const hostname = new URL(`${protocol}//${rawHostname}`).hostname.toLowerCase();
    return { protocol, hostname };
  } catch {
    return null;
  }
}

/**
 * True when `pattern` covers `origin` (scheme and host only — MatchPattern
 * cannot express a port).
 *
 * Supported shapes are the subset the extension manifests and runtime grant
 * flow use: `<all_urls>`, an any-host http(s) pattern, and one exact host on
 * one scheme. Any other shape is treated as non-matching (fail closed).
 */
export function patternCoversOrigin(pattern: string, origin: string): boolean {
  let target: URL;
  try {
    target = new URL(origin);
  } catch {
    return false;
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return false;

  if (pattern === '<all_urls>') return true;

  const parsed = parseSupportedPattern(pattern);
  if (!parsed || parsed.protocol !== target.protocol) return false;
  if (parsed.hostname === '*') return true;
  return parsed.hostname === target.hostname.toLowerCase();
}

/**
 * True when any granted pattern covers the configured origin. Empty grant
 * sets cover nothing.
 */
export function originCoveredByGrantedPatterns(
  origin: string,
  grantedPatterns: readonly GrantedOriginPattern[],
): boolean {
  return grantedPatterns.some((pattern) => patternCoversOrigin(pattern, origin));
}
