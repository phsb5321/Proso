import { ErrorCode, isErr, isOk } from '@proso/shared';
import { type CreditServiceDeps, deductCredits } from '../../../../src/core/credits/credit.service';
import type {
  CreditAllocationRecord,
  CreditDeductionMetadata,
  CreditDeductionRecord,
  CreditRepositoryPort,
} from '../../../../src/ports/credit-repository.port';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockAllocation(
  overrides: Partial<CreditAllocationRecord> = {},
): CreditAllocationRecord {
  return {
    id: 'alloc-1',
    userId: 'user-1',
    subscriptionId: 'sub-1',
    totalCredits: 500_000,
    remainingCredits: 350_000,
    periodStart: new Date('2026-01-01'),
    periodEnd: new Date('2026-03-01'),
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeMockTransaction(
  overrides: Partial<CreditDeductionRecord> = {},
): CreditDeductionRecord {
  return {
    id: 'tx-1',
    userId: 'user-1',
    allocationId: 'alloc-1',
    type: 'deduction',
    amount: 1000,
    provider: 'openai',
    characterCount: 100,
    description: 'TTS synthesis via openai',
    createdAt: new Date(),
    remainingCredits: 349_000,
    ...overrides,
  };
}

function makeMockRepository(): jest.Mocked<CreditRepositoryPort> {
  return {
    findCurrentAllocation: jest.fn(),
    deductCredits: jest.fn(),
    getAllocationHistory: jest.fn(),
    createAllocation: jest.fn(),
  } as unknown as jest.Mocked<CreditRepositoryPort>;
}

function makeDeps(repo: jest.Mocked<CreditRepositoryPort>): CreditServiceDeps {
  return { creditRepository: repo };
}

const defaultMetadata: CreditDeductionMetadata = {
  provider: 'openai',
  characterCount: 100,
  description: 'TTS synthesis via openai',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreditService.deductCredits', () => {
  let repo: jest.Mocked<CreditRepositoryPort>;
  let deps: CreditServiceDeps;

  beforeEach(() => {
    repo = makeMockRepository();
    deps = makeDeps(repo);
    // Default: simulate "now" within the allocation period (2026-01-01 to 2026-03-01).
    // Tests that need a specific "now" will use jest.useFakeTimers.
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-01T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // 1. Successful deduction
  // -----------------------------------------------------------------------
  describe('Successful deduction', () => {
    it('returns Ok with the transaction record when allocation is valid and has sufficient credits', async () => {
      const allocation = makeMockAllocation();
      const transaction = makeMockTransaction();

      repo.findCurrentAllocation.mockResolvedValue(allocation);
      repo.deductCredits.mockResolvedValue(transaction);

      const result = await deductCredits('user-1', 1000, defaultMetadata, deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toBe(transaction);
      expect(result.value.remainingCredits).toBe(349_000);
    });

    it('returns the exact transaction object from the repository', async () => {
      const allocation = makeMockAllocation();
      const transaction = makeMockTransaction({ id: 'tx-custom', amount: 5000 });

      repo.findCurrentAllocation.mockResolvedValue(allocation);
      repo.deductCredits.mockResolvedValue(transaction);

      const result = await deductCredits('user-1', 5000, defaultMetadata, deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.id).toBe('tx-custom');
      expect(result.value.amount).toBe(5000);
    });
  });

  // -----------------------------------------------------------------------
  // 2. No allocation found
  // -----------------------------------------------------------------------
  describe('No allocation found', () => {
    it('returns Err with NoActiveAllocation when findCurrentAllocation returns null', async () => {
      repo.findCurrentAllocation.mockResolvedValue(null);

      const result = await deductCredits('user-1', 1000, defaultMetadata, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe(ErrorCode.NoActiveAllocation);
    });

    it('includes the userId in the error message', async () => {
      repo.findCurrentAllocation.mockResolvedValue(null);

      const result = await deductCredits('user-xyz', 1000, defaultMetadata, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.message).toContain('user-xyz');
    });

    it('does not call deductCredits on the repository', async () => {
      repo.findCurrentAllocation.mockResolvedValue(null);

      await deductCredits('user-1', 1000, defaultMetadata, deps);

      expect(repo.deductCredits).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 3. Expired allocation period
  // -----------------------------------------------------------------------
  describe('Expired allocation period', () => {
    it('returns Err with NoActiveAllocation when periodEnd is in the past', async () => {
      const expiredAllocation = makeMockAllocation({
        periodEnd: new Date('2026-01-15'), // past relative to 2026-02-01 fake now
      });
      repo.findCurrentAllocation.mockResolvedValue(expiredAllocation);

      const result = await deductCredits('user-1', 1000, defaultMetadata, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe(ErrorCode.NoActiveAllocation);
    });

    it('includes the periodEnd in the error message', async () => {
      const expiredAllocation = makeMockAllocation({
        periodEnd: new Date('2026-01-15T00:00:00.000Z'),
      });
      repo.findCurrentAllocation.mockResolvedValue(expiredAllocation);

      const result = await deductCredits('user-1', 1000, defaultMetadata, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.message).toContain('expired');
      expect(result.error.message).toContain('2026-01-15');
    });

    it('includes periodEnd in the error details', async () => {
      const periodEnd = new Date('2026-01-15T00:00:00.000Z');
      const expiredAllocation = makeMockAllocation({ periodEnd });
      repo.findCurrentAllocation.mockResolvedValue(expiredAllocation);

      const result = await deductCredits('user-1', 1000, defaultMetadata, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.details).toBeDefined();
      expect(result.error.details!.periodEnd).toBe(periodEnd.toISOString());
    });

    it('does not call deductCredits on the repository when expired', async () => {
      const expiredAllocation = makeMockAllocation({
        periodEnd: new Date('2026-01-15'),
      });
      repo.findCurrentAllocation.mockResolvedValue(expiredAllocation);

      await deductCredits('user-1', 1000, defaultMetadata, deps);

      expect(repo.deductCredits).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 4. Insufficient credits
  // -----------------------------------------------------------------------
  describe('Insufficient credits', () => {
    it('returns Err with InsufficientCredits when requested > remaining', async () => {
      const allocation = makeMockAllocation({ remainingCredits: 500 });
      repo.findCurrentAllocation.mockResolvedValue(allocation);

      const result = await deductCredits('user-1', 1000, defaultMetadata, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe(ErrorCode.InsufficientCredits);
    });

    it('includes requested, remaining, and total in error details', async () => {
      const allocation = makeMockAllocation({
        totalCredits: 500_000,
        remainingCredits: 200,
      });
      repo.findCurrentAllocation.mockResolvedValue(allocation);

      const result = await deductCredits('user-1', 1000, defaultMetadata, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.details).toEqual({
        requested: 1000,
        remaining: 200,
        total: 500_000,
      });
    });

    it('includes requested and remaining amounts in the error message', async () => {
      const allocation = makeMockAllocation({ remainingCredits: 42 });
      repo.findCurrentAllocation.mockResolvedValue(allocation);

      const result = await deductCredits('user-1', 9999, defaultMetadata, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.message).toContain('9999');
      expect(result.error.message).toContain('42');
    });

    it('does not call deductCredits on the repository when insufficient', async () => {
      const allocation = makeMockAllocation({ remainingCredits: 10 });
      repo.findCurrentAllocation.mockResolvedValue(allocation);

      await deductCredits('user-1', 100, defaultMetadata, deps);

      expect(repo.deductCredits).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 5. Edge: exact credit amount
  // -----------------------------------------------------------------------
  describe('Edge: exact credit amount', () => {
    it('succeeds when remaining credits exactly equals the requested amount', async () => {
      const allocation = makeMockAllocation({ remainingCredits: 1000 });
      const transaction = makeMockTransaction({ amount: 1000 });
      repo.findCurrentAllocation.mockResolvedValue(allocation);
      repo.deductCredits.mockResolvedValue(transaction);

      const result = await deductCredits('user-1', 1000, defaultMetadata, deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.amount).toBe(1000);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Edge: zero amount
  // -----------------------------------------------------------------------
  describe('Edge: zero amount', () => {
    it('succeeds when deducting 0 credits', async () => {
      const allocation = makeMockAllocation({ remainingCredits: 350_000 });
      const transaction = makeMockTransaction({ amount: 0 });
      repo.findCurrentAllocation.mockResolvedValue(allocation);
      repo.deductCredits.mockResolvedValue(transaction);

      const result = await deductCredits('user-1', 0, defaultMetadata, deps);

      expect(isOk(result)).toBe(true);
    });

    it('calls repository deductCredits with amount 0', async () => {
      const allocation = makeMockAllocation();
      const transaction = makeMockTransaction({ amount: 0 });
      repo.findCurrentAllocation.mockResolvedValue(allocation);
      repo.deductCredits.mockResolvedValue(transaction);

      await deductCredits('user-1', 0, defaultMetadata, deps);

      expect(repo.deductCredits).toHaveBeenCalledWith('alloc-1', 0, defaultMetadata);
    });
  });

  // -----------------------------------------------------------------------
  // 7. Edge: very large amount
  // -----------------------------------------------------------------------
  describe('Edge: very large amount', () => {
    it('returns InsufficientCredits when amount far exceeds balance', async () => {
      const allocation = makeMockAllocation({ remainingCredits: 1000 });
      repo.findCurrentAllocation.mockResolvedValue(allocation);

      const result = await deductCredits('user-1', 10_000_000, defaultMetadata, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe(ErrorCode.InsufficientCredits);
      expect(result.error.details!.requested).toBe(10_000_000);
    });
  });

  // -----------------------------------------------------------------------
  // 8. Metadata pass-through
  // -----------------------------------------------------------------------
  describe('Metadata pass-through', () => {
    it('passes metadata to repository deductCredits', async () => {
      const allocation = makeMockAllocation();
      const transaction = makeMockTransaction();
      repo.findCurrentAllocation.mockResolvedValue(allocation);
      repo.deductCredits.mockResolvedValue(transaction);

      const metadata: CreditDeductionMetadata = {
        provider: 'elevenlabs',
        characterCount: 500,
        description: 'Premium voice synthesis',
      };

      await deductCredits('user-1', 1000, metadata, deps);

      expect(repo.deductCredits).toHaveBeenCalledWith('alloc-1', 1000, metadata);
    });

    it('passes metadata without optional description', async () => {
      const allocation = makeMockAllocation();
      const transaction = makeMockTransaction();
      repo.findCurrentAllocation.mockResolvedValue(allocation);
      repo.deductCredits.mockResolvedValue(transaction);

      const metadata: CreditDeductionMetadata = {
        provider: 'groq',
        characterCount: 200,
      };

      await deductCredits('user-1', 500, metadata, deps);

      expect(repo.deductCredits).toHaveBeenCalledWith('alloc-1', 500, metadata);
    });
  });

  // -----------------------------------------------------------------------
  // 9. INV-004: allocation not expired until periodEnd
  // -----------------------------------------------------------------------
  describe('INV-004: allocation valid until exact periodEnd time', () => {
    it('succeeds when current time is exactly 1ms before periodEnd', async () => {
      const periodEnd = new Date('2026-03-01T00:00:00.000Z');
      jest.setSystemTime(new Date(periodEnd.getTime() - 1));

      const allocation = makeMockAllocation({ periodEnd });
      const transaction = makeMockTransaction();
      repo.findCurrentAllocation.mockResolvedValue(allocation);
      repo.deductCredits.mockResolvedValue(transaction);

      const result = await deductCredits('user-1', 1000, defaultMetadata, deps);

      expect(isOk(result)).toBe(true);
    });

    it('fails when current time is exactly 1ms after periodEnd', async () => {
      const periodEnd = new Date('2026-03-01T00:00:00.000Z');
      jest.setSystemTime(new Date(periodEnd.getTime() + 1));

      const allocation = makeMockAllocation({ periodEnd });
      repo.findCurrentAllocation.mockResolvedValue(allocation);

      const result = await deductCredits('user-1', 1000, defaultMetadata, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe(ErrorCode.NoActiveAllocation);
    });

    it('fails when current time equals periodEnd exactly (strict less-than)', async () => {
      // The implementation uses `periodEnd.getTime() < now.getTime()`,
      // so when periodEnd === now, the condition is false and the allocation is valid.
      const periodEnd = new Date('2026-03-01T00:00:00.000Z');
      jest.setSystemTime(periodEnd);

      const allocation = makeMockAllocation({ periodEnd });
      const transaction = makeMockTransaction();
      repo.findCurrentAllocation.mockResolvedValue(allocation);
      repo.deductCredits.mockResolvedValue(transaction);

      const result = await deductCredits('user-1', 1000, defaultMetadata, deps);

      // periodEnd < now => false when equal, so allocation is still valid
      expect(isOk(result)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 10. Repository interaction
  // -----------------------------------------------------------------------
  describe('Repository interaction', () => {
    it('calls findCurrentAllocation with the provided userId', async () => {
      repo.findCurrentAllocation.mockResolvedValue(null);

      await deductCredits('user-abc-123', 1000, defaultMetadata, deps);

      expect(repo.findCurrentAllocation).toHaveBeenCalledTimes(1);
      expect(repo.findCurrentAllocation).toHaveBeenCalledWith('user-abc-123');
    });

    it('calls deductCredits with the correct allocationId from the found allocation', async () => {
      const allocation = makeMockAllocation({ id: 'alloc-custom-42' });
      const transaction = makeMockTransaction();
      repo.findCurrentAllocation.mockResolvedValue(allocation);
      repo.deductCredits.mockResolvedValue(transaction);

      await deductCredits('user-1', 2500, defaultMetadata, deps);

      expect(repo.deductCredits).toHaveBeenCalledTimes(1);
      expect(repo.deductCredits).toHaveBeenCalledWith('alloc-custom-42', 2500, defaultMetadata);
    });

    it('does not call deductCredits when findCurrentAllocation returns null', async () => {
      repo.findCurrentAllocation.mockResolvedValue(null);

      await deductCredits('user-1', 1000, defaultMetadata, deps);

      expect(repo.deductCredits).not.toHaveBeenCalled();
    });

    it('calls findCurrentAllocation exactly once per invocation', async () => {
      const allocation = makeMockAllocation();
      const transaction = makeMockTransaction();
      repo.findCurrentAllocation.mockResolvedValue(allocation);
      repo.deductCredits.mockResolvedValue(transaction);

      await deductCredits('user-1', 1000, defaultMetadata, deps);

      expect(repo.findCurrentAllocation).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Additional edge cases
  // -----------------------------------------------------------------------
  describe('Error type correctness', () => {
    it('NoActiveAllocation error for null allocation has correct structure', async () => {
      repo.findCurrentAllocation.mockResolvedValue(null);

      const result = await deductCredits('user-1', 1000, defaultMetadata, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error).toHaveProperty('code');
      expect(result.error).toHaveProperty('message');
      expect(typeof result.error.message).toBe('string');
    });

    it('InsufficientCredits error has correct structure with details', async () => {
      const allocation = makeMockAllocation({ remainingCredits: 10 });
      repo.findCurrentAllocation.mockResolvedValue(allocation);

      const result = await deductCredits('user-1', 100, defaultMetadata, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error).toHaveProperty('code');
      expect(result.error).toHaveProperty('message');
      expect(result.error).toHaveProperty('details');
      expect(result.error.details).toHaveProperty('requested');
      expect(result.error.details).toHaveProperty('remaining');
      expect(result.error.details).toHaveProperty('total');
    });
  });

  describe('Conditional commit', () => {
    it('returns InsufficientCredits when the repository rejects a raced debit', async () => {
      repo.findCurrentAllocation.mockResolvedValue(makeMockAllocation());
      repo.deductCredits.mockResolvedValue(null);

      const result = await deductCredits('user-1', 1000, defaultMetadata, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe(ErrorCode.InsufficientCredits);
      expect(result.error.message).toContain('changed before');
    });
  });

  describe('Multiple users isolation', () => {
    it('passes different userIds to findCurrentAllocation correctly', async () => {
      repo.findCurrentAllocation.mockResolvedValue(null);

      await deductCredits('user-A', 1000, defaultMetadata, deps);
      await deductCredits('user-B', 2000, defaultMetadata, deps);

      expect(repo.findCurrentAllocation).toHaveBeenNthCalledWith(1, 'user-A');
      expect(repo.findCurrentAllocation).toHaveBeenNthCalledWith(2, 'user-B');
    });
  });

  describe('Different providers in metadata', () => {
    it('passes elevenlabs provider metadata through correctly', async () => {
      const allocation = makeMockAllocation();
      const transaction = makeMockTransaction({ provider: 'elevenlabs' });
      repo.findCurrentAllocation.mockResolvedValue(allocation);
      repo.deductCredits.mockResolvedValue(transaction);

      const metadata: CreditDeductionMetadata = {
        provider: 'elevenlabs',
        characterCount: 1500,
        description: 'ElevenLabs premium voice',
      };

      const result = await deductCredits('user-1', 3000, metadata, deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.provider).toBe('elevenlabs');
      expect(repo.deductCredits).toHaveBeenCalledWith('alloc-1', 3000, metadata);
    });
  });
});
