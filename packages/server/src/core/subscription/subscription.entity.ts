// Subscription domain entity — pure business logic, ZERO NestJS imports
//
// Enforces:
//   INV-004: No credit expiration mid-billing cycle

import { SubscriptionTier, SubscriptionStatus } from '@voxpage/shared';

export interface SubscriptionProps {
  id: string;
  userId: string;
  paddleSubscriptionId?: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class Subscription {
  constructor(private readonly props: SubscriptionProps) {}

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get tier(): SubscriptionTier {
    return this.props.tier;
  }
  get status(): SubscriptionStatus {
    return this.props.status;
  }
  get currentPeriodStart(): Date {
    return this.props.currentPeriodStart;
  }
  get currentPeriodEnd(): Date {
    return this.props.currentPeriodEnd;
  }
  get cancelledAt(): Date | undefined {
    return this.props.cancelledAt;
  }

  /**
   * Is this subscription currently active (can use features)?
   * Includes grace period for cancelled subscriptions (INV-004).
   */
  isActive(now: Date = new Date()): boolean {
    if (this.props.status === SubscriptionStatus.Active) return true;
    if (this.props.status === SubscriptionStatus.Trialing) return true;
    if (this.props.status === SubscriptionStatus.PastDue) return true;

    // INV-004: Cancelled subscriptions remain active until period end
    if (this.props.status === SubscriptionStatus.Cancelled) {
      return this.isInGracePeriod(now);
    }

    return false;
  }

  /**
   * Is the subscription in the grace period after cancellation?
   * INV-004: No credit expiration mid-billing cycle.
   */
  isInGracePeriod(now: Date = new Date()): boolean {
    return this.props.currentPeriodEnd.getTime() > now.getTime();
  }

  /**
   * Cancel the subscription at period end (cancel-at-period-end).
   * INV-004: Credits remain valid until the current period ends.
   */
  cancel(now: Date = new Date()): Subscription {
    return new Subscription({
      ...this.props,
      status: SubscriptionStatus.Cancelled,
      cancelledAt: now,
      updatedAt: now,
    });
  }

  /**
   * Upgrade the subscription to a new tier.
   * Takes effect immediately with new credit allocation.
   */
  upgrade(newTier: SubscriptionTier, now: Date = new Date()): Subscription {
    if (newTier === this.props.tier) return this;

    return new Subscription({
      ...this.props,
      tier: newTier,
      status: SubscriptionStatus.Active,
      updatedAt: now,
    });
  }

  /**
   * Renew the subscription for a new billing period.
   */
  renew(newPeriodStart: Date, newPeriodEnd: Date): Subscription {
    return new Subscription({
      ...this.props,
      status: SubscriptionStatus.Active,
      currentPeriodStart: newPeriodStart,
      currentPeriodEnd: newPeriodEnd,
      cancelledAt: undefined,
      updatedAt: new Date(),
    });
  }

  /**
   * Mark subscription as expired (after grace period or failed payment).
   */
  expire(now: Date = new Date()): Subscription {
    return new Subscription({
      ...this.props,
      status: SubscriptionStatus.Expired,
      updatedAt: now,
    });
  }

  toProps(): SubscriptionProps {
    return { ...this.props };
  }
}
