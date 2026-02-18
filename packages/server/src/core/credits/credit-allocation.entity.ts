// CreditAllocation domain entity — immutable value object for credit state
// ZERO NestJS imports — pure TypeScript business logic
//
// Enforces:
//   INV-004: No credit expiration mid-billing cycle

export interface CreditAllocationProps {
  id: string;
  userId: string;
  subscriptionId: string;
  totalCredits: number;
  remainingCredits: number;
  periodStart: Date;
  periodEnd: Date;
  createdAt: Date;
}

export class CreditAllocation {
  constructor(private readonly props: CreditAllocationProps) {}

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get subscriptionId(): string {
    return this.props.subscriptionId;
  }
  get totalCredits(): number {
    return this.props.totalCredits;
  }
  get remainingCredits(): number {
    return this.props.remainingCredits;
  }
  get periodStart(): Date {
    return this.props.periodStart;
  }
  get periodEnd(): Date {
    return this.props.periodEnd;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  /**
   * Check if there are enough remaining credits for the requested amount.
   */
  hasCredits(amount: number): boolean {
    return this.props.remainingCredits >= amount;
  }

  /**
   * Return a new CreditAllocation with reduced remaining credits.
   * Does NOT mutate — returns a new instance (immutable entity pattern).
   */
  deduct(amount: number): CreditAllocation {
    return new CreditAllocation({
      ...this.props,
      remainingCredits: this.props.remainingCredits - amount,
    });
  }

  /**
   * Check if this allocation period has expired.
   * INV-004: Period-based expiration, not time-based credit expiration.
   */
  isExpired(now: Date = new Date()): boolean {
    return this.props.periodEnd.getTime() < now.getTime();
  }

  /**
   * Percentage of total credits that have been used.
   * Returns 0-100 integer.
   */
  get usagePercent(): number {
    if (this.props.totalCredits === 0) return 0;
    return Math.round(
      ((this.props.totalCredits - this.props.remainingCredits) /
        this.props.totalCredits) *
        100,
    );
  }

  toProps(): CreditAllocationProps {
    return { ...this.props };
  }
}
