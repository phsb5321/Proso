// License domain types — shared between extension and server

import type {
  CreditBalance,
  FeatureEntitlements,
  SubscriptionStatus,
  SubscriptionTier,
} from './subscription.js';

export interface LicenseValidationRequest {
  licenseKey: string;
  deviceId?: string;
}

export interface LicenseValidationResponse {
  valid: boolean;
  tier: SubscriptionTier;
  status?: SubscriptionStatus;
  features: FeatureEntitlements;
  credits: CreditBalance;
}

export interface LicenseActivationRequest {
  licenseKey: string;
  email?: string;
  deviceId?: string;
}
