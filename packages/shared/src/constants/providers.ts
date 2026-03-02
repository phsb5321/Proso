// Provider cost constants
// Source of truth for credit deduction calculations

import { TTSProvider } from '../domain/provider.js';
import type { ProviderCost } from '../domain/provider.js';

/** Cost per 1000 characters in credit units (1 credit = 1 character) */
export const PROVIDER_COSTS: Record<Exclude<TTSProvider, TTSProvider.Browser>, ProviderCost> = {
  [TTSProvider.OpenAI]: {
    provider: TTSProvider.OpenAI,
    costPer1000Chars: 1000, // 1:1 mapping (1 credit = 1 char)
    description: 'OpenAI TTS — standard quality, fast',
  },
  [TTSProvider.ElevenLabs]: {
    provider: TTSProvider.ElevenLabs,
    costPer1000Chars: 3000, // 3x multiplier (premium quality)
    description: 'ElevenLabs — premium quality, word-level timing',
  },
  [TTSProvider.Groq]: {
    provider: TTSProvider.Groq,
    costPer1000Chars: 500, // 0.5x multiplier (cost-efficient)
    description: 'Groq — fast, cost-efficient',
  },
  [TTSProvider.Cartesia]: {
    provider: TTSProvider.Cartesia,
    costPer1000Chars: 1500, // 1.5x multiplier (BYOK-only on server)
    description: 'Cartesia — high quality, BYOK only',
  },
};

/** Calculate credit cost for a given text length and provider */
export function calculateCreditCost(
  characterCount: number,
  provider: Exclude<TTSProvider, TTSProvider.Browser>,
): number {
  const cost = PROVIDER_COSTS[provider];
  return Math.ceil((characterCount / 1000) * cost.costPer1000Chars);
}
