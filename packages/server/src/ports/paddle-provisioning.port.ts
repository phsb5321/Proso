import type { Result, SubscriptionStatus, SubscriptionTier } from '@proso/shared';

export interface WebhookEvent {
  readonly eventType: string;
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly data: Record<string, unknown>;
}

export type SupportedPaddleEventType =
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.canceled'
  | 'transaction.completed';

interface PaddleEventCommandBase {
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
}

export interface UnsupportedPaddleEventCommand extends PaddleEventCommandBase {
  readonly kind: 'unsupported';
}

interface PaddleSubscriptionStateCommand extends PaddleEventCommandBase {
  readonly eventType: SupportedPaddleEventType;
  readonly paddleCustomerId: string;
  readonly paddleSubscriptionId: string;
  readonly tier: SubscriptionTier;
  readonly status: SubscriptionStatus;
  /** Null-current-period subscription events preserve the stored paid period. */
  readonly periodStart?: Date;
  readonly periodEnd?: Date;
  readonly cancelledAt?: Date;
}

export interface SyncPaddleSubscriptionCommand extends PaddleSubscriptionStateCommand {
  readonly kind: 'sync-subscription';
  /** Present together on subscription.created; stages claim routing only. */
  readonly paddleTransactionId?: string;
  readonly licenseClaimHash?: string;
}

export interface ProvisionPaddlePeriodCommand extends PaddleSubscriptionStateCommand {
  readonly kind: 'provision-period';
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly paddleTransactionId: string;
  readonly totalCredits: number;
  readonly licenseClaimHash?: string;
}

export type PaddleProvisioningCommand =
  | UnsupportedPaddleEventCommand
  | SyncPaddleSubscriptionCommand
  | ProvisionPaddlePeriodCommand;

/** Candidate generated before the database transaction; plaintext is not carried. */
export interface PaddleLicenseKeyCandidate {
  readonly id: string;
  readonly keyHash: string;
  readonly activatedAt: Date;
}

export interface PaddleProvisioningOutcome {
  readonly status: 'processed' | 'duplicate';
}

export type PaddleProvisioningErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_PAYLOAD'
  | 'UNKNOWN_PRICE'
  | 'LICENSE_CONFIGURATION'
  | 'PERSISTENCE_FAILED';

export interface PaddleProvisioningError {
  readonly code: PaddleProvisioningErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/** One atomic persistence boundary for a verified Paddle event. */
export abstract class PaddleProvisioningPort {
  abstract process(
    command: PaddleProvisioningCommand,
    keyCandidate: PaddleLicenseKeyCandidate | null,
  ): Promise<Result<PaddleProvisioningOutcome, PaddleProvisioningError>>;
}
