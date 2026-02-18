// Subscription domain types — shared between extension and server

export enum SubscriptionTier {
  Free = 'free',
  Pro = 'pro',
  Enterprise = 'enterprise',
}

export enum SubscriptionStatus {
  Active = 'active',
  Cancelled = 'cancelled',
  Expired = 'expired',
  PastDue = 'past_due',
  Trialing = 'trialing',
}

export interface SubscriptionDetails {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  credits?: CreditBalance;
}

export interface CreditBalance {
  total: number;
  remaining: number;
  usagePercent: number;
  periodStart?: string;
  periodEnd?: string;
}

export interface FeatureEntitlements {
  managedTts: boolean;
  premiumVoices: boolean;
  prioritySupport: boolean;
}
