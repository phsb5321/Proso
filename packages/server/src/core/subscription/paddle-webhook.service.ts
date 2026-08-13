import {
  Err,
  LicenseClaimHashSchema,
  Ok,
  SubscriptionStatus,
  SubscriptionTier,
  TIER_CREDITS,
  isOk,
  unwrapErr,
} from '@proso/shared';
import type { Result } from '@proso/shared';
import type {
  PaddleLicenseKeyCandidate,
  PaddleProvisioningCommand,
  PaddleProvisioningError,
  PaddleProvisioningPort,
  ProvisionPaddlePeriodCommand,
  SupportedPaddleEventType,
  WebhookEvent,
} from '../../ports/paddle-provisioning.port.js';
import {
  deriveLicenseKey,
  generateKeyId,
  hasStrongLicenseKeySecret,
  hashLicenseKey,
  licenseKeyEnvironment,
} from './license-key.js';

const PaddleEventType = {
  SubscriptionCreated: 'subscription.created',
  SubscriptionUpdated: 'subscription.updated',
  SubscriptionCanceled: 'subscription.canceled',
  TransactionCompleted: 'transaction.completed',
} as const;

const PADDLE_ID = {
  event: /^evt_[a-z0-9]+$/,
  customer: /^ctm_[a-z0-9]+$/,
  subscription: /^sub_[a-z0-9]+$/,
  transaction: /^txn_[a-z0-9]+$/,
  price: /^pri_[a-z0-9]+$/,
} as const;

export interface PaddlePriceConfiguration {
  readonly proMonthly: string;
  readonly proYearly: string;
  readonly enterpriseMonthly: string;
  readonly enterpriseYearly: string;
}

export interface PaddleWebhookSettings extends PaddlePriceConfiguration {
  readonly licenseKeySecret: string;
  readonly nodeEnv: string | undefined;
}

type BillingCadence = 'monthly' | 'yearly';

interface PricePlan {
  readonly priceId: string;
  readonly tier: SubscriptionTier;
  readonly cadence: BillingCadence;
}

interface SubscriptionState {
  readonly paddleCustomerId: string;
  readonly paddleSubscriptionId: string;
  readonly tier: SubscriptionTier;
  readonly status: SubscriptionStatus;
  readonly periodStart?: Date;
  readonly periodEnd?: Date;
  readonly cancelledAt?: Date;
  readonly licenseClaimHash?: string;
}

function paddleError(
  code: PaddleProvisioningError['code'],
  message: string,
  details?: Readonly<Record<string, unknown>>,
): PaddleProvisioningError {
  return { code, message, details };
}

/**
 * Convert a verified provider envelope to a persistence command.
 *
 * This function deliberately never reads `custom_data.user_id`,
 * `custom_data.tier`, passthrough, or buyer billing-period diagnostics.
 */
export function normalizePaddleWebhook(
  event: WebhookEvent,
  priceConfiguration: PaddlePriceConfiguration,
): Result<PaddleProvisioningCommand, PaddleProvisioningError> {
  if (!PADDLE_ID.event.test(event.eventId)) {
    return Err(paddleError('INVALID_PAYLOAD', 'Paddle event id is invalid'));
  }

  if (!isSupportedEventType(event.eventType)) {
    return Ok({
      kind: 'unsupported',
      eventId: event.eventId,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
    });
  }

  const catalog = createPriceCatalog(priceConfiguration);
  if (!isOk(catalog)) return Err(unwrapErr(catalog));

  const supportedEvent = { ...event, eventType: event.eventType } as WebhookEvent & {
    eventType: SupportedPaddleEventType;
  };
  const state = parseSubscriptionState(supportedEvent, catalog.value);
  if (!isOk(state)) return Err(unwrapErr(state));

  if (
    event.eventType === PaddleEventType.TransactionCompleted &&
    (!state.value.periodStart || !state.value.periodEnd)
  ) {
    return Err(
      paddleError('INVALID_PAYLOAD', 'Recurring transaction.completed has no billing period'),
    );
  }

  const base = {
    eventId: event.eventId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    paddleCustomerId: state.value.paddleCustomerId,
    paddleSubscriptionId: state.value.paddleSubscriptionId,
    tier: state.value.tier,
    status: state.value.status,
    ...(state.value.periodStart && state.value.periodEnd
      ? { periodStart: state.value.periodStart, periodEnd: state.value.periodEnd }
      : {}),
    ...(state.value.cancelledAt ? { cancelledAt: state.value.cancelledAt } : {}),
  } as const;

  if (event.eventType === PaddleEventType.TransactionCompleted) {
    const transactionId = readPaddleId(event.data, 'id', PADDLE_ID.transaction, 'transaction id');
    if (!isOk(transactionId)) return Err(unwrapErr(transactionId));

    const periodStart = state.value.periodStart;
    const periodEnd = state.value.periodEnd;
    if (!periodStart || !periodEnd) {
      return Err(paddleError('INVALID_PAYLOAD', 'Recurring transaction has no billing period'));
    }

    return Ok({
      ...base,
      periodStart,
      periodEnd,
      kind: 'provision-period',
      paddleTransactionId: transactionId.value,
      totalCredits: TIER_CREDITS[state.value.tier],
      ...(state.value.licenseClaimHash ? { licenseClaimHash: state.value.licenseClaimHash } : {}),
    } satisfies ProvisionPaddlePeriodCommand);
  }

  if (event.eventType === PaddleEventType.SubscriptionCreated) {
    const transactionId = readPaddleId(
      event.data,
      'transaction_id',
      PADDLE_ID.transaction,
      'subscription transaction id',
    );
    if (!isOk(transactionId)) return Err(unwrapErr(transactionId));

    // The canonical created schema uniquely carries the transaction link. It
    // may stage the claim pair for transaction-first/created-first convergence,
    // but only transaction.completed allocates credits or mints a key.
    return Ok({
      ...base,
      kind: 'sync-subscription',
      ...(state.value.licenseClaimHash
        ? {
            paddleTransactionId: transactionId.value,
            licenseClaimHash: state.value.licenseClaimHash,
          }
        : {}),
    });
  }

  // Updated/canceled events converge state without inventing transaction ids.
  return Ok({ ...base, kind: 'sync-subscription' });
}

/**
 * Normalize, generate a hash-only Keyforge candidate when needed, and invoke
 * the single atomic persistence port.
 */
export async function processPaddleWebhook(
  event: WebhookEvent,
  settings: PaddleWebhookSettings,
  provisioning: PaddleProvisioningPort,
  now: () => Date = () => new Date(),
): Promise<Result<{ status: 'processed' | 'duplicate' }, PaddleProvisioningError>> {
  const command = normalizePaddleWebhook(event, settings);
  if (!isOk(command)) return Err(unwrapErr(command));

  let keyCandidate: PaddleLicenseKeyCandidate | null = null;
  if (command.value.kind === 'provision-period') {
    if (!hasStrongLicenseKeySecret(settings.licenseKeySecret)) {
      return Err(
        paddleError(
          'LICENSE_CONFIGURATION',
          'LICENSE_KEY_SECRET must contain at least 32 bytes before paid provisioning',
        ),
      );
    }

    const id = generateKeyId();
    const plaintext = deriveLicenseKey(
      id,
      settings.licenseKeySecret,
      licenseKeyEnvironment(settings.nodeEnv),
    );
    keyCandidate = {
      id,
      keyHash: hashLicenseKey(plaintext),
      activatedAt: now(),
    };
  }

  return provisioning.process(command.value, keyCandidate);
}

function createPriceCatalog(
  configuration: PaddlePriceConfiguration,
): Result<readonly PricePlan[], PaddleProvisioningError> {
  const plans: readonly PricePlan[] = [
    {
      priceId: configuration.proMonthly,
      tier: SubscriptionTier.Pro,
      cadence: 'monthly',
    },
    { priceId: configuration.proYearly, tier: SubscriptionTier.Pro, cadence: 'yearly' },
    {
      priceId: configuration.enterpriseMonthly,
      tier: SubscriptionTier.Enterprise,
      cadence: 'monthly',
    },
    {
      priceId: configuration.enterpriseYearly,
      tier: SubscriptionTier.Enterprise,
      cadence: 'yearly',
    },
  ];

  for (const plan of plans) {
    if (!PADDLE_ID.price.test(plan.priceId)) {
      return Err(
        paddleError(
          'INVALID_CONFIGURATION',
          'All four Paddle price ids must be configured as canonical pri_ identifiers',
        ),
      );
    }
  }

  if (new Set(plans.map((plan) => plan.priceId)).size !== plans.length) {
    return Err(
      paddleError('INVALID_CONFIGURATION', 'Each Paddle plan must have a distinct price id'),
    );
  }

  return Ok(plans);
}

function parseSubscriptionState(
  event: WebhookEvent & { eventType: SupportedPaddleEventType },
  catalog: readonly PricePlan[],
): Result<SubscriptionState, PaddleProvisioningError> {
  const customerId = readPaddleId(event.data, 'customer_id', PADDLE_ID.customer, 'customer id');
  if (!isOk(customerId)) return Err(unwrapErr(customerId));

  const subscriptionField =
    event.eventType === PaddleEventType.TransactionCompleted ? 'subscription_id' : 'id';
  const subscriptionId = readPaddleId(
    event.data,
    subscriptionField,
    PADDLE_ID.subscription,
    'subscription id',
  );
  if (!isOk(subscriptionId)) return Err(unwrapErr(subscriptionId));

  const plan = readPlan(event.data, catalog);
  if (!isOk(plan)) return Err(unwrapErr(plan));

  const periodField =
    event.eventType === PaddleEventType.TransactionCompleted
      ? 'billing_period'
      : 'current_billing_period';
  const period = readNullablePeriod(event.data, periodField);
  if (!isOk(period)) return Err(unwrapErr(period));

  const status = readStatus(event);
  if (!isOk(status)) return Err(unwrapErr(status));

  const claimHash = readClaimHash(event.data);
  if (!isOk(claimHash)) return Err(unwrapErr(claimHash));

  const cancelledAt = readCancelledAt(event);
  if (!isOk(cancelledAt)) return Err(unwrapErr(cancelledAt));

  return Ok({
    paddleCustomerId: customerId.value,
    paddleSubscriptionId: subscriptionId.value,
    tier: plan.value.tier,
    status: status.value,
    ...(period.value ? { periodStart: period.value.start, periodEnd: period.value.end } : {}),
    ...(cancelledAt.value ? { cancelledAt: cancelledAt.value } : {}),
    ...(claimHash.value ? { licenseClaimHash: claimHash.value } : {}),
  });
}

function readPlan(
  data: Record<string, unknown>,
  catalog: readonly PricePlan[],
): Result<PricePlan, PaddleProvisioningError> {
  const items = data['items'];
  if (!Array.isArray(items)) {
    return Err(paddleError('INVALID_PAYLOAD', 'Paddle items must be an array'));
  }

  const recurring: Array<{ priceId: string; interval: string; frequency: number }> = [];
  for (const item of items) {
    if (!isRecord(item) || !isRecord(item['price'])) {
      return Err(paddleError('INVALID_PAYLOAD', 'Every Paddle item must contain a price'));
    }

    const price = item['price'];
    const billingCycle = price['billing_cycle'];
    const isRecurring = item['recurring'] === true || isRecord(billingCycle);
    if (!isRecurring) continue;
    if (!isRecord(billingCycle)) {
      return Err(
        paddleError('INVALID_PAYLOAD', 'Recurring Paddle price is missing its billing cycle'),
      );
    }

    const priceId = price['id'];
    const interval = billingCycle['interval'];
    const frequency = billingCycle['frequency'];
    if (
      typeof priceId !== 'string' ||
      typeof interval !== 'string' ||
      typeof frequency !== 'number' ||
      !Number.isInteger(frequency)
    ) {
      return Err(paddleError('INVALID_PAYLOAD', 'Recurring Paddle price fields are invalid'));
    }
    recurring.push({ priceId, interval, frequency });
  }

  if (recurring.length !== 1) {
    return Err(
      paddleError('INVALID_PAYLOAD', 'A Paddle event must contain exactly one recurring plan item'),
    );
  }

  const item = recurring[0];
  const plan = catalog.find((candidate) => candidate.priceId === item.priceId);
  if (!plan) {
    return Err(
      paddleError('UNKNOWN_PRICE', 'Recurring Paddle price is not configured', {
        priceId: item.priceId,
      }),
    );
  }

  const expectedInterval = plan.cadence === 'monthly' ? 'month' : 'year';
  if (item.interval !== expectedInterval || item.frequency !== 1) {
    return Err(
      paddleError(
        'INVALID_PAYLOAD',
        'Configured Paddle price does not match its expected billing cadence',
      ),
    );
  }

  return Ok(plan);
}

function readNullablePeriod(
  data: Record<string, unknown>,
  field: string,
): Result<{ start: Date; end: Date } | undefined, PaddleProvisioningError> {
  const period = data[field];
  if (period === null) return Ok(undefined);
  if (!isRecord(period)) {
    return Err(paddleError('INVALID_PAYLOAD', `Paddle ${field} is missing`));
  }

  const start = parseDate(period['starts_at']);
  const end = parseDate(period['ends_at']);
  if (!start || !end || end.getTime() <= start.getTime()) {
    return Err(paddleError('INVALID_PAYLOAD', `Paddle ${field} is invalid`));
  }
  return Ok({ start, end });
}

function readStatus(
  event: WebhookEvent & { eventType: SupportedPaddleEventType },
): Result<SubscriptionStatus, PaddleProvisioningError> {
  if (event.eventType === PaddleEventType.TransactionCompleted) {
    return Ok(SubscriptionStatus.Active);
  }
  if (event.eventType === PaddleEventType.SubscriptionCanceled) {
    return Ok(SubscriptionStatus.Cancelled);
  }

  switch (event.data['status']) {
    case 'active':
      return Ok(SubscriptionStatus.Active);
    case 'trialing':
      return Ok(SubscriptionStatus.Trialing);
    case 'past_due':
      return Ok(SubscriptionStatus.PastDue);
    case 'canceled':
      return Ok(SubscriptionStatus.Cancelled);
    case 'paused':
      return Ok(SubscriptionStatus.Expired);
    default:
      return Err(paddleError('INVALID_PAYLOAD', 'Paddle subscription status is invalid'));
  }
}

function readClaimHash(
  data: Record<string, unknown>,
): Result<string | undefined, PaddleProvisioningError> {
  const customData = data['custom_data'];
  if (customData === undefined || customData === null) return Ok(undefined);
  if (!isRecord(customData)) {
    return Err(paddleError('INVALID_PAYLOAD', 'Paddle custom_data must be an object'));
  }

  const value = customData['license_claim_hash'];
  if (value === undefined || value === null) return Ok(undefined);
  const parsed = LicenseClaimHashSchema.safeParse(value);
  if (!parsed.success) {
    return Err(paddleError('INVALID_PAYLOAD', 'Paddle licence claim hash is invalid'));
  }
  return Ok(parsed.data);
}

function readCancelledAt(
  event: WebhookEvent & { eventType: SupportedPaddleEventType },
): Result<Date | undefined, PaddleProvisioningError> {
  if (event.eventType !== PaddleEventType.SubscriptionCanceled) return Ok(undefined);
  const cancelledAt = parseDate(event.data['canceled_at']);
  if (!cancelledAt) {
    return Err(paddleError('INVALID_PAYLOAD', 'Canceled subscription has no valid canceled_at'));
  }
  return Ok(cancelledAt);
}

function readPaddleId(
  data: Record<string, unknown>,
  field: string,
  pattern: RegExp,
  label: string,
): Result<string, PaddleProvisioningError> {
  const value = data[field];
  if (typeof value !== 'string' || !pattern.test(value)) {
    return Err(paddleError('INVALID_PAYLOAD', `Paddle ${label} is invalid`));
  }
  return Ok(value);
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSupportedEventType(eventType: string): eventType is SupportedPaddleEventType {
  return Object.values(PaddleEventType).includes(eventType as SupportedPaddleEventType);
}

const EVENT_PRECEDENCE: Readonly<Record<string, number>> = {
  [PaddleEventType.SubscriptionCreated]: 1,
  [PaddleEventType.TransactionCompleted]: 2,
  [PaddleEventType.SubscriptionUpdated]: 3,
  [PaddleEventType.SubscriptionCanceled]: 4,
};

/** Stable semantic ordering for subscription state, independent of delivery order. */
export function isPaddleStateNewer(
  incoming: Pick<PaddleProvisioningCommand, 'occurredAt' | 'eventType' | 'eventId'>,
  stored: { occurredAt: Date | null; eventType: string | null; eventId: string | null },
): boolean {
  if (!stored.occurredAt) return true;
  const timestampOrder = incoming.occurredAt.getTime() - stored.occurredAt.getTime();
  if (timestampOrder !== 0) return timestampOrder > 0;

  const precedenceOrder =
    (EVENT_PRECEDENCE[incoming.eventType] ?? 0) - (EVENT_PRECEDENCE[stored.eventType ?? ''] ?? 0);
  if (precedenceOrder !== 0) return precedenceOrder > 0;

  return incoming.eventId > (stored.eventId ?? '');
}
