import { z } from 'zod';

export const CreditHistoryParamsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export type CreditHistoryParamsParsed = z.infer<typeof CreditHistoryParamsSchema>;
