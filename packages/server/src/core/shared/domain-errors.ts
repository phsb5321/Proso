// Domain error types — discriminated unions for each domain
// ZERO NestJS imports — pure TypeScript

import { ErrorCode } from '@proso/shared';
import type { DomainError } from '@proso/shared';

const LICENSE_ISSUANCE_FAILED = 'LICENSE_ISSUANCE_FAILED' as const;

export interface LicenseError {
  code:
    | ErrorCode.LicenseInvalid
    | ErrorCode.LicenseExpired
    | ErrorCode.LicenseDeviceLimitReached
    | typeof LICENSE_ISSUANCE_FAILED;
  message: string;
  details?: Record<string, unknown>;
}

export interface CreditError extends DomainError {
  code: ErrorCode.InsufficientCredits | ErrorCode.NoActiveAllocation;
}

export interface TTSError extends DomainError {
  code: ErrorCode.ProviderUnavailable | ErrorCode.AllProvidersUnavailable | ErrorCode.TextTooLong;
}

// Factory helpers for creating typed errors
function licenseError(
  code: LicenseError['code'],
  message: string,
  details?: Record<string, unknown>,
): LicenseError {
  return { code, message, details };
}

export function licenseIssuanceError(
  message: string,
  details?: Record<string, unknown>,
): LicenseError {
  return licenseError(LICENSE_ISSUANCE_FAILED, message, details);
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
