# Quickstart: Server-Side TTS Centralization

**Feature**: 069-server-tts-centralization
**Branch**: `069-server-tts-centralization`

## Prerequisites

- Node.js 18+ and pnpm 8+
- PostgreSQL (via Dokku or local)
- Server environment variables: `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `GROQ_API_KEY` (at least one)

## Development Setup

```bash
# Install all workspace dependencies
pnpm install

# Start server in dev mode (needed for BYOK proxy)
pnpm --filter @proso/server dev

# Start extension in dev mode (Firefox)
pnpm --filter @proso/extension dev
```

## Implementation Order

### Phase 1: Shared Types (packages/shared)

1. Extend `TTSSynthesizeRequest` in `packages/shared/src/types/api.ts`:
   - Add optional `byokApiKey: string` field
2. Add new types:
   - `TTSTestKeyRequest`: `{ provider: string; apiKey: string }`
   - `TTSTestKeyResponse`: `{ success: boolean; provider: string; error?: string; latencyMs?: number }`
3. Export new types from `packages/shared/src/index.ts`

### Phase 2: Server Changes (packages/server)

1. **Extend port interface** (`ports/tts-provider.port.ts`):
   - Add optional `byokApiKey` to `TTSSynthesizeParams`

2. **Update provider adapters** (3 existing + 1 new):
   - `openai-tts.adapter.ts`: Check `request.byokApiKey` before `config.get('OPENAI_API_KEY')`
   - `elevenlabs-tts.adapter.ts`: Same pattern with `ELEVENLABS_API_KEY`
   - `groq-tts.adapter.ts`: Same pattern with `GROQ_API_KEY`
   - NEW `cartesia-tts.adapter.ts`: BYOK-only adapter (no server key needed)

3. **Update TTS service** (`core/tts/tts.service.ts`):
   - Add `byokApiKey` to `TTSRequest` interface
   - Skip credit deduction when `byokApiKey` is present
   - Pass `byokApiKey` through `tryProvider()` to adapter
   - Bypass tier-based routing for BYOK (use requested provider directly)

4. **Update controller** (`infrastructure/controllers/tts.controller.ts`):
   - Accept `byokApiKey` in `SynthesizeBody`
   - Allow BYOK requests without strict authentication
   - Pass to core service

5. **Add test-key endpoint** (new controller method or separate controller):
   - `POST /api/v1/tts/test-key`
   - Rate limit with `@nestjs/throttler`
   - Validate key by making minimal provider API call

6. **Register Cartesia adapter** in `tts.module.ts`

### Phase 3: Extension Changes (packages/extension)

1. **Update IApiClient port** (`ports/api-client.port.ts`):
   - Add `testApiKey(provider, apiKey)` method
   - Note: `synthesize()` signature doesn't change (type extends in shared)

2. **Update ProsoApiAdapter** (`adapters/api/proso-api.adapter.ts`):
   - Implement `testApiKey()` → POST to `/api/v1/tts/test-key`
   - `synthesize()` already passes request body through — byokApiKey will be included automatically

3. **Update NoOpApiClientAdapter** (`adapters/api/noop-api-client.adapter.ts`):
   - Add `testApiKey()` returning not_configured error

4. **Update ServerTtsAudioAdapter** (`adapters/audio/server-tts-audio.adapter.ts`):
   - Accept optional `byokApiKey` in constructor or pass from settings
   - Include in the `TTSSynthesizeRequest` sent to `IApiClient.synthesize()`

5. **Simplify factory** (`composition/factories.ts`):
   - Remove `createDirectProviderAdapter()` function
   - Remove direct adapter imports (ElevenLabs, OpenAI, Groq, Cartesia)
   - Update `createAudioGeneratorAdapter()`: non-browser → `ServerTtsAudioAdapter`
   - Repurpose `getApiKeyForProvider()` for BYOK forwarding

6. **Delete direct adapter files** (4 files):
   - `adapters/audio/elevenlabs-audio.adapter.ts`
   - `adapters/audio/openai-audio.adapter.ts`
   - `adapters/audio/groq-audio.adapter.ts`
   - `adapters/audio/cartesia-audio.adapter.ts`

7. **Update barrel export** (`adapters/audio/index.ts`):
   - Remove deleted adapter exports

8. **Update settings.testApiKey handler** (`handlers/settings.handlers.ts`):
   - TTS providers → route through `IApiClient.testApiKey()`
   - Anthropic → keep direct fetch (not a TTS provider)

### Phase 4: Cleanup & Docs

1. Update INV-002 in `packages/shared/src/constants/invariants.ts`
2. Delete obsolete extension adapter test files
3. Add new server BYOK test files
4. Run full test suite: `pnpm --filter @proso/extension test:unit && pnpm --filter @proso/server test`

## Verification Commands

```bash
# Build shared types (must succeed first)
pnpm --filter @proso/shared build

# Run server tests
pnpm --filter @proso/server test

# Run extension tests
pnpm --filter @proso/extension test:unit

# Build extension for production
pnpm --filter @proso/extension build:firefox

# Verify no direct provider adapter files remain
ls packages/extension/src/adapters/audio/*-audio.adapter.ts
# Should only show: browser-tts-audio.adapter.ts, server-tts-audio.adapter.ts

# Verify no direct provider API calls in extension build
grep -r "api.openai.com\|api.elevenlabs.io\|api.groq.com\|api.cartesia.ai" \
  packages/extension/.output/firefox-mv2/ || echo "PASS: No direct provider calls"
```

## Key Files Quick Reference

| File | Package | Change |
|------|---------|--------|
| `src/types/api.ts` | shared | Extend TTSSynthesizeRequest |
| `src/constants/invariants.ts` | shared | Update INV-002 |
| `src/ports/tts-provider.port.ts` | server | Extend TTSSynthesizeParams |
| `src/core/tts/tts.service.ts` | server | BYOK credit bypass, key forwarding |
| `src/infrastructure/controllers/tts.controller.ts` | server | Accept byokApiKey, test-key endpoint |
| `src/adapters/tts/*.adapter.ts` | server | Check byokApiKey before config key |
| `src/infrastructure/modules/tts.module.ts` | server | Register Cartesia adapter |
| `src/ports/api-client.port.ts` | extension | Add testApiKey method |
| `src/adapters/api/proso-api.adapter.ts` | extension | Implement testApiKey |
| `src/adapters/audio/server-tts-audio.adapter.ts` | extension | Forward BYOK key |
| `src/composition/factories.ts` | extension | Remove direct adapter path |
| `src/handlers/settings.handlers.ts` | extension | Route testApiKey via server |
| `src/adapters/audio/index.ts` | extension | Remove deleted exports |
