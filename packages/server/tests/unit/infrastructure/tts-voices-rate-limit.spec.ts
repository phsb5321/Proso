import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { Ok, TTSProvider } from '@proso/shared';
import { TTSController } from '../../../src/infrastructure/controllers/tts.controller';
import { CacheStorePort } from '../../../src/ports/cache-store.port';
import { CreditRepositoryPort } from '../../../src/ports/credit-repository.port';
import { SubscriptionRepositoryPort } from '../../../src/ports/subscription-repository.port';
import type { TTSProviderPort } from '../../../src/ports/tts-provider.port';

describe('provider-backed anonymous endpoint rate limits', () => {
  let app: INestApplication;
  let baseUrl: string;
  let getVoices: jest.MockedFunction<TTSProviderPort['getVoices']>;
  let synthesize: jest.MockedFunction<TTSProviderPort['synthesize']>;

  beforeAll(async () => {
    getVoices = jest.fn().mockResolvedValue(Ok([{ id: 'alloy', name: 'Alloy' }]));
    synthesize = jest.fn().mockResolvedValue(
      Ok({
        audio: Buffer.from('test-audio'),
        contentType: 'audio/mpeg',
        provider: TTSProvider.OpenAI,
      }),
    );
    const provider = {
      providerId: TTSProvider.OpenAI,
      supportedLanguages: ['en'],
      synthesize,
      getVoices,
    } as unknown as TTSProviderPort;
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: 'long', ttl: 60_000, limit: 100 }])],
      controllers: [TTSController],
      providers: [
        { provide: CreditRepositoryPort, useValue: {} },
        { provide: CacheStorePort, useValue: {} },
        { provide: SubscriptionRepositoryPort, useValue: {} },
        {
          provide: 'TTS_PROVIDERS',
          useValue: new Map([[TTSProvider.OpenAI, provider]]),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected Nest to listen on an ephemeral TCP port');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects request 31 in the same minute before calling the provider', async () => {
    const url = `${baseUrl}/api/v1/tts/voices/openai`;

    for (let request = 1; request <= 30; request += 1) {
      const response = await fetch(url);
      expect(response.status).toBe(200);
    }

    const blocked = await fetch(url);

    expect(blocked.status).toBe(429);
    expect(getVoices).toHaveBeenCalledTimes(30);
  });

  it('rejects key test 6 in the same minute before calling the provider', async () => {
    const url = `${baseUrl}/api/v1/tts/test-key`;
    const request = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openai', apiKey: 'test-key' }),
    };

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await fetch(url, request);
      expect(response.status).toBe(200);
    }

    const blocked = await fetch(url, request);

    expect(blocked.status).toBe(429);
    expect(synthesize).toHaveBeenCalledTimes(5);
  });
});
