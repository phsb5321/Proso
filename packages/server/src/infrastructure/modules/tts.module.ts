// TTS module — wires cache, provider adapters, and controller
//
// Provider registration is dynamic: only providers with configured API keys
// are added to the TTS_PROVIDERS map. This means the server gracefully
// handles partial configuration (e.g., only OpenAI key set).

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TTSProvider } from '@proso/shared';
import { InMemoryCacheAdapter } from '../../adapters/cache/in-memory-cache.adapter';
import { CartesiaTTSAdapter } from '../../adapters/tts/cartesia-tts.adapter';
import { ElevenLabsTTSAdapter } from '../../adapters/tts/elevenlabs-tts.adapter';
import { GroqTTSAdapter } from '../../adapters/tts/groq-tts.adapter';
import { OpenAITTSAdapter } from '../../adapters/tts/openai-tts.adapter';
import { CacheStorePort } from '../../ports/cache-store.port';
import type { TTSProviderPort } from '../../ports/tts-provider.port';
import { TTSController } from '../controllers/tts.controller';
import { RateLimitModule } from './rate-limit.module';
import { SubscriptionModule } from './subscription.module';

@Module({
  imports: [SubscriptionModule, RateLimitModule],
  controllers: [TTSController],
  providers: [
    // Cache adapter — in-memory placeholder (TODO: swap for Redis)
    // useFactory avoids NestJS trying to DI-inject the plain `maxEntries` param
    { provide: CacheStorePort, useFactory: () => new InMemoryCacheAdapter(1000) },

    // Individual TTS adapters (registered so NestJS can inject ConfigService)
    OpenAITTSAdapter,
    ElevenLabsTTSAdapter,
    GroqTTSAdapter,
    CartesiaTTSAdapter,

    // Dynamic provider map — only includes adapters with configured API keys
    // Cartesia is always registered (BYOK-only, no server key needed)
    {
      provide: 'TTS_PROVIDERS',
      useFactory: (
        config: ConfigService,
        openai: OpenAITTSAdapter,
        elevenlabs: ElevenLabsTTSAdapter,
        groq: GroqTTSAdapter,
        cartesia: CartesiaTTSAdapter,
      ): Map<TTSProvider, TTSProviderPort> => {
        const providers = new Map<TTSProvider, TTSProviderPort>();

        if (config.get<string>('OPENAI_API_KEY')) {
          providers.set(TTSProvider.OpenAI, openai);
        }

        if (config.get<string>('ELEVENLABS_API_KEY')) {
          providers.set(TTSProvider.ElevenLabs, elevenlabs);
        }

        if (config.get<string>('GROQ_API_KEY')) {
          providers.set(TTSProvider.Groq, groq);
        }

        // Cartesia is always available for BYOK users (INV-002)
        providers.set(TTSProvider.Cartesia, cartesia);

        return providers;
      },
      inject: [
        ConfigService,
        OpenAITTSAdapter,
        ElevenLabsTTSAdapter,
        GroqTTSAdapter,
        CartesiaTTSAdapter,
      ],
    },
  ],
  exports: [CacheStorePort],
})
export class TTSModule {}
