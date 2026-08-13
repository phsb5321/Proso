/**
 * Licence Message Handlers
 *
 * The production path for a paid licence key: validate it, confirm it, persist
 * it, adopt it, and report what the server actually says about it. Before this module
 * the extension had complete licence plumbing — config schema, defaults,
 * storage read, container wiring, `X-License-Key` injection — and no code path
 * that ever set a key, so `ProsoApiAdapter.validateLicense`, `getSubscription`
 * and `setLicenseKey` were reachable only from tests
 * (`docs/money-path.md`, dead-wiring instances 7-10).
 *
 * Two ordering rules make the reported outcome true rather than optimistic:
 *
 * - the public `POST /api/v1/license/validate` must answer `valid` with a paid
 *   tier, then an explicit-key subscription readback must confirm that tier and
 *   current credits. Only after durable storage succeeds does the live API
 *   client adopt the key. A response that claims paid while readback stays Free
 *   is a failure, not a success;
 * - any failure leaves the previously adopted key and storage untouched. A
 *   network error or a mistyped key can never cost a reader the licence they
 *   already had, even briefly in a concurrent synthesis request.
 *
 * The raw key never leaves the background: every response carries the mask.
 *
 * @module handlers/license
 */

import { browser } from 'wxt/browser';
import type { ApiClientError, IApiClient } from '../ports/api-client.port';
import {
  type LicenseStatus,
  NO_LICENSE_STATUS,
  isPaidTier,
  maskLicenseKey,
} from '../utils/license/license-status';
import type { HandlerRegistry } from './registry';

/** Storage key the container reads at start-up (`background/init-hexagonal.ts`). */
const LICENSE_KEY_STORAGE_KEY = 'licenseKey';

// ============================================
// Response Types
// ============================================

/**
 * Why a validation did not succeed. The message is the sentence the reader
 * sees, so each one names the specific thing that happened.
 */
export type LicenseHandlerError =
  | { type: 'empty_key'; message: string }
  | { type: 'not_configured'; message: string }
  | { type: 'unrecognised_key'; message: string }
  | { type: 'unconfirmed_subscription'; message: string }
  | { type: 'network'; message: string }
  | { type: 'storage'; message: string };

/** Response for `license.getStatus`. */
export interface LicenseStatusResponse {
  success: true;
  status: LicenseStatus;
}

/** Response for `license.validate`. `status` is always the state that now holds. */
export type LicenseValidateResponse =
  | { success: true; status: LicenseStatus }
  | { success: false; error: LicenseHandlerError; status: LicenseStatus };

interface ValidateParams {
  licenseKey?: string;
}

// ============================================
// Module State
// ============================================

let apiClient: IApiClient | null = null;

/**
 * One mutable API client serves settings and synthesis. Serialize status reads
 * and candidate commits so two settings tabs cannot swap its key underneath
 * each other's authenticated subscription readback.
 */
let operationTail: Promise<void> = Promise.resolve();

function serializeLicenseOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationTail.then(operation);
  operationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Set the API client instance for licence handlers.
 * Called during container initialization.
 */
export function setLicenseApiClient(client: IApiClient): void {
  apiClient = client;
}

// ============================================
// Helpers
// ============================================

async function readStoredKey(): Promise<string | null> {
  const stored = await browser.storage.local.get(LICENSE_KEY_STORAGE_KEY);
  const key = stored[LICENSE_KEY_STORAGE_KEY];
  return typeof key === 'string' && key.trim().length > 0 ? key : null;
}

/**
 * Turn an adapter error into an actionable sentence without reflecting an
 * arbitrary server/network message. Error bodies can echo the credential that
 * was submitted; rendering or logging that text would reveal it.
 */
function describeApiError(error: ApiClientError): string {
  switch (error.type) {
    case 'timeout':
      return `The Proso server did not answer within ${Math.round(error.timeoutMs / 1000)}s.`;
    case 'network':
      return 'The Proso server could not be reached. Check your connection and try again.';
    case 'unauthorized':
      return 'The server rejected this licence key.';
    case 'server_error':
      return `The Proso server could not complete the licence check (HTTP ${error.status}).`;
    case 'invalid_response':
      return 'The Proso server returned an unreadable licence response.';
    case 'not_configured':
      return 'The licence could not be checked because no Proso server is configured.';
    case 'aborted':
      return 'The licence check was interrupted. Try again.';
  }
}

function statusFor(
  key: string,
  tier: string | null,
  credits: LicenseStatus['credits'],
  serverReachable: boolean,
): LicenseStatus {
  return {
    configured: true,
    maskedKey: maskLicenseKey(key),
    tier,
    credits,
    serverReachable,
  };
}

/** Normalize a server credit balance onto the two numbers the UI reports. */
function toCredits(
  balance: { total?: number; remaining?: number } | null | undefined,
): LicenseStatus['credits'] {
  if (!balance || typeof balance.total !== 'number' || typeof balance.remaining !== 'number') {
    return null;
  }
  const { total, remaining } = balance;
  if (
    !Number.isFinite(total) ||
    !Number.isFinite(remaining) ||
    total < 0 ||
    remaining < 0 ||
    remaining > total
  ) {
    return null;
  }
  return { total, remaining };
}

/** The status of whatever key is currently stored, without asking the server. */
async function storedStatus(): Promise<LicenseStatus> {
  const key = await readStoredKey();
  if (!key) return NO_LICENSE_STATUS;
  return statusFor(key, null, null, false);
}

function failure(
  error: LicenseHandlerError,
  status: LicenseStatus,
): { success: false; error: LicenseHandlerError; status: LicenseStatus } {
  return { success: false, error, status };
}

// ============================================
// Handlers
// ============================================

/**
 * Report the stored licence, and — when a server is configured — what that
 * server says about it right now.
 *
 * The live ask is deliberate: a tier echoed from the moment of validation
 * would keep reading Pro after the plan lapsed. Asking also exercises the
 * `X-License-Key` header the adapter injects, so a settings page that reports
 * a plan is reporting a request that actually authenticated.
 */
async function handleGetStatus(): Promise<LicenseStatusResponse> {
  const key = await readStoredKey();
  if (!key) return { success: true, status: NO_LICENSE_STATUS };

  const client = apiClient;
  if (!client?.isConfigured) {
    return { success: true, status: statusFor(key, null, null, false) };
  }

  // Storage is authoritative across restarts. Re-adopt it before asking so a
  // status read also repairs any stale in-memory client state.
  client.setLicenseKey(key);
  let subscription: Awaited<ReturnType<IApiClient['getSubscription']>>;
  try {
    subscription = await client.getSubscription();
  } catch {
    return { success: true, status: statusFor(key, null, null, false) };
  }
  if (!subscription.ok) {
    return { success: true, status: statusFor(key, null, null, false) };
  }

  return {
    success: true,
    status: statusFor(key, subscription.value.tier, toCredits(subscription.value.credits), true),
  };
}

/**
 * Validate a key the reader typed and, only if the server confirms a paid
 * plan for it, persist and adopt it.
 */
async function handleValidate(params: ValidateParams): Promise<LicenseValidateResponse> {
  const previous = await storedStatus();
  const key = (params.licenseKey ?? '').trim();

  if (key.length === 0) {
    return failure({ type: 'empty_key', message: 'Enter a licence key first.' }, previous);
  }

  const client = apiClient;
  if (!client?.isConfigured) {
    return failure(
      {
        type: 'not_configured',
        message: 'No Proso server is configured, so a licence cannot be checked.',
      },
      previous,
    );
  }

  // Storage is the rollback point and startup source of truth. Synchronize the
  // live client before checking a replacement, but never adopt the candidate
  // until its authenticated readback and durable write both succeed.
  const previousKey = await readStoredKey();
  client.setLicenseKey(previousKey);

  let validated: Awaited<ReturnType<IApiClient['validateLicense']>>;
  try {
    validated = await client.validateLicense(key);
  } catch {
    return failure(
      {
        type: 'network',
        message: 'The Proso server could not validate this licence. Try again.',
      },
      previous,
    );
  }
  if (!validated.ok) {
    return failure({ type: 'network', message: describeApiError(validated.error) }, previous);
  }

  const validation = validated.value;
  if (validation?.valid !== true || !isPaidTier(validation?.tier)) {
    return failure(
      {
        type: 'unrecognised_key',
        message: 'The server does not recognise this key as a paid licence.',
      },
      previous,
    );
  }

  if (validation.features?.managedTts !== true) {
    return failure(
      {
        type: 'unconfirmed_subscription',
        message:
          'The key names a paid tier, but the server did not grant managed synthesis, so it was not saved.',
      },
      previous,
    );
  }

  // Confirm with an explicit header without mutating the one shared client key
  // that concurrent synthesis reads.
  let subscription: Awaited<ReturnType<IApiClient['getSubscription']>>;
  try {
    subscription = await client.getSubscription(key);
  } catch {
    return failure(
      {
        type: 'network',
        message: 'The Proso server could not confirm the subscription. Try again.',
      },
      previous,
    );
  }

  if (!subscription.ok) {
    return failure({ type: 'network', message: describeApiError(subscription.error) }, previous);
  }

  const confirmed = subscription.value;
  const credits = toCredits(confirmed?.credits);
  if (!isPaidTier(confirmed?.tier) || !credits) {
    return failure(
      {
        type: 'unconfirmed_subscription',
        message:
          'The key validated, but the server did not confirm a paid subscription and current credit balance for it, so it was not saved.',
      },
      previous,
    );
  }

  try {
    await browser.storage.local.set({ [LICENSE_KEY_STORAGE_KEY]: key });
  } catch {
    return failure(
      {
        type: 'storage',
        message: 'The licence was valid, but this browser could not save it. Try again.',
      },
      previous,
    );
  }

  // Durable config now contains the candidate; adopt it for the next managed
  // synthesis call in this already-running background context.
  client.setLicenseKey(key);
  return { success: true, status: statusFor(key, confirmed.tier, credits, true) };
}

// ============================================
// Registration
// ============================================

/**
 * Register all licence handlers on the given registry.
 *
 * @param registry - Handler registry to register on
 */
export function registerLicenseHandlers(registry: HandlerRegistry): void {
  registry.register(
    'license.getStatus',
    () => serializeLicenseOperation(handleGetStatus),
    'Get stored licence status',
  );
  registry.register(
    'license.validate',
    (params: ValidateParams) => serializeLicenseOperation(() => handleValidate(params)),
    'Validate and save a licence key',
  );
}
