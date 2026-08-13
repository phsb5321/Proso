// Shared error types used across extension and server

export enum ErrorCode {
  // License errors
  LicenseInvalid = 'LICENSE_INVALID',
  LicenseExpired = 'LICENSE_EXPIRED',
  LicenseDeviceLimitReached = 'LICENSE_DEVICE_LIMIT',
  LicenseIssuanceFailed = 'LICENSE_ISSUANCE_FAILED',

  // Subscription errors
  SubscriptionNotFound = 'SUBSCRIPTION_NOT_FOUND',
  SubscriptionInactive = 'SUBSCRIPTION_INACTIVE',

  // Credit errors
  InsufficientCredits = 'INSUFFICIENT_CREDITS',
  NoActiveAllocation = 'NO_ACTIVE_ALLOCATION',

  // TTS errors
  ProviderUnavailable = 'PROVIDER_UNAVAILABLE',
  AllProvidersUnavailable = 'ALL_PROVIDERS_UNAVAILABLE',
  TextTooLong = 'TEXT_TOO_LONG',

  // General errors
  ValidationError = 'VALIDATION_ERROR',
  Unauthorized = 'UNAUTHORIZED',
}

export interface DomainError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
