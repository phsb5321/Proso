// Credit service — pure domain logic for credit deduction
// ZERO NestJS imports — pure TypeScript business logic
//
// Enforces:
//   INV-004: No credit expiration mid-billing cycle (expired allocation check)
//   INV-006: Cached content never re-charges (caller responsibility — TTS service)

import { ErrorCode } from '@proso/shared';
import type { Result } from '@proso/shared';
import { Err, Ok } from '@proso/shared';
import type {
  CreditAllocationRecord,
  CreditDeductionMetadata,
  CreditDeductionRecord,
  CreditRepositoryPort,
} from '../../ports/credit-repository.port.js';
import { creditError } from '../shared/domain-errors.js';
import type { CreditError } from '../shared/domain-errors.js';

export interface CreditServiceDeps {
  creditRepository: CreditRepositoryPort;
}

/**
 * Validate that the current allocation can cover a future conditional debit.
 *
 * Checks:
 * 1. Active allocation exists
 * 2. Allocation period has not expired (INV-004)
 * 3. Sufficient remaining credits
 *
 * This is a preflight only. The repository still enforces the balance
 * condition atomically when the debit is committed.
 */
export async function checkCredits(
  userId: string,
  amount: number,
  deps: CreditServiceDeps,
): Promise<Result<CreditAllocationRecord, CreditError>> {
  const allocation = await deps.creditRepository.findCurrentAllocation(userId);

  if (!allocation) {
    return Err(
      creditError(
        ErrorCode.NoActiveAllocation,
        `No active credit allocation found for user ${userId}`,
      ),
    );
  }

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

  return Ok(allocation);
}

/**
 * Commit a conditional credit debit.
 *
 * The preflight keeps known-invalid requests away from paid providers. The
 * repository condition is still authoritative so concurrent requests cannot
 * drive the balance below zero between the check and the commit.
 */
export async function deductCredits(
  userId: string,
  amount: number,
  metadata: CreditDeductionMetadata,
  deps: CreditServiceDeps,
): Promise<Result<CreditDeductionRecord, CreditError>> {
  const preflight = await checkCredits(userId, amount, deps);
  if (!preflight.ok) {
    return preflight;
  }

  const transaction = await deps.creditRepository.deductCredits(
    preflight.value.id,
    amount,
    metadata,
  );
  if (!transaction) {
    return Err(
      creditError(
        ErrorCode.InsufficientCredits,
        'Credit balance changed before the synthesis debit could be committed',
        {
          requested: amount,
          allocationId: preflight.value.id,
        },
      ),
    );
  }

  return Ok(transaction);
}
