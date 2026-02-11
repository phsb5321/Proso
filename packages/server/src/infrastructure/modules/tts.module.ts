// TTS module — wires cache, provider adapters, and controller
//
// Provider registration is dynamic: only providers with configured API keys
// are added to the TTS_PROVIDERS map. This means the server gracefully
// handles partial configuration (e.g., only OpenAI key set).

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TTSProvider } from '@voxpage/shared';
import { TTSController } from '../controllers/tts.controller';
import { CacheStorePort } from '../../ports/cache-store.port';
import { TTSProviderPort } from '../../ports/tts-provider.port';
import { InMemoryCacheAdapter } from '../../adapters/cache/in-memory-cache.adapter';
import { OpenAITTSAdapter } from '../../adapters/tts/openai-tts.adapter';
import { ElevenLabsTTSAdapter } from '../../adapters/tts/elevenlabs-tts.adapter';
import { GroqTTSAdapter } from '../../adapters/tts/groq-tts.adapter';
import { SubscriptionModule } from './subscription.module';

@Module({
  imports: [SubscriptionModule],
  controllers: [TTSController],
  providers: [
    // Cache adapter — in-memory placeholder (TODO: swap for Redis)
    { provide: CacheStorePort, useClass: InMemoryCacheAdapter },

    // Individual TTS adapters (registered so NestJS can inject ConfigService)
    OpenAITTSAdapter,
    ElevenLabsTTSAdapter,
    GroqTTSAdapter,

    // Dynamic provider map — only includes adapters with configured API keys
    {
      provide: 'TTS_PROVIDERS',
      useFactory: (
        config: ConfigService,
        openai: OpenAITTSAdapter,
        elevenlabs: ElevenLabsTTSAdapter,
        groq: GroqTTSAdapter,
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

        return providers;
      },
      inject: [ConfigService, OpenAITTSAdapter, ElevenLabsTTSAdapter, GroqTTSAdapter],
    },
  ],
  exports: [CacheStorePort],
})
export class TTSModule {}
