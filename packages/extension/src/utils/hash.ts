// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Small non-cryptographic string hashing shared by cache-key and telemetry
 * code paths (both previously carried a private copy of the same DJB2
 * implementation).
 *
 * @module utils/hash
 */

/**
 * DJB2 string hash, hex-encoded (8 chars). Deterministic, fast, NOT
 * cryptographic — never use for secrets or integrity.
 */
export function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * SHA-256 hex digest when Web Crypto is available, falling back to the
 * deterministic 32-bit djb2Hash when crypto.subtle is not. The name says what
 * it returns: a CALLER USING THIS AS A 256-BIT CACHE KEY MUST NOT SILENTLY
 * ACCEPT THE FALLBACK — 32-bit djb2 collisions can serve the wrong audio.
 * Cache-key callers must either reject the fallback or accept the 32-bit
 * collision risk deliberately.
 */
export async function sha256HexOrDjb2(input: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return djb2Hash(input);
  }
}
