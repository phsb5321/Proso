import { Err, Ok } from '@proso/shared';
import type { SourceDigest } from '../../core/reading-source/document-identity';

export const sourceDigest: SourceDigest = async (preimage) => {
  try {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(preimage));
    return Ok(
      Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    );
  } catch {
    return Err({ type: 'INVALID_RESPONSE' });
  }
};
