import { z } from 'zod';
import { TTSProvider } from '../domain/provider.js';

export const TTSSynthesizeRequestSchema = z.object({
  text: z.string().min(1).max(50000),
  provider: z.nativeEnum(TTSProvider).optional(),
  voice: z.string().optional(),
  language: z.string().optional(),
  byokApiKey: z.string().optional(),
});

export type TTSSynthesizeRequestParsed = z.infer<typeof TTSSynthesizeRequestSchema>;

export const TTSTestKeyRequestSchema = z.object({
  provider: z.string().min(1),
  apiKey: z.string().min(1),
});

export type TTSTestKeyRequestParsed = z.infer<typeof TTSTestKeyRequestSchema>;
