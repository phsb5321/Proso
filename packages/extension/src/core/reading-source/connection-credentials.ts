import { Err, Ok } from '@proso/shared';
import type { Result } from '@proso/shared';
import type { StoredConnectionCredential } from '../../ports/connection-credentials.port';
import type { ReadingSourceError } from '../../ports/reading-source.port';

/**
 * Hard gate (spec acceptance criterion 6 / T003): production real-adapter
 * paths, including probes and retries, stay disabled until the governance
 * decision is recorded as landed. Flipping this constant is a governance
 * change, not an implementation detail.
 */
export const READING_SOURCE_LIVE_TRAFFIC_ENABLED = false;

/** Parsed, exactly bound connection destination. */
export interface ConnectionConfigOrigin {
  /** Normalized HTTPS origin, explicit non-default port included. */
  readonly origin: string;
  /** Exact-origin match pattern for runtime permission validation. */
  readonly originPattern: string;
  /** Base path with trailing slashes stripped; '' at the root. */
  readonly basePath: string;
}

/** Token-free view for UI surfaces, diagnostics and settings exports. */
export interface ConnectionPublicSummary {
  readonly connectionId: string;
  readonly origin: string;
  readonly basePath: string;
}

const CONNECTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Storage namespace is disjoint from every Settings key by construction. */
export function connectionStorageKey(connectionId: string): Result<string, ReadingSourceError> {
  return CONNECTION_ID_PATTERN.test(connectionId)
    ? Ok(`readingSourceConnection:${connectionId}`)
    : Err({ type: 'SOURCE_BINDING' });
}

/**
 * Exact HTTPS origin/port binding for a configured instance (REQ-002):
 * https only; userinfo, query, fragment and %-escaped or backslashed paths
 * are refused. The normalized origin (default port dropped, explicit
 * non-default port kept) is what permission checks and requests must use.
 */
export function parseConnectionConfig(
  baseUrl: string,
): Result<ConnectionConfigOrigin, ReadingSourceError> {
  try {
    const url = new URL(baseUrl);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      // Raw-string check: WHATWG normalization collapses %2e%2e path tricks
      // and backslashes before the parsed pathname can be inspected.
      /[%\\]/.test(baseUrl)
    ) {
      return Err({ type: 'SOURCE_BINDING' });
    }
    return Ok({
      origin: url.origin,
      originPattern: `${url.origin}/*`,
      basePath: url.pathname.replace(/\/+$/, ''),
    });
  } catch {
    return Err({ type: 'SOURCE_BINDING' });
  }
}

/** Admission check before a credential is stored: config, id and token shape. */
export function validateStoredCredential(
  credential: StoredConnectionCredential,
): Result<ConnectionConfigOrigin, ReadingSourceError> {
  const key = connectionStorageKey(credential.connectionId);
  if (!key.ok) return key;
  const origin = parseConnectionConfig(credential.baseUrl);
  if (!origin.ok) return origin;
  if (!credential.token || credential.token.length > 256 || /[\p{Cc}\s]/u.test(credential.token)) {
    return Err({ type: 'SOURCE_BINDING' });
  }
  return Ok(origin.value);
}

export interface RequestAuthorization {
  readonly governanceEnabled: boolean;
  readonly credentialPresent: boolean;
  readonly permissionContains: boolean;
}

/**
 * Admission gate before any reading-source request (REQ-002/011). Order is
 * normative: governance first (no permission probe or traffic while
 * hard-disabled), then credential presence, then the runtime permission
 * verdict. Every refusal path performs zero network requests.
 */
export function authorizeSourceRequest(
  authorization: RequestAuthorization,
): Result<void, ReadingSourceError> {
  if (!authorization.governanceEnabled) return Err({ type: 'GOVERNANCE_DISABLED' });
  if (!authorization.credentialPresent) return Err({ type: 'NOT_CONFIGURED' });
  if (!authorization.permissionContains) return Err({ type: 'PERMISSION_DENIED' });
  return Ok(undefined);
}

/** Token-free projection of a stored credential for any public surface. */
export function toPublicSummary(
  credential: StoredConnectionCredential,
  origin: ConnectionConfigOrigin,
): ConnectionPublicSummary {
  return {
    connectionId: credential.connectionId,
    origin: origin.origin,
    basePath: origin.basePath,
  };
}
