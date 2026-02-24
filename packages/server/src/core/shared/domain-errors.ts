// Domain error types — discriminated unions for each domain
// ZERO NestJS imports — pure TypeScript

import { ErrorCode } from '@proso/shared';
import type { DomainError } from '@proso/shared';

export interface LicenseError extends DomainError {
  code:
    | ErrorCode.LicenseInvalid
    | ErrorCode.LicenseExpired
    | ErrorCode.LicenseDeviceLimitReached;
}

export interface SubscriptionError extends DomainError {
  code: ErrorCode.SubscriptionNotFound | ErrorCode.SubscriptionInactive;
}

export interface CreditError extends DomainError {
  code: ErrorCode.InsufficientCredits | ErrorCode.NoActiveAllocation;
}

export interface TTSError extends DomainError {
  code:
    | ErrorCode.ProviderUnavailable
    | ErrorCode.AllProvidersUnavailable
    | ErrorCode.TextTooLong;
}

// Factory helpers for creating typed errors
export function licenseError(
  code: LicenseError['code'],
  message: string,
  details?: Record<string, unknown>,
): LicenseError {
  return { code, message, details };
}

export function subscriptionError(
  code: SubscriptionError['code'],
  message: string,
  details?: Record<string, unknown>,
): SubscriptionError {
  return { code, message, details };
}

export function creditError(
  code: CreditError['code'],
  message: string,
  details?: Record<string, unknown>,
): CreditError {
  return { code, message, details };
}

export function ttsError(
  code: TTSError['code'],
  message: string,
  details?: Record<string, unknown>,
): TTSError {
  return { code, message, details };
}
