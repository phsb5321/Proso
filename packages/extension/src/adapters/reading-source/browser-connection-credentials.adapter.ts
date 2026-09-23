import { Err, Ok } from '@proso/shared';
import type { Result } from '@proso/shared';
import { z } from 'zod';
import {
  connectionStorageKey,
  validateStoredCredential,
} from '../../core/reading-source/connection-credentials';
import type {
  IConnectionCredentialsStore,
  StoredConnectionCredential,
} from '../../ports/connection-credentials.port';
import type { ReadingSourceError } from '../../ports/reading-source.port';

const storedCredentialSchema = z
  .object({
    connectionId: z.string(),
    baseUrl: z.string(),
    token: z.string(),
  })
  .strict();

/**
 * browser.storage.local-backed credential store under a namespace disjoint
 * from every Settings key, so general settings exports never see it
 * (REQ-002/011). `save` overwrites (replacing a token deletes the previous
 * one); `delete` is Disconnect. Storage reads/writes fail closed as typed
 * Results — never thrown, never echoing the stored value.
 */
export class BrowserConnectionCredentialsStore implements IConnectionCredentialsStore {
  async save(credential: StoredConnectionCredential): Promise<Result<void, ReadingSourceError>> {
    const valid = validateStoredCredential(credential);
    if (!valid.ok) return valid;
    const key = connectionStorageKey(credential.connectionId);
    if (!key.ok) return key;
    try {
      await browser.storage.local.set({ [key.value]: credential });
      return Ok(undefined);
    } catch {
      return Err({ type: 'UNREADABLE' });
    }
  }

  async load(
    connectionId: string,
  ): Promise<Result<StoredConnectionCredential | null, ReadingSourceError>> {
    const key = connectionStorageKey(connectionId);
    if (!key.ok) return key;
    try {
      const result: Record<string, unknown> = await browser.storage.local.get(key.value);
      const raw: unknown = result[key.value];
      if (raw === undefined) return Ok(null);
      const parsed = storedCredentialSchema.safeParse(raw);
      if (!parsed.success) return Err({ type: 'UNREADABLE' });
      const valid = validateStoredCredential(parsed.data);
      if (!valid.ok) return Err({ type: 'UNREADABLE' });
      return Ok(parsed.data);
    } catch {
      return Err({ type: 'UNREADABLE' });
    }
  }

  async delete(connectionId: string): Promise<Result<void, ReadingSourceError>> {
    const key = connectionStorageKey(connectionId);
    if (!key.ok) return key;
    try {
      await browser.storage.local.remove(key.value);
      return Ok(undefined);
    } catch {
      return Err({ type: 'UNREADABLE' });
    }
  }
}
