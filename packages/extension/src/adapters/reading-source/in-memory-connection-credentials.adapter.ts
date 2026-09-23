import { Ok } from '@proso/shared';
import type { Result } from '@proso/shared';
import { validateStoredCredential } from '../../core/reading-source/connection-credentials';
import type {
  IConnectionCredentialsStore,
  StoredConnectionCredential,
} from '../../ports/connection-credentials.port';
import type { ReadingSourceError } from '../../ports/reading-source.port';

/** Test/offline credential store; never a production persistence fallback. */
export class InMemoryConnectionCredentialsStore implements IConnectionCredentialsStore {
  private readonly credentials = new Map<string, StoredConnectionCredential>();

  loadSync(connectionId: string): StoredConnectionCredential | null {
    return this.credentials.get(connectionId) ?? null;
  }

  async save(credential: StoredConnectionCredential): Promise<Result<void, ReadingSourceError>> {
    const valid = validateStoredCredential(credential);
    if (!valid.ok) return valid;
    this.credentials.set(credential.connectionId, credential);
    return Ok(undefined);
  }

  async load(
    connectionId: string,
  ): Promise<Result<StoredConnectionCredential | null, ReadingSourceError>> {
    return Ok(this.loadSync(connectionId));
  }

  async delete(connectionId: string): Promise<Result<void, ReadingSourceError>> {
    this.credentials.delete(connectionId);
    return Ok(undefined);
  }
}
