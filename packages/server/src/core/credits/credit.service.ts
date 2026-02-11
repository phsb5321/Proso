// Credit service — pure domain logic for credit deduction
// ZERO NestJS imports — pure TypeScript business logic
//
// Enforces:
//   INV-004: No credit expiration mid-billing cycle (expired allocation check)
//   INV-006: Cached content never re-charges (caller responsibility — TTS service)

import { ErrorCode } from '@voxpage/shared';
import type { Result } from '@voxpage/shared';
import { Ok, Err } from '@voxpage/shared';
import { creditError } from '../shared/domain-errors.js';
import type { CreditError } from '../shared/domain-errors.js';
import type {
  CreditRepositoryPort,
  CreditDeductionMetadata,
  CreditTransactionRecord,
} from '../../ports/credit-repository.port.js';

export interface CreditServiceDeps {
  creditRepository: CreditRepositoryPort;
}

/**
 * Deduct credits from the user's current allocation.
 *
 * Checks:
 * 1. Active allocation exists
 * 2. Allocation period has not expired (INV-004)
 * 3. Sufficient remaining credits
 *
 * Returns the transaction record on success, or a CreditError on failure.
 */
export async function deductCredits(
  userId: string,
  amount: number,
  metadata: CreditDeductionMetadata,
  deps: CreditServiceDeps,
): Promise<Result<CreditTransactionRecord, CreditError>> {
  const allocation = await deps.creditRepository.findCurrentAllocation(userId);

  // No allocation found for this user
  if (!allocation) {
    return Err(
      creditError(
        ErrorCode.NoActiveAllocation,
        `No active credit allocation found for user ${userId}`,
      ),
    );
  }

  // INV-004: Check if the allocation period has expired
  const now = new Date();
  if (allocation.periodEnd.getTime() < now.getTime()) {
    return Err(
      creditError(
        ErrorCode.NoActiveAllocation,
        `Credit allocation period has expired (ended ${allocation.periodEnd.toISOString()})`,
        { periodEnd: allocation.periodEnd.toISOString() },
      ),
    );
  }

  // Check sufficient credits
  if (allocation.remainingCredits < amount) {
    return Err(
      creditError(
        ErrorCode.InsufficientCredits,
        `Insufficient credits: requested ${amount}, remaining ${allocation.remainingCredits}`,
        {
          requested: amount,
          remaining: allocation.remainingCredits,
          total: allocation.totalCredits,
        },
      ),
    );
  }

  // All checks pass — perform deduction
  const transaction = await deps.creditRepository.deductCredits(
    allocation.id,
    amount,
    metadata,
  );

  return Ok(transaction);
}
