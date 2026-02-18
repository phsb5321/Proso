// Unit tests for CreditsController
// Tests HTTP boundary logic: balance retrieval, history pagination,
// usagePercent calculation, missing allocation, and authentication checks.

import { HttpStatus } from '@nestjs/common';
import { ErrorCode, TransactionType } from '@voxpage/shared';
import { CreditsController } from '../../../src/infrastructure/controllers/credits.controller';
import type {
  CreditAllocationRecord,
  CreditTransactionRecord,
} from '../../../src/ports/credit-repository.port';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockCreditRepo() {
  return {
    findCurrentAllocation: jest.fn(),
    deductCredits: jest.fn(),
    getAllocationHistory: jest.fn().mockResolvedValue([]),
    getTransactionCount: jest.fn().mockResolvedValue(0),
    createAllocation: jest.fn(),
  };
}

function makeAllocation(overrides: Partial<CreditAllocationRecord> = {}): CreditAllocationRecord {
  const now = new Date('2026-02-01T00:00:00Z');
  return {
    id: 'alloc-1',
    userId: 'user-1',
    subscriptionId: 'sub-1',
    totalCredits: 10000,
    remainingCredits: 7500,
    periodStart: now,
    periodEnd: new Date('2026-03-01T00:00:00Z'),
    createdAt: now,
    ...overrides,
  };
}

function makeTransactionRecord(overrides: Partial<CreditTransactionRecord> = {}): CreditTransactionRecord {
  return {
    id: 'tx-1',
    userId: 'user-1',
    allocationId: 'alloc-1',
    type: TransactionType.Deduction,
    amount: 150,
    provider: 'openai',
    characterCount: 1000,
    description: 'TTS synthesis',
    createdAt: new Date('2026-02-05T10:30:00Z'),
    ...overrides,
  };
}

/**
 * Build a mock Express Request with optional userId.
 */
function createMockRequest(userId?: string): Record<string, unknown> {
  return {
    userId,
    query: {},
  };
}

/**
 * Build a mock Express Response that captures status and json calls.
 */
function createMockResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status: jest.fn().mockImplementation((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn().mockImplementation((body: unknown) => {
      res.body = body;
      return res;
    }),
  };
  return res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreditsController', () => {
  let controller: CreditsController;
  let creditRepo: ReturnType<typeof createMockCreditRepo>;

  beforeEach(() => {
    creditRepo = createMockCreditRepo();
    controller = new CreditsController(creditRepo as any);
  });

  // ─── GET /balance ───────────────────────────────────────────────

  describe('GET /balance', () => {
    it('returns balance from active allocation', async () => {
      const allocation = makeAllocation();
      creditRepo.findCurrentAllocation.mockResolvedValue(allocation);

      const req = createMockRequest('user-1');
      const res = createMockResponse();

      await controller.getBalance(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith({
        total: 10000,
        remaining: 7500,
        usagePercent: 25,
        periodStart: '2026-02-01T00:00:00.000Z',
        periodEnd: '2026-03-01T00:00:00.000Z',
      });
    });

    it('returns zeros when no allocation exists', async () => {
      creditRepo.findCurrentAllocation.mockResolvedValue(null);

      const req = createMockRequest('user-1');
      const res = createMockResponse();

      await controller.getBalance(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith({
        total: 0,
        remaining: 0,
        usagePercent: 0,
      });
    });

    it('returns 401 when no userId on request', async () => {
      const req = createMockRequest(undefined);
      const res = createMockResponse();

      await controller.getBalance(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: ErrorCode.Unauthorized,
      });
      // Should NOT have called repository
      expect(creditRepo.findCurrentAllocation).not.toHaveBeenCalled();
    });

    it('calculates usagePercent correctly when 50% used', async () => {
      const allocation = makeAllocation({
        totalCredits: 10000,
        remainingCredits: 5000,
      });
      creditRepo.findCurrentAllocation.mockResolvedValue(allocation);

      const req = createMockRequest('user-1');
      const res = createMockResponse();

      await controller.getBalance(req as any, res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ usagePercent: 50 }),
      );
    });

    it('calculates usagePercent as 100 when all credits used', async () => {
      const allocation = makeAllocation({
        totalCredits: 10000,
        remainingCredits: 0,
      });
      creditRepo.findCurrentAllocation.mockResolvedValue(allocation);

      const req = createMockRequest('user-1');
      const res = createMockResponse();

      await controller.getBalance(req as any, res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ usagePercent: 100 }),
      );
    });

    it('calculates usagePercent as 0 when totalCredits is 0', async () => {
      const allocation = makeAllocation({
        totalCredits: 0,
        remainingCredits: 0,
      });
      creditRepo.findCurrentAllocation.mockResolvedValue(allocation);

      const req = createMockRequest('user-1');
      const res = createMockResponse();

      await controller.getBalance(req as any, res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ usagePercent: 0 }),
      );
    });
  });

  // ─── GET /history ───────────────────────────────────────────────

  describe('GET /history', () => {
    it('returns transactions with total count', async () => {
      const records = [
        makeTransactionRecord({ id: 'tx-1', amount: 150 }),
        makeTransactionRecord({ id: 'tx-2', amount: 200, type: TransactionType.Allocation }),
      ];
      creditRepo.getAllocationHistory.mockResolvedValue(records);
      creditRepo.getTransactionCount.mockResolvedValue(2);

      const req = createMockRequest('user-1');
      const res = createMockResponse();

      await controller.getHistory(req as any, res as any, '50', '0');

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith({
        transactions: [
          expect.objectContaining({
            id: 'tx-1',
            type: TransactionType.Deduction,
            amount: 150,
            provider: 'openai',
            characterCount: 1000,
            createdAt: '2026-02-05T10:30:00.000Z',
          }),
          expect.objectContaining({
            id: 'tx-2',
            type: TransactionType.Allocation,
            amount: 200,
          }),
        ],
        total: 2,
      });
    });

    it('applies default limit and offset when query params are omitted', async () => {
      creditRepo.getAllocationHistory.mockResolvedValue([]);
      creditRepo.getTransactionCount.mockResolvedValue(0);

      const req = createMockRequest('user-1');
      const res = createMockResponse();

      await controller.getHistory(req as any, res as any, undefined, undefined);

      expect(creditRepo.getAllocationHistory).toHaveBeenCalledWith('user-1', 50, 0);
    });

    it('clamps limit to maximum of 100', async () => {
      creditRepo.getAllocationHistory.mockResolvedValue([]);
      creditRepo.getTransactionCount.mockResolvedValue(0);

      const req = createMockRequest('user-1');
      const res = createMockResponse();

      await controller.getHistory(req as any, res as any, '999', '0');

      expect(creditRepo.getAllocationHistory).toHaveBeenCalledWith('user-1', 100, 0);
    });

    it('returns empty array when no transactions exist', async () => {
      creditRepo.getAllocationHistory.mockResolvedValue([]);
      creditRepo.getTransactionCount.mockResolvedValue(0);

      const req = createMockRequest('user-1');
      const res = createMockResponse();

      await controller.getHistory(req as any, res as any, '50', '0');

      expect(res.json).toHaveBeenCalledWith({
        transactions: [],
        total: 0,
      });
    });

    it('returns 401 when no userId on request', async () => {
      const req = createMockRequest(undefined);
      const res = createMockResponse();

      await controller.getHistory(req as any, res as any, '50', '0');

      expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: ErrorCode.Unauthorized,
      });
      // Should NOT have called repository
      expect(creditRepo.getAllocationHistory).not.toHaveBeenCalled();
      expect(creditRepo.getTransactionCount).not.toHaveBeenCalled();
    });

    it('omits optional fields when not present in record', async () => {
      const record = makeTransactionRecord({
        id: 'tx-no-optional',
        provider: undefined,
        characterCount: undefined,
      });
      creditRepo.getAllocationHistory.mockResolvedValue([record]);
      creditRepo.getTransactionCount.mockResolvedValue(1);

      const req = createMockRequest('user-1');
      const res = createMockResponse();

      await controller.getHistory(req as any, res as any, '50', '0');

      const body = res.body as { transactions: Record<string, unknown>[] };
      expect(body.transactions[0]).not.toHaveProperty('provider');
      expect(body.transactions[0]).not.toHaveProperty('characterCount');
    });

    it('handles non-numeric limit gracefully by using default', async () => {
      creditRepo.getAllocationHistory.mockResolvedValue([]);
      creditRepo.getTransactionCount.mockResolvedValue(0);

      const req = createMockRequest('user-1');
      const res = createMockResponse();

      await controller.getHistory(req as any, res as any, 'abc', 'xyz');

      expect(creditRepo.getAllocationHistory).toHaveBeenCalledWith('user-1', 50, 0);
    });

    it('passes offset correctly to repository', async () => {
      creditRepo.getAllocationHistory.mockResolvedValue([]);
      creditRepo.getTransactionCount.mockResolvedValue(0);

      const req = createMockRequest('user-1');
      const res = createMockResponse();

      await controller.getHistory(req as any, res as any, '20', '40');

      expect(creditRepo.getAllocationHistory).toHaveBeenCalledWith('user-1', 20, 40);
    });
  });
});
