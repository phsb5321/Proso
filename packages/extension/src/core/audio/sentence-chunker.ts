// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Sentence chunker for the local synthesis host (spec 100 FR-7, FR-11).
 *
 * The host cannot stream: it returns a whole WAV or a JSON envelope, so
 * time-to-first-audio equals full synthesis time for whatever is requested.
 * A paragraph sent in one piece is ~8s of silence before playback (measured
 * 7.5-8.3s for 656-727 bytes at RTF 0.195-0.276); sentence-granular requests
 * keep time-to-first-audio near 1-2s.
 *
 * Pure domain logic — no framework imports (architecture gate). Length is
 * measured in UTF-8 bytes via TextEncoder, never JavaScript string length.
 *
 * @module core/audio/sentence-chunker
 */

import { audioError } from '../shared/errors';
import type { AudioError } from '../shared/errors';
import type { Result } from '../shared/result';
import { Err, Ok } from '../shared/result';

/** Host input bound (`limits.maxTextUtf8Bytes`), enforced per chunk. */
export const CHUNK_MAX_TEXT_UTF8_BYTES = 8192;

/** Single sentence larger than the host bound is refused, never truncated. */
export class SentenceTooLongError extends Error {
  constructor(readonly byteLength: number) {
    super(`Single sentence is ${byteLength} UTF-8 bytes; the local host bound is 8192`);
    this.name = 'SentenceTooLongError';
  }
}

/**
 * Split text at sentence boundaries.
 *
 * A sentence ends at `.`, `!`, `?`, or `…` followed by whitespace or the end
 * of the string. The terminator is kept with its sentence. Runs of interior
 * whitespace are collapsed to single spaces so the host synthesizes clean
 * prosody. A trailing partial sentence (no terminator) is its own chunk —
 * paragraph text rarely ends mid-sentence, but refusing it would drop audio.
 *
 * Returns Err when any single sentence exceeds the host's UTF-8 byte bound —
 * the paragraph cannot be split further, so truncating would corrupt the
 * read. Property guarantees (asserted in tests): concatenation of the chunk
 * texts reproduces the input up to whitespace collapsing; no chunk is empty;
 * every chunk is within the byte bound.
 */
export function splitSentences(text: string): Result<string[], AudioError> {
  const input = (text ?? '').replace(/\s+/g, ' ').trim();
  if (input.length === 0) {
    return Err(audioError.providerError('appliance_invalid_input', 'Input text is empty'));
  }

  const chunks: string[] = [];
  let start = 0;
  let index = 0;
  const enc = new TextEncoder();

  while (index < input.length) {
    const char = input[index]!;
    if (char === '.' || char === '!' || char === '?') {
      // Ellipsis "…" is its own terminator; a "." sequence like "..." is
      // consumed as a unit so "lang…graph" stays one sentence's tail.
      let end = index + 1;
      while (end < input.length && input[end] === '.') end += 1;
      if (end < input.length && input[end] !== ' ') {
        // A period inside an abbreviation/number ("v1.2", "Mr. X") is not a
        // boundary — keep scanning. Cheap heuristic: no boundary when the
        // terminator is immediately followed by a non-space and the next
        // token is lowercase or a digit.
        const next = input[end]!;
        const after = end + 1 < input.length ? input[end + 1]! : '';
        if (/[a-z0-9]/.test(next) && /[^.!?]/.test(after)) {
          index = end;
          continue;
        }
      }
      chunks.push(input.slice(start, end).trim());
      start = end;
      index = end;
      continue;
    }
    if (char === '\u2026') {
      chunks.push(input.slice(start, index + 1).trim());
      start = index + 1;
    }
    index += 1;
  }

  if (start < input.length) {
    chunks.push(input.slice(start).trim());
  }

  const nonEmpty = chunks.filter((c) => c.length > 0);
  if (nonEmpty.length === 0) {
    return Err(audioError.providerError('appliance_invalid_input', 'Input text is empty'));
  }

  for (const chunk of nonEmpty) {
    if (enc.encode(chunk).length > CHUNK_MAX_TEXT_UTF8_BYTES) {
      return Err(
        audioError.providerError(
          'appliance_invalid_input',
          `Single sentence exceeds ${CHUNK_MAX_TEXT_UTF8_BYTES} UTF-8 bytes`,
        ),
      );
    }
  }

  return Ok(nonEmpty);
}

/** UTF-8 byte length of a string (not its character count). */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
