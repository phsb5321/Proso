import type { Result } from '@proso/shared';
import type { ReadingSourceError } from './reading-source.port';

/**
 * Extension-local Miniflux connection credential (REQ-002). Stored under its
 * own storage namespace: never part of the Settings schema, general settings
 * exports, document snapshots, DTOs, logs or TTS payloads.
 */
export interface StoredConnectionCredential {
  readonly connectionId: string;
  readonly baseUrl: string;
  readonly token: string;
}

/**
 * Local credential storage for reading-source connections.
 *
 * `save` validates and overwrites (token replacement deletes the previous
 * token); `delete` is Disconnect. Implementations must never log, echo or
 * export the token; failures are typed Results, not thrown secrets.
 */
export interface IConnectionCredentialsStore {
  save(credential: StoredConnectionCredential): Promise<Result<void, ReadingSourceError>>;
  load(
    connectionId: string,
  ): Promise<Result<StoredConnectionCredential | null, ReadingSourceError>>;
  delete(connectionId: string): Promise<Result<void, ReadingSourceError>>;
}
