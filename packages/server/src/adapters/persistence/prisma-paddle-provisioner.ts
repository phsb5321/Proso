import { Injectable } from '@nestjs/common';
import { Err, Ok } from '@proso/shared';
import type { Result } from '@proso/shared';
import { isPaddleStateNewer } from '../../core/subscription/paddle-webhook.service';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/modules/prisma.module';
import {
  type PaddleLicenseKeyCandidate,
  type PaddleProvisioningCommand,
  type PaddleProvisioningError,
  type PaddleProvisioningOutcome,
  PaddleProvisioningPort,
  type ProvisionPaddlePeriodCommand,
} from '../../ports/paddle-provisioning.port';

class ProvisioningInvariantError extends Error {
  constructor(
    readonly code: PaddleProvisioningError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'ProvisioningInvariantError';
  }
}

/**
 * The one persistence boundary for a verified Paddle event.
 *
 * Every entitlement write and the durable event marker share this serializable
 * transaction. A throw — including the protected fault seam used by the real
 * PostgreSQL acceptance test — rolls all of them back.
 */
@Injectable()
export class PrismaPaddleProvisioner extends PaddleProvisioningPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(
    command: PaddleProvisioningCommand,
    keyCandidate: PaddleLicenseKeyCandidate | null,
  ): Promise<Result<PaddleProvisioningOutcome, PaddleProvisioningError>> {
    try {
      const outcome = await this.prisma.$transaction(
        async (tx) => {
          const marker = await tx.paddleWebhookEvent.createMany({
            data: [
              {
                eventId: command.eventId,
                eventType: command.eventType,
                occurredAt: command.occurredAt,
              },
            ],
            skipDuplicates: true,
          });

          if (marker.count === 0) return { status: 'duplicate' } as const;
          if (command.kind === 'unsupported') {
            await this.beforeCommit(command);
            return { status: 'processed' } as const;
          }

          const user = await tx.user.upsert({
            where: { paddleCustomerId: command.paddleCustomerId },
            update: {},
            create: { paddleCustomerId: command.paddleCustomerId },
          });

          const subscription = await this.convergeSubscription(tx, user.id, command);

          if (command.kind === 'provision-period') {
            if (!keyCandidate) {
              throw new ProvisioningInvariantError(
                'LICENSE_CONFIGURATION',
                'Paid provisioning requires a hash-only licence candidate',
              );
            }

            await this.ensureAllocation(tx, user.id, subscription.id, command);
            const licenseKey = await tx.licenseKey.upsert({
              where: { userId: user.id },
              update: {},
              create: {
                id: keyCandidate.id,
                userId: user.id,
                keyHash: keyCandidate.keyHash,
                activatedAt: keyCandidate.activatedAt,
              },
            });
            if (!licenseKey.isActive) {
              throw new ProvisioningInvariantError(
                'PERSISTENCE_FAILED',
                'Existing licence key is inactive; refusing to replace it',
              );
            }
          }

          await this.beforeCommit(command);
          return { status: 'processed' } as const;
        },
        { isolationLevel: 'Serializable' },
      );

      return Ok(outcome);
    } catch (error: unknown) {
      if (error instanceof ProvisioningInvariantError) {
        return Err({ code: error.code, message: error.message });
      }

      return Err({
        code: 'PERSISTENCE_FAILED',
        message: 'Atomic Paddle provisioning failed',
        ...(safePersistenceCode(error)
          ? { details: { persistenceCode: safePersistenceCode(error) } }
          : {}),
      });
    }
  }

  /** Test-only subclass seam: throwing here proves rollback before commit. */
  protected async beforeCommit(_command: PaddleProvisioningCommand): Promise<void> {}

  private async convergeSubscription(
    tx: Prisma.TransactionClient,
    userId: string,
    command: Exclude<PaddleProvisioningCommand, { kind: 'unsupported' }>,
  ) {
    const existing = await tx.subscription.findUnique({
      where: { paddleSubscriptionId: command.paddleSubscriptionId },
    });

    if (!existing) {
      if (command.kind === 'provision-period' && !command.licenseClaimHash) {
        throw new ProvisioningInvariantError(
          'INVALID_PAYLOAD',
          'A new paid subscription requires a canonical licence claim hash',
        );
      }

      return tx.subscription.create({
        data: {
          userId,
          paddleSubscriptionId: command.paddleSubscriptionId,
          ...(command.paddleTransactionId && command.licenseClaimHash
            ? {
                paddleTransactionId: command.paddleTransactionId,
                licenseClaimHash: command.licenseClaimHash,
              }
            : {}),
          ...(command.kind === 'provision-period'
            ? { paddleLastTransactionId: command.paddleTransactionId }
            : {}),
          tier: command.tier,
          status: command.status,
          currentPeriodStart: requireInitialPeriod(command).start,
          currentPeriodEnd: requireInitialPeriod(command).end,
          cancelledAt: command.cancelledAt ?? null,
          paddleOccurredAt: command.occurredAt,
          paddleEventType: command.eventType,
          paddleEventId: command.eventId,
        },
      });
    }

    if (existing.userId !== userId) {
      throw new ProvisioningInvariantError(
        'PERSISTENCE_FAILED',
        'Paddle subscription is already bound to a different customer',
      );
    }

    const hasTransaction = existing.paddleTransactionId !== null;
    const hasClaim = existing.licenseClaimHash !== null;
    if (hasTransaction !== hasClaim) {
      throw new ProvisioningInvariantError(
        'PERSISTENCE_FAILED',
        'Stored Paddle claim routing is incomplete',
      );
    }

    const update: Prisma.SubscriptionUpdateInput = {};
    if (
      isPaddleStateNewer(command, {
        occurredAt: existing.paddleOccurredAt,
        eventType: existing.paddleEventType,
        eventId: existing.paddleEventId,
      })
    ) {
      update.tier = command.tier;
      update.status = command.status;
      if (command.periodStart && command.periodEnd) {
        update.currentPeriodStart = command.periodStart;
        update.currentPeriodEnd = command.periodEnd;
      }
      update.cancelledAt = command.cancelledAt ?? null;
      update.paddleOccurredAt = command.occurredAt;
      update.paddleEventType = command.eventType;
      update.paddleEventId = command.eventId;
    }

    const initialClaimEvent =
      command.kind === 'sync-subscription' ||
      command.paddleTransactionId === existing.paddleTransactionId;
    if (initialClaimEvent && (command.paddleTransactionId || command.licenseClaimHash)) {
      if (!command.paddleTransactionId || !command.licenseClaimHash) {
        throw new ProvisioningInvariantError(
          'INVALID_PAYLOAD',
          'Paddle claim routing must arrive as a transaction/hash pair',
        );
      }
      if (!hasTransaction) {
        update.paddleTransactionId = command.paddleTransactionId;
        update.licenseClaimHash = command.licenseClaimHash;
      } else if (
        command.paddleTransactionId !== existing.paddleTransactionId ||
        command.licenseClaimHash !== existing.licenseClaimHash
      ) {
        throw new ProvisioningInvariantError(
          'PERSISTENCE_FAILED',
          'Paddle claim pair conflicts with the existing subscription',
        );
      }
    } else if (command.kind === 'provision-period' && !hasTransaction) {
      throw new ProvisioningInvariantError(
        'INVALID_PAYLOAD',
        'Paid provisioning cannot create transaction-only claim routing',
      );
    }

    if (
      command.kind === 'provision-period' &&
      isPaddleStateNewer(command, {
        occurredAt: existing.paddleOccurredAt,
        eventType: existing.paddleEventType,
        eventId: existing.paddleEventId,
      })
    ) {
      update.paddleLastTransactionId = command.paddleTransactionId;
    }

    if (Object.keys(update).length === 0) return existing;
    return tx.subscription.update({ where: { id: existing.id }, data: update });
  }

  private async ensureAllocation(
    tx: Prisma.TransactionClient,
    userId: string,
    subscriptionId: string,
    command: ProvisionPaddlePeriodCommand,
  ): Promise<void> {
    const inserted = await tx.creditAllocation.createMany({
      data: [
        {
          userId,
          subscriptionId,
          paddleTransactionId: command.paddleTransactionId,
          totalCredits: command.totalCredits,
          remainingCredits: command.totalCredits,
          periodStart: command.periodStart,
          periodEnd: command.periodEnd,
        },
      ],
      skipDuplicates: true,
    });
    if (inserted.count === 1) return;

    const existing = await tx.creditAllocation.findUnique({
      where: { paddleTransactionId: command.paddleTransactionId },
    });
    if (
      !existing ||
      existing.userId !== userId ||
      existing.subscriptionId !== subscriptionId ||
      existing.totalCredits !== command.totalCredits ||
      existing.periodStart.getTime() !== command.periodStart.getTime() ||
      existing.periodEnd.getTime() !== command.periodEnd.getTime()
    ) {
      throw new ProvisioningInvariantError(
        'PERSISTENCE_FAILED',
        'Source Paddle transaction conflicts with an existing credit allocation',
      );
    }
  }
}

function requireInitialPeriod(
  command: Exclude<PaddleProvisioningCommand, { kind: 'unsupported' }>,
): { start: Date; end: Date } {
  if (!command.periodStart || !command.periodEnd) {
    throw new ProvisioningInvariantError(
      'INVALID_PAYLOAD',
      'Cannot create a subscription from an event with a null billing period',
    );
  }
  return { start: command.periodStart, end: command.periodEnd };
}

function safePersistenceCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code: unknown }).code;
  return typeof code === 'string' && /^P[0-9]{4}$/.test(code) ? code : undefined;
}
