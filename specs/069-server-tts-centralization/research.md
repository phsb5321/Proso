# Research: Server-Side TTS Centralization

**Feature**: 069-server-tts-centralization
**Date**: 2026-03-01

## R-01: Server Adapter API Key Injection Pattern

**Decision**: Pass BYOK keys through `TTSSynthesizeParams` — adapters already fetch keys at call time.

**Rationale**: All three server TTS adapters (OpenAI, ElevenLabs, Groq) follow the same pattern: they read the API key from `ConfigService` at the start of each `synthesize()` call, not at construction time. This means we can extend `TTSSynthesizeParams` with an optional `userProvidedApiKey` field, and each adapter checks for it before falling back to `config.get()`.

**Evidence**:
- `openai-tts.adapter.ts:40`: `const apiKey = this.config.get<string>('OPENAI_API_KEY');`
- `elevenlabs-tts.adapter.ts:53`: `const apiKey = this.config.get<string>('ELEVENLABS_API_KEY');`
- `groq-tts.adapter.ts` (same pattern): `const apiKey = this.config.get<string>('GROQ_API_KEY');`

**Alternatives considered**:
- Creating temporary adapter instances per BYOK request — rejected because it adds DI complexity and the current adapters are stateless at call time.
- A separate "BYOK adapter" class — rejected because it would duplicate all provider logic.

## R-02: Cartesia Server Adapter Gap

**Decision**: Add a minimal Cartesia server adapter to support BYOK Cartesia users.

**Rationale**: The extension has a `CartesiaAudioAdapter` for direct BYOK calls, but the server has no Cartesia adapter. Since we're removing all client-side direct adapters, BYOK Cartesia users would lose access unless we add a server adapter. The adapter only needs to support BYOK (no server-side API key required), so it can be registered in the TTS_PROVIDERS map without a ConfigService key check.

**Alternatives considered**:
- Returning a "provider not supported" error for Cartesia — rejected because it breaks INV-002 (BYOK always available on all tiers).
- Keeping the Cartesia adapter client-side only — rejected because it contradicts the centralization goal.

## R-03: BYOK Authentication & Free Tier Access

**Decision**: Allow BYOK synthesis without a license key (or with a free-tier license).

**Rationale**: INV-002 states "BYOK always available on all tiers," including free tier. The current server requires authentication via `userId` (line 64 of tts.controller.ts), and unauthenticated requests return 401. For BYOK, we need a separate code path: if `byokApiKey` is present in the request body, the server should allow the request even without a valid subscription. The user pays the provider directly via their own key.

**Current behavior**: `tts.controller.ts:64-71` returns 401 if `userId` is missing. The `LicenseKeyGuard` extracts userId from the license key.

**Implementation approach**: When `byokApiKey` is present:
1. License key may still be sent (for tracking/analytics) but is not required
2. Skip subscription tier lookup (BYOK doesn't depend on tier)
3. Skip credit deduction entirely
4. Proceed directly to cache check → provider synthesis

## R-04: Cache Key Strategy for BYOK

**Decision**: Use the same cache key format for both BYOK and managed-credit requests.

**Rationale**: The cache key is `tts:{provider}:{voice}:{language}:{textHash}`. The audio output is identical regardless of whether the server's key or a BYOK key was used — same provider, same voice, same text produces the same audio. Sharing the cache between BYOK and managed-credit requests actually benefits both:
- A BYOK request caches audio that a managed-credit user can later retrieve without paying credits (INV-006).
- A managed-credit-cached audio can be served to a BYOK user without calling the provider again.

**Alternatives considered**:
- Separate cache keys with `:byok` suffix — rejected because it wastes storage and the audio output is identical.
- No caching for BYOK — rejected because it violates INV-006 and wastes provider API calls.

## R-05: Extension Bundle Impact

**Decision**: No provider SDK dependencies to remove; bundle savings come from code deletion only.

**Rationale**: The extension's `package.json` has zero provider-specific SDK dependencies. All four direct adapters use native `fetch()` API. Removing the four adapter files (~1,200 LOC total) will reduce bundle size modestly but won't eliminate any npm dependencies.

**Evidence**: `packages/extension/package.json` dependencies: `@proso/shared`, `@webext-core/messaging`, `dexie`, `franc-min`, `lamejs`, `zod` — none are provider SDKs.

## R-06: Provider Router Bypass for BYOK

**Decision**: BYOK requests bypass the tier-based provider router and go directly to the requested provider.

**Rationale**: The current `selectProvider()` function routes based on subscription tier (Free → Browser, Pro → Groq-first, Enterprise → ElevenLabs-first). For BYOK, the user explicitly chooses their provider and pays for it, so tier-based routing doesn't apply. The BYOK path should: (1) use the requested provider directly, (2) not fall back to other providers (the user's key only works with one provider), (3) not route Free tier to Browser (the user has their own premium key).

## R-07: Test Impact Analysis

**Decision**: Delete 5 extension adapter test files (~2,100 LOC), modify 4 test files, add ~5 new server test files.

**Rationale**:
- **Delete**: `openai-audio.adapter.test.ts` (471 LOC), `groq-audio.adapter.test.ts` (568 LOC), `cartesia-audio.adapter.test.ts` (608 LOC), `elevenlabs-api.test.ts` (438 LOC contract test for direct adapter) — these test direct client-side adapters being removed.
- **Modify**: `factories.test.ts` (remove direct adapter branches), `settings.handlers.test.ts` (update testApiKey handler tests), `browser-tts-audio.adapter.test.ts` (keep — tests Browser TTS which stays).
- **Add**: Server-side BYOK synthesis tests, BYOK key validation endpoint tests, BYOK cache behavior tests, updated IApiClient contract tests, Cartesia server adapter tests.

**Net test count**: Current 3,237 total. Removing ~5 test files (~50 test cases) and adding ~5 test files (~60+ test cases) → net gain.

## R-08: Rate Limiting Strategy for Key Validation

**Decision**: Use `@nestjs/throttler` with a per-IP limit of 5 requests per minute for the test-key endpoint.

**Rationale**: The test-key endpoint accepts arbitrary API keys and makes external API calls. Without rate limiting, an attacker could probe key validity or cause excessive provider API usage. The server already depends on `@nestjs/throttler` (from 064-monorepo-nestjs-dokku). A per-IP limit is appropriate since unauthenticated users (free tier with BYOK) may not have a license key.

## R-09: Settings UI Impact

**Decision**: Minimal UI changes — keep API key input fields, change test handler implementation only.

**Rationale**: The extension's settings page has API key input fields and "Test" buttons that call `settings.testApiKey` message. The message signature (`{ provider, apiKey }` → `{ success, error, latencyMs }`) matches the new server endpoint's request/response format almost exactly. The handler implementation changes from direct `fetch()` to calling `IApiClient.testApiKey()`, but the UI code doesn't need to change.

**Current flow**: Options UI → `api-key-tester.ts` → `sendMessage('settings.testApiKey')` → background handler → direct fetch to provider.
**New flow**: Options UI → `api-key-tester.ts` → `sendMessage('settings.testApiKey')` → background handler → `IApiClient.testApiKey()` → server `/api/v1/tts/test-key`.

The `api-key-tester.ts` utility and options page UI remain unchanged.
