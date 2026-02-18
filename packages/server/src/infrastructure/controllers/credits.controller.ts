// Credits controller — HTTP boundary for credit balance and history queries
// Maps HTTP requests to credit repository calls and formats responses.
//
// Routes:
//   GET /api/v1/credits/balance  — current credit balance for authenticated user
//   GET /api/v1/credits/history  — paginated credit transaction history

import {
  Controller,
  Get,
  Req,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  type CreditBalanceResponse,
  type CreditHistoryResponse,
  type CreditTransaction,
  TransactionType,
  ErrorCode,
} from '@voxpage/shared';
import { CreditRepositoryPort, type CreditTransactionRecord } from '../../ports/credit-repository.port';

/** Maximum number of transactions a client can request in one page. */
const MAX_HISTORY_LIMIT = 100;

/** Default number of transactions per page. */
const DEFAULT_HISTORY_LIMIT = 50;

@Controller('api/v1/credits')
export class CreditsController {
  private readonly logger = new Logger(CreditsController.name);

  constructor(
    private readonly creditRepository: CreditRepositoryPort,
  ) {}

  // ─── GET /balance ─────────────────────────────────────────────────

  @Get('balance')
  @HttpCode(HttpStatus.OK)
  async getBalance(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        error: 'Authentication required',
        code: ErrorCode.Unauthorized,
      });
      return;
    }

    const allocation = await this.creditRepository.findCurrentAllocation(userId);

    if (!allocation) {
      this.logger.debug(`No active allocation for user=${userId}`);
      const response: CreditBalanceResponse = {
        total: 0,
        remaining: 0,
        usagePercent: 0,
      };
      res.status(HttpStatus.OK).json(response);
      return;
    }

    const usagePercent =
      allocation.totalCredits > 0
        ? Math.round(
            ((allocation.totalCredits - allocation.remainingCredits) /
              allocation.totalCredits) *
              100,
          )
        : 0;

    const response: CreditBalanceResponse = {
      total: allocation.totalCredits,
      remaining: allocation.remainingCredits,
      usagePercent,
      periodStart: allocation.periodStart.toISOString(),
      periodEnd: allocation.periodEnd.toISOString(),
    };

    res.status(HttpStatus.OK).json(response);
  }

  // ─── GET /history ─────────────────────────────────────────────────

  @Get('history')
  @HttpCode(HttpStatus.OK)
  async getHistory(
    @Req() req: Request,
    @Res() res: Response,
    @Query('limit') limitParam?: string,
    @Query('offset') offsetParam?: string,
  ): Promise<void> {
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        error: 'Authentication required',
        code: ErrorCode.Unauthorized,
      });
      return;
    }

    // Parse and clamp query params
    const limit = Math.min(
      Math.max(1, parseInt(limitParam ?? '', 10) || DEFAULT_HISTORY_LIMIT),
      MAX_HISTORY_LIMIT,
    );
    const offset = Math.max(0, parseInt(offsetParam ?? '', 10) || 0);

    const [records, total] = await Promise.all([
      this.creditRepository.getAllocationHistory(userId, limit, offset),
      this.creditRepository.getTransactionCount(userId),
    ]);

    const transactions: CreditTransaction[] = records.map(
      (record: CreditTransactionRecord) => ({
        id: record.id,
        type: record.type as TransactionType,
        amount: record.amount,
        ...(record.provider != null ? { provider: record.provider as CreditTransaction['provider'] } : {}),
        ...(record.characterCount != null ? { characterCount: record.characterCount } : {}),
        createdAt: record.createdAt.toISOString(),
      }),
    );

    const response: CreditHistoryResponse = { transactions, total };
    res.status(HttpStatus.OK).json(response);
  }
}
