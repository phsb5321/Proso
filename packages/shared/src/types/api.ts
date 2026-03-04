// API request/response types matching contracts/api-v1.yaml schemas

import type { CreditTransaction } from '../domain/credits.js';
import type { TTSProvider } from '../domain/provider.js';
import type {
  CreditBalance,
  FeatureEntitlements,
  SubscriptionStatus,
  SubscriptionTier,
} from '../domain/subscription.js';

// Health
export interface HealthResponse {
  status: 'ok' | 'error';
  version: string;
  uptime: number;
  details?: {
    database?: HealthIndicator;
    memory?: HealthIndicator;
  };
}

export interface HealthIndicator {
  status: 'up' | 'down';
}

// License
export interface LicenseValidateRequest {
  licenseKey: string;
  deviceId?: string;
}

export interface LicenseValidateResponse {
  valid: boolean;
  tier: SubscriptionTier;
  status?: SubscriptionStatus;
  features: FeatureEntitlements;
  credits: CreditBalance;
}

export interface LicenseActivateRequest {
  licenseKey: string;
  email?: string;
  deviceId?: string;
}

// TTS
export interface TTSSynthesizeRequest {
  text: string;
  provider?: TTSProvider;
  voice?: string;
  language?: string;
  /** User's own API key for the requested provider. Used for single-request synthesis only; never persisted server-side. */
  byokApiKey?: string;
}

export interface TTSTestKeyRequest {
  provider: string;
  apiKey: string;
}

export interface TTSTestKeyResponse {
  success: boolean;
  provider: string;
  error?: string;
  latencyMs?: number;
}

export interface TTSSynthesizeHeaders {
  'X-Credits-Used': number;
  'X-Credits-Remaining': number;
  'X-Cache-Hit': boolean;
  'X-Provider': string;
}

export interface Voice {
  id: string;
  name: string;
  language?: string;
  gender?: string;
}

export interface VoiceListResponse {
  voices: Voice[];
}

// Credits
export interface CreditBalanceResponse extends CreditBalance {}

export interface CreditHistoryResponse {
  transactions: CreditTransaction[];
  total: number;
}

export interface CreditHistoryParams {
  limit?: number;
  offset?: number;
}

// Subscription
export interface SubscriptionDetailsResponse {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  credits?: CreditBalance;
}

export interface CheckoutRequest {
  tier: SubscriptionTier;
}

export interface CheckoutResponse {
  checkoutUrl: string;
}

// Webhooks
export interface WebhookResponse {
  received: boolean;
}

// Errors
export interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}
