// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Host-pattern coverage helper (PROSO-114).
 *
 * `browser.permissions.contains()` answers against the optional-grant table
 * only: on a build whose manifest carries all_urls at install time (the
 * reading journey's host access), the install-time grant already covers a
 * user-configured host, but `contains()` still returns false — so a gate
 * built on it can never pass and the feature is unreachable. Effective
 * access must be consulted instead: `browser.permissions.getAll()` returns
 * every granted origin pattern, install-time and optional alike.
 *
 * This module implements the subset of Chrome/Firefox match-pattern
 * semantics the gate needs: does any granted pattern cover the configured
 * origin? Pure logic — no framework imports, directly unit-testable.
 *
 * @module utils/permissions/match-pattern
 */

/** A granted origin pattern from `browser.permissions.getAll().origins`. */
export type GrantedOriginPattern = string;

/**
 * True when `pattern` covers `origin` (scheme://host only — paths are
 * irrelevant to host access).
 *
 * Supported shapes (the subset the extension's manifests actually use):
 * - all_urls — covers every http(s) origin.
 * - any-host patterns (`http:` or `https:` with a wildcard host).
 * - one exact host on one scheme.
 * Any other shape is treated as non-matching (fail closed).
 */
export function patternCoversOrigin(pattern: string, origin: string): boolean {
  if (pattern === '<all_urls>') return true;

  let parsed: URL;
  try {
    parsed = new URL(pattern.replace(/\*\/$/, ''));
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  let target: URL;
  try {
    target = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== target.protocol) return false;

  if (parsed.hostname === '*') return true;
  return parsed.hostname === target.hostname;
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
