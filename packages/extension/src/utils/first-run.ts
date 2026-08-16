// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * First-run decisions (PROSO-134 / Plane #27).
 *
 * One derived state (`isUnconfigured`), one failure classifier, one connect
 * gesture. Pure decisions plus a connect orchestrator with injected
 * permissions/storage/fetch deps so the step ORDER is unit-testable and the
 * grant can be pinned to the reader's click (constitution 2.1.0 condition 3).
 *
 * @module utils/first-run
 */

import type { Result } from '../core/shared/result';
import { Err, Ok } from '../core/shared/result';
import { defaults } from './config/defaults';
import { requestHostPermissionForOrigin } from './permissions/match-pattern';

const BYOK_KEYS = ['openaiApiKey', 'elevenlabsApiKey', 'groqApiKey', 'cartesiaApiKey'];

/** Normalize a configured URL for semantic origin comparison. */
function urlOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  try {
    return new URL(value.trim()).origin.toLowerCase();
  } catch {
    return null;
  }
}

/** A managed origin is reader configuration only when it differs from Proso's default. */
export function hasCustomManagedServer(stored: Record<string, unknown>): boolean {
  const configuredOrigin = urlOrigin(stored.serverUrl);
  return configuredOrigin !== null && configuredOrigin !== urlOrigin(defaults.serverUrl);
}

/** R-1: the reader has NO listening route configured at all. */
export function isUnconfigured(stored: Record<string, unknown>): boolean {
  const hasByokKey = BYOK_KEYS.some(
    (key) => typeof stored[key] === 'string' && (stored[key] as string).trim().length > 0,
  );
  if (hasByokKey) return false;
  if (stored.localHostEnabled === true) return false;
  if (typeof stored.licenseKey === 'string' && stored.licenseKey.trim().length > 0) return false;
  if (hasCustomManagedServer(stored)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// R-6 — the failure classifier: every failure pairs with exactly one action.
// ---------------------------------------------------------------------------

export type FailureClass =
  | 'unconfigured'
  | 'entitlement'
  | 'grant-missing'
  | 'host-unreachable'
  | 'key-rejected';

/** The action that fixes each class — the "no dead end" guarantee. */
export const FIX_ACTION: Record<FailureClass, string> = {
  unconfigured: 'Show free routes',
  entitlement: 'Show free routes',
  'grant-missing': 'Grant access',
  'host-unreachable': 'Retry',
  'key-rejected': 'Edit key',
};

/** The local gate's own failure marker (composition/factories.ts). */
const LOCAL_GATE_MARKER = 'no access to the configured host origin';

/**
 * Classify a playback-start failure. Keys on the REAL server copy (the
 * managed-tier refusal) and the local gate marker — pinned by
 * tests/unit/utils/first-run.test.ts so a string drift fails a test, not a
 * user.
 */
export function classifyFailure(
  errorMsg: string,
  opts: { hasHost: boolean; hasByok: boolean; hasManaged?: boolean },
): FailureClass {
  if (errorMsg.includes(LOCAL_GATE_MARKER)) return 'grant-missing';
  if (
    errorMsg.includes('402') ||
    errorMsg.includes('payment_required') ||
    /managed tts is not included|insufficient.?credits/i.test(errorMsg)
  ) {
    return opts.hasHost || opts.hasByok || opts.hasManaged === true
      ? 'entitlement'
      : 'unconfigured';
  }
  // Shipped local-host transport shapes (local-host-audio.adapter.ts): DNS
  // failure and ordinary fetch transport errors.
  if (
    opts.hasHost &&
    /unreachable|not.?responding|fetch failed|failed to fetch|host could not be resolved|network error/i.test(
      errorMsg,
    )
  ) {
    return 'host-unreachable';
  }
  // Only credential-specific evidence may label a key rejected. A generic
  // provider outage may happen with a valid key and must not become "Edit key".
  if (opts.hasByok && /invalid[_ -]?credentials?|invalid api key|key (?:was )?rejected|unauthori[sz]ed|\b401\b|\b403\b/i.test(
    errorMsg,
  )) {
    return 'key-rejected';
  }
  return 'unconfigured';
}

// ---------------------------------------------------------------------------
// R-3 — Route A: validate → grant → test → save. One gesture from a click.
// ---------------------------------------------------------------------------

export type ConnectErrorStep = 'invalid_address' | 'permission_denied' | 'test' | 'save';

export interface ConnectError {
  readonly step: ConnectErrorStep;
  readonly message: string;
}

export interface ConnectOptions {
  /** The reader's address entry. */
  readonly address: string;
  /** The initiating click event — the grant refuses to run without it (D). */
  readonly event: Event | null;
  readonly perms: {
    request(permissions: { origins: string[] }): Promise<boolean>;
  };
  readonly storage: {
    set(items: Record<string, unknown>): Promise<void>;
  };
  readonly fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
}

/**
 * Validate the host address: https, or http on loopback only; no paths.
 * Returns the normalized origin or null.
 */
export function validateHostUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    const isHttps = url.protocol === 'https:';
    const isLoopbackHttp =
      url.protocol === 'http:' &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]');
    if (!isHttps && !isLoopbackHttp) return null;
    if (url.pathname !== '/' && url.pathname !== '') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Address + one button: validate → grant (from the click, never without) →
 * test capabilities → save config. Returns the origin on success. The caller
 * retries playback after Ok.
 */
export async function connectLocalHost(
  opts: ConnectOptions,
): Promise<Result<string, ConnectError>> {
  const { address, event, perms, storage, fetchFn } = opts;
  const origin = validateHostUrl(address);
  if (!origin) {
    return Err({
      step: 'invalid_address',
      message: 'Enter a full HTTPS address, or use HTTP only for localhost or loopback.',
    });
  }

  // The grant must originate from the reader's click (constitution 2.1.0
  // condition 3): a programmatic call (no event) fails here without touching
  // permissions at all.
  if (!event) {
    return Err({
      step: 'permission_denied',
      message: 'Connect must be pressed by you — the host access grant fires from that click.',
    });
  }

  // MatchPattern has no port component. Request the narrowest effective
  // scheme+host grant, then keep capability and synthesis traffic pinned to
  // the exact reader-entered origin below. The helper invokes request()
  // synchronously before its first await, preserving this click's activation.
  const permission = await requestHostPermissionForOrigin(origin, perms);
  if (!permission.ok) {
    return Err({
      step: 'permission_denied',
      message:
        permission.reason === 'denied'
          ? 'Access was not granted — the host route stays off. Try Connect again.'
          : permission.message,
    });
  }

  // Test: the host must speak the synthesis API before anything is saved.
  let voiceCount = 0;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchFn(`${origin}/v1/capabilities`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      return Err({
        step: 'test',
        message: `The host answered ${response.status} — check the address.`,
      });
    }
    const caps = (await response.json()) as { ready?: boolean; tts?: { voices?: unknown[] } };
    if (!caps.ready) {
      return Err({
        step: 'test',
        message: 'The host is not ready yet — try again shortly.',
      });
    }
    voiceCount = caps.tts?.voices?.length ?? 0;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return Err({
      step: 'test',
      message: `No response from ${origin} — check the address and that the machine is on. (${detail})`,
    });
  } finally {
    clearTimeout(timeout);
  }

  // Save: voice stays Automatic (R-7 — the host picks the matching voice from
  // the page language the #147 wiring already derives).
  try {
    await storage.set({
      localHostUrl: origin,
      localHostEnabled: true,
      localHostVoice: null,
      provider: 'local',
      voice: null,
    });
  } catch (error) {
    return Err({
      step: 'save',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return Ok(`${voiceCount}`);
}

// ---------------------------------------------------------------------------
// R-2 — Route B: BYOK, free on every tier (INV-002).
// ---------------------------------------------------------------------------

const BYOK_STORAGE_KEY: Record<string, string> = {
  openai: 'openaiApiKey',
  elevenlabs: 'elevenlabsApiKey',
  groq: 'groqApiKey',
  cartesia: 'cartesiaApiKey',
};

export type ByokValidationFailure = 'invalid' | 'unavailable';
export type ByokSaveFailure = ByokValidationFailure | 'activation';

export interface ByokSaveError {
  readonly reason: ByokSaveFailure;
  readonly message: string;
}

export type ByokValidationResult =
  | { readonly success: true }
  | {
      readonly success: false;
      readonly reason: ByokValidationFailure;
      readonly message: string;
    };

export interface ByokSaveDeps {
  readonly validate: (provider: string, key: string) => Promise<ByokValidationResult>;
  readonly select: (provider: string, key: string) => Promise<unknown>;
}

export async function saveByokKey(
  provider: string,
  key: string,
  deps: ByokSaveDeps,
): Promise<Result<void, ByokSaveError>> {
  const keyField = BYOK_STORAGE_KEY[provider];
  if (!keyField) return Err({ reason: 'invalid', message: 'Choose a provider first.' });
  const trimmed = key.trim();
  if (trimmed.length < 8) {
    return Err({
      reason: 'invalid',
      message: `Enter your ${provider} key — it should be longer than this.`,
    });
  }

  let validation: Awaited<ReturnType<ByokSaveDeps['validate']>>;
  try {
    validation = await deps.validate(provider, trimmed);
  } catch (error) {
    return Err({
      reason: 'unavailable',
      message: error instanceof Error ? error.message : String(error),
    });
  }
  if (!validation.success) {
    return Err({ reason: validation.reason, message: validation.message });
  }

  try {
    await deps.select(provider, trimmed);
    return Ok(undefined);
  } catch (error) {
    return Err({
      reason: 'activation',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
