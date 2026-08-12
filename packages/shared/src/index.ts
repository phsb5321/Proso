// @proso/shared — barrel export for all shared domain types, constants, and utilities

// Result type
export {
  type Result,
  Ok,
  Err,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  map,
  mapErr,
  andThen,
  orElse,
  unwrapOr,
} from './result.js';

// Domain types
export {
  SubscriptionTier,
  SubscriptionStatus,
  type SubscriptionDetails,
  type CreditBalance,
  type FeatureEntitlements,
} from './domain/subscription.js';

export {
  TTSProvider,
  type ProviderCost,
} from './domain/provider.js';

export {
  TransactionType,
  type CreditAllocation,
  type CreditTransaction,
} from './domain/credits.js';

export type {
  LicenseValidationRequest,
  LicenseValidationResponse,
  LicenseActivationRequest,
} from './domain/license.js';

// Constants
export { TIER_CREDITS, FEATURE_MATRIX } from './constants/tiers.js';
export { PROVIDER_COSTS, calculateCreditCost } from './constants/providers.js';
export { BUSINESS_INVARIANTS, type InvariantId } from './constants/invariants.js';

// API types
export type {
  HealthResponse,
  HealthIndicator,
  LicenseValidateRequest,
  LicenseValidateResponse,
  LicenseActivateRequest,
  TTSSynthesizeRequest,
  TTSSynthesizeHeaders,
  TTSTestKeyRequest,
  TTSTestKeyResponse,
  Voice,
  VoiceListResponse,
  CreditBalanceResponse,
  CreditHistoryResponse,
  CreditHistoryParams,
  SubscriptionDetailsResponse,
  CheckoutRequest,
  CheckoutResponse,
  WebhookResponse,
  ErrorResponse,
} from './types/api.js';

// Error types
export { ErrorCode, type DomainError } from './types/errors.js';

// Zod validation schemas
export {
  TTSSynthesizeRequestSchema,
  type TTSSynthesizeRequestParsed,
  TTSTestKeyRequestSchema,
  type TTSTestKeyRequestParsed,
} from './schemas/tts.js';

export {
  LicenseValidateRequestSchema,
  type LicenseValidateRequestParsed,
  LicenseActivateRequestSchema,
  type LicenseActivateRequestParsed,
} from './schemas/license.js';

export {
  CreditHistoryParamsSchema,
  type CreditHistoryParamsParsed,
} from './schemas/credits.js';

export {
  LICENSE_BY_TRANSACTION_PATH,
  LICENSE_CLAIM_SECRET_BYTES,
  LICENSE_CLAIM_STORAGE_KEY,
  LICENSE_CLAIM_HASH_FIELD,
  LicenseClaimHashSchema,
  LicenseClaimRequestSchema,
  type LicenseClaimRequestParsed,
  LicenseIssuedSchema,
  type LicenseIssuedParsed,
  LicensePendingSchema,
  type LicensePendingParsed,
  LicenseClaimResponseSchema,
  type LicenseClaimResponseParsed,
} from './schemas/checkout.js';
