# Contract: Audio Generator Adapters

**Feature**: 063-extension-quality-sprint
**Covers**: FR-006, FR-007, FR-008, FR-009

## Interface

All adapters implement `IAudioGenerator` from `src/ports/audio-generator.port.ts`:

```typescript
interface IAudioGenerator {
  generateAudio(request: AudioRequest): Promise<Result<AudioResponse, AudioError>>;
  getVoices(language?: string): Promise<Result<Voice[], AudioError>>;
  validateCredentials(): Promise<boolean>;
  readonly providerId: ProviderId;
  readonly playbackMode: 'blob' | 'direct';
  readonly supportsWordTiming: boolean;
  readonly supportedLanguages: readonly string[];
}
```

## OpenAI Adapter (`OpenAiAudioAdapter`)

- `providerId`: `'openai'`
- `playbackMode`: `'blob'`
- `supportsWordTiming`: `false`
- `supportedLanguages`: `[]` (all languages)
- Model: `gpt-4o-mini-tts` (default), `tts-1`, `tts-1-hd`
- Voices: alloy, ash, coral, echo, fable, onyx, nova, sage, shimmer
- API: `POST https://api.openai.com/v1/audio/speech`
- Response: Raw audio blob (mp3)
- Error mapping: 401 → `invalid_credentials`, 429 → `rate_limit`, network → `network`

## Groq Adapter (`GroqAudioAdapter`)

- `providerId`: `'groq'`
- `playbackMode`: `'blob'`
- `supportsWordTiming`: `false`
- `supportedLanguages`: `['en']`
- API: Groq TTS endpoint
- Language guard: If `request.language` is non-null and not `'en'`/`'en-*'`, return `Err(audioError.unsupportedLanguage(language))`
- Error mapping: Same pattern as OpenAI

## Cartesia Adapter (`CartesiaAudioAdapter`)

- `providerId`: `'cartesia'`
- `playbackMode`: `'blob'`
- `supportsWordTiming`: `false`
- `supportedLanguages`: `['en']`
- API: Cartesia TTS endpoint
- Language guard: Same as Groq
- Error mapping: Same pattern as OpenAI

## Factory Updates

```typescript
// src/composition/factories.ts
export function createAudioGeneratorAdapter(
  provider: ProviderId,
  apiKey: string | null,
): IAudioGenerator {
  switch (provider) {
    case 'browser':     return new BrowserTtsAudioAdapter();
    case 'elevenlabs':  /* existing */
    case 'openai':      /* new — requires apiKey */
    case 'groq':        /* new — requires apiKey */
    case 'cartesia':    /* new — requires apiKey */
    default:            throw new Error(`Unknown audio provider: ${provider}`);
  }
}

export function getApiKeyForProvider(keys: ApiKeys, provider: ProviderId): string | null {
  switch (provider) {
    case 'elevenlabs': return keys.elevenlabs;
    case 'openai':     return keys.openai;
    case 'groq':       return keys.groq;
    case 'cartesia':   return keys.cartesia;
    default:           return null;
  }
}
```

## Contract Tests

Each adapter must pass the existing `audio-generator.contract` test suite:

1. `generateAudio()` returns `Ok(AudioResponse)` for valid input
2. `generateAudio()` returns `Err(AudioError)` for invalid credentials
3. `getVoices()` returns non-empty list
4. `validateCredentials()` returns boolean (no throw)
5. `providerId` matches expected value
6. `playbackMode` is `'blob'` for API providers
7. Language-limited providers return `Err(unsupported_language)` for unsupported languages
