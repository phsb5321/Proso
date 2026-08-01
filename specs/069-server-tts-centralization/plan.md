# Implementation Plan: Server-Side TTS Centralization

**Branch**: `069-server-tts-centralization` | **Date**: 2026-03-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/069-server-tts-centralization/spec.md`

## Summary

Eliminate direct client-side TTS provider API calls from the Proso browser extension and route all premium TTS synthesis through the Proso server. The extension becomes a thin playback client that sends text and receives audio. BYOK (Bring Your Own Key) is preserved by forwarding user-provided API keys to the server per-request without persistence. Browser TTS remains fully client-side and unlimited (INV-005).

The server already has TTS provider adapters (OpenAI, ElevenLabs, Groq) and a working synthesis endpoint. The primary work is: (1) extending the server to accept BYOK keys and adding a key validation endpoint, (2) simplifying the extension factory and deleting four direct provider adapters, (3) updating the shared types to include the BYOK field.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode) for all three packages
**Primary Dependencies**:
- Extension: WXT 0.20.13, @webext-core/messaging 2.3.0, Zod 3.23.8, Dexie 4.2.1
- Server: NestJS 10+, Prisma, @nestjs/throttler, pino
- Shared: Zero dependencies (pure types + utilities)
**Storage**: PostgreSQL (server), IndexedDB (extension audio cache), browser.storage.local (extension settings)
**Testing**: Jest (extension: 2,907 tests, server: 330 tests)
**Target Platform**: Firefox 112+ / Chrome 88+ (extension), Linux server (NestJS on Dokku)
**Project Type**: pnpm monorepo (packages/extension, packages/server, packages/shared)
**Performance Goals**: Server-proxied BYOK adds <200ms latency vs previous direct calls
**Constraints**: Zero BYOK key persistence on server, INV-005 inviolable, hexagonal architecture
**Scale/Scope**: ~20 files modified, ~4 files deleted, ~5 new files, 3 packages affected

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Cross-Browser with MV3 Priority | PASS | Changes are in adapter/service layer, not browser APIs. ServerTtsAudioAdapter uses standard fetch(). BrowserTtsAudioAdapter unchanged. |
| II. Privacy by Design | PASS | BYOK keys transmitted over HTTPS only. Server MUST NOT log/persist keys. Keys in browser-encrypted storage. No raw content logging. |
| III. Hexagonal Architecture | PASS | All changes follow ports & adapters. New server endpoint uses existing TTSProviderPort. Extension changes are in adapters/composition/handlers layers. |
| IV. Test Coverage | PASS | Deleting 5 test files (~2,100 LOC) for removed adapters. Adding ~5 new test files for BYOK server flow. Net test count maintained. Contract tests for new IApiClient methods. |
| V. Observability | PASS | Server logs synthesis requests (excluding BYOK key content). Provider errors already logged. Test-key endpoint will log success/failure (not the key). |
| VI. Simplicity | PASS | Net reduction in complexity: removing 4 adapter files and a factory branch. Server changes are minimal extensions to existing patterns. |

**Post-Phase 1 Re-check**: All gates continue to pass. The BYOK key forwarding adds a single optional field to existing interfaces — no new abstractions, no new patterns.

## Project Structure

### Documentation (this feature)

```text
specs/069-server-tts-centralization/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 research findings
├── data-model.md        # Entity definitions and relationships
├── quickstart.md        # Implementation quick reference
├── contracts/           # API contracts
│   ├── tts-synthesize-v2.yaml    # Updated synthesize + new test-key endpoint
│   └── extension-messages.yaml   # Message protocol changes
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
packages/
├── shared/src/
│   ├── types/api.ts                    # MODIFY: extend TTSSynthesizeRequest, add test-key types
│   ├── constants/invariants.ts         # MODIFY: update INV-002 enforcement text
│   └── index.ts                        # MODIFY: export new types
│
├── server/src/
│   ├── ports/
│   │   └── tts-provider.port.ts        # MODIFY: add byokApiKey to TTSSynthesizeParams
│   ├── core/
│   │   ├── tts/tts.service.ts          # MODIFY: BYOK key forwarding, credit bypass
│   │   └── routing/provider-router.ts  # READ ONLY: understand routing (no changes needed)
│   ├── adapters/tts/
│   │   ├── openai-tts.adapter.ts       # MODIFY: check byokApiKey before config key
│   │   ├── elevenlabs-tts.adapter.ts   # MODIFY: check byokApiKey before config key
│   │   ├── groq-tts.adapter.ts         # MODIFY: check byokApiKey before config key
│   │   └── cartesia-tts.adapter.ts     # CREATE: BYOK-only Cartesia adapter
│   └── infrastructure/
│       ├── controllers/tts.controller.ts  # MODIFY: accept byokApiKey, add test-key endpoint
│       └── modules/tts.module.ts          # MODIFY: register Cartesia adapter
│
├── extension/src/
│   ├── ports/
│   │   └── api-client.port.ts          # MODIFY: add testApiKey method
│   ├── adapters/
│   │   ├── api/
│   │   │   ├── proso-api.adapter.ts    # MODIFY: implement testApiKey
│   │   │   └── noop-api-client.adapter.ts  # MODIFY: add testApiKey stub
│   │   └── audio/
│   │       ├── index.ts                # MODIFY: remove deleted adapter exports
│   │       ├── server-tts-audio.adapter.ts  # MODIFY: forward BYOK key
│   │       ├── browser-tts-audio.adapter.ts # UNCHANGED
│   │       ├── elevenlabs-audio.adapter.ts  # DELETE
│   │       ├── openai-audio.adapter.ts      # DELETE
│   │       ├── groq-audio.adapter.ts        # DELETE
│   │       └── cartesia-audio.adapter.ts    # DELETE
│   ├── composition/
│   │   └── factories.ts                # MODIFY: remove direct adapter path
│   └── handlers/
│       └── settings.handlers.ts        # MODIFY: route testApiKey via server
│
└── extension/tests/
    ├── unit/adapters/audio/
    │   ├── openai-audio.adapter.test.ts    # DELETE
    │   ├── groq-audio.adapter.test.ts      # DELETE
    │   └── cartesia-audio.adapter.test.ts  # DELETE
    ├── unit/composition/
    │   └── factories.test.ts               # MODIFY: update for simplified factory
    ├── unit/handlers/
    │   └── settings.handlers.test.ts       # MODIFY: update testApiKey tests
    └── contract/
        └── elevenlabs-api.test.ts          # DELETE
```

**Structure Decision**: Existing pnpm monorepo structure with three packages. No new packages or directories needed. Changes are surgical modifications to existing files plus 4 deletions and 1 new server adapter file.

## Complexity Tracking

No constitution violations to justify. All changes follow existing patterns.

## Phase 1: Shared Types & Server BYOK Support

### Step 1.1: Extend Shared Types

**Files**: `packages/shared/src/types/api.ts`, `packages/shared/src/index.ts`

- Add optional `byokApiKey?: string` to `TTSSynthesizeRequest`
- Add `TTSTestKeyRequest` interface: `{ provider: string; apiKey: string }`
- Add `TTSTestKeyResponse` interface: `{ success: boolean; provider: string; error?: string; latencyMs?: number }`
- Export new types from barrel

**Validation**: `pnpm --filter @proso/shared build` succeeds

### Step 1.2: Update INV-002

**File**: `packages/shared/src/constants/invariants.ts`

- Change INV-002 enforcement from `'TTS proxy only used for managed credits; BYOK goes direct from extension'` to `'BYOK keys forwarded to server for single-request use; never persisted server-side'`

### Step 1.3: Extend Server Port Interface

**File**: `packages/server/src/ports/tts-provider.port.ts`

- Add optional `byokApiKey?: string` to `TTSSynthesizeParams` interface

### Step 1.4: Update Server Provider Adapters (3 existing)

**Files**: `openai-tts.adapter.ts`, `elevenlabs-tts.adapter.ts`, `groq-tts.adapter.ts`

Each adapter's `synthesize()` method changes from:
```typescript
const apiKey = this.config.get<string>('OPENAI_API_KEY');
```
To:
```typescript
const apiKey = request.byokApiKey || this.config.get<string>('OPENAI_API_KEY');
```

**Critical**: When `byokApiKey` is used, the adapter MUST NOT log the key value. Only log that a BYOK key was used (boolean flag).

### Step 1.5: Create Cartesia Server Adapter

**File**: `packages/server/src/adapters/tts/cartesia-tts.adapter.ts` (NEW)

- Implements `TTSProviderPort` for Cartesia API
- BYOK-only: `synthesize()` requires `byokApiKey` (no server config key)
- Register in `tts.module.ts` TTS_PROVIDERS map (always registered, but only usable with BYOK key)

### Step 1.6: Update TTS Service for BYOK

**File**: `packages/server/src/core/tts/tts.service.ts`

- Add `byokApiKey?: string` to `TTSRequest` interface
- When `byokApiKey` is present:
  1. Skip `selectProvider()` — use requested provider directly
  2. Check cache (INV-006 still applies)
  3. Skip `deductCredits()` — user pays via own key
  4. Pass `byokApiKey` through `tryProvider()` to adapter
  5. Do NOT use fallback chain (BYOK key is provider-specific)
- When `byokApiKey` is absent: existing flow unchanged

### Step 1.7: Update TTS Controller

**File**: `packages/server/src/infrastructure/controllers/tts.controller.ts`

- Add `byokApiKey?: string` to `SynthesizeBody` interface
- When `byokApiKey` is present, allow request without strict userId authentication (BYOK doesn't require subscription)
- Pass `byokApiKey` to core service

### Step 1.8: Add Test-Key Endpoint

**File**: `packages/server/src/infrastructure/controllers/tts.controller.ts` (or new controller)

- `POST /api/v1/tts/test-key`
- Apply `@Throttle({ default: { ttl: 60000, limit: 5 } })` for rate limiting
- Accept `{ provider: string, apiKey: string }`
- For each provider, make a minimal validation API call:
  - OpenAI: GET models list with Bearer auth
  - ElevenLabs: GET /v1/user with xi-api-key header
  - Groq: GET models list with Bearer auth
  - Cartesia: GET /voices with X-API-Key header
- Return `{ success, provider, error?, latencyMs? }`
- MUST NOT log the apiKey value

### Step 1.9: Register Cartesia in TTS Module

**File**: `packages/server/src/infrastructure/modules/tts.module.ts`

- Import and register `CartesiaTTSAdapter`
- Add to TTS_PROVIDERS factory (always registered for BYOK; no config key check needed)

### Step 1.10: Server Tests

**New files**:
- `test/core/tts/tts-service-byok.spec.ts` — BYOK synthesis flow, credit bypass, cache behavior
- `test/infrastructure/controllers/tts-test-key.spec.ts` — Test-key endpoint, rate limiting, validation
- `test/adapters/tts/cartesia-tts.adapter.spec.ts` — Cartesia adapter contract tests

**Validation**: `pnpm --filter @proso/server test` — all tests pass

## Phase 2: Extension Client Simplification

### Step 2.1: Update IApiClient Port

**File**: `packages/extension/src/ports/api-client.port.ts`

- Add `testApiKey(provider: string, apiKey: string): Promise<Result<TTSTestKeyResponse, ApiClientError>>`
- Update JSDoc on `synthesize()` to note BYOK key support via `TTSSynthesizeRequest.byokApiKey`

### Step 2.2: Update ProsoApiAdapter

**File**: `packages/extension/src/adapters/api/proso-api.adapter.ts`

- Implement `testApiKey()`: POST to `/api/v1/tts/test-key` with `{ provider, apiKey }`
- Note: `synthesize()` already passes the full `TTSSynthesizeRequest` to the server; the new `byokApiKey` field is included automatically since it's part of the type

### Step 2.3: Update NoOpApiClientAdapter

**File**: `packages/extension/src/adapters/api/noop-api-client.adapter.ts`

- Add `testApiKey()` returning `Err(NOT_CONFIGURED)`

### Step 2.4: Update ServerTtsAudioAdapter

**File**: `packages/extension/src/adapters/audio/server-tts-audio.adapter.ts`

- Accept optional `byokApiKey` parameter (via constructor or method parameter)
- Include in the `TTSSynthesizeRequest` passed to `IApiClient.synthesize()`

### Step 2.5: Simplify Factory

**File**: `packages/extension/src/composition/factories.ts`

- Remove `createDirectProviderAdapter()` function entirely
- Remove imports of `ElevenLabsAudioAdapter`, `OpenAiAudioAdapter`, `GroqAudioAdapter`, `CartesiaAudioAdapter`
- Update `createAudioGeneratorAdapter()`:
  - `browser` → `BrowserTtsAudioAdapter` (unchanged)
  - Everything else → `ServerTtsAudioAdapter(apiClient, provider, apiKey)` where apiKey becomes byokApiKey
- Keep `getApiKeyForProvider()` (repurposed for BYOK forwarding to server)

### Step 2.6: Delete Direct Provider Adapters

**Files to delete** (4 files):
- `packages/extension/src/adapters/audio/elevenlabs-audio.adapter.ts`
- `packages/extension/src/adapters/audio/openai-audio.adapter.ts`
- `packages/extension/src/adapters/audio/groq-audio.adapter.ts`
- `packages/extension/src/adapters/audio/cartesia-audio.adapter.ts`

### Step 2.7: Update Barrel Export

**File**: `packages/extension/src/adapters/audio/index.ts`

- Remove exports for the four deleted adapter classes

### Step 2.8: Update Settings Test Handler

**File**: `packages/extension/src/handlers/settings.handlers.ts`

- TTS providers (elevenlabs, openai, groq, cartesia): Route through `IApiClient.testApiKey()`
- Anthropic (AI summarization): Keep direct fetch (not a TTS provider, unchanged)
- Remove `API_TEST_ENDPOINTS` for TTS providers (keep anthropic entry)

### Step 2.9: Update/Delete Extension Tests

**Delete** (4 files):
- `tests/unit/adapters/audio/openai-audio.adapter.test.ts`
- `tests/unit/adapters/audio/groq-audio.adapter.test.ts`
- `tests/unit/adapters/audio/cartesia-audio.adapter.test.ts`
- `tests/contract/elevenlabs-api.test.ts`

**Modify** (2 files):
- `tests/unit/composition/factories.test.ts` — Remove direct adapter expectations; test simplified two-path factory
- `tests/unit/handlers/settings.handlers.test.ts` — Update testApiKey tests to mock IApiClient.testApiKey()

**Add** (2 files):
- `tests/unit/adapters/api/proso-api-testkey.test.ts` — Test ProsoApiAdapter.testApiKey()
- `tests/unit/adapters/audio/server-tts-byok.test.ts` — Test ServerTtsAudioAdapter BYOK forwarding

**Validation**: `pnpm --filter @proso/extension test:unit` — all tests pass

## Phase 3: Verification & Cleanup

### Step 3.1: Full Test Suite

```bash
pnpm --filter @proso/shared build
pnpm --filter @proso/server test
pnpm --filter @proso/extension test:unit
```

All must pass. Total test count >= current baseline (3,237).

### Step 3.2: Build Verification

```bash
pnpm --filter @proso/extension build:firefox
```

Verify:
- No direct provider API URLs in build output
- No deleted adapter code in build output
- Browser TTS adapter still present

### Step 3.3: Manual Smoke Test

1. Start server with at least one provider key configured
2. Load extension in Firefox
3. Test managed-credit playback (requires license key + credits)
4. Test BYOK playback (enter API key in settings, play article)
5. Test Browser TTS (select Browser, play article — works offline)
6. Test key validation (enter key in settings, click Test)

## Dependency Graph

```
Step 1.1 (Shared Types)
  │
  ├──► Step 1.2 (INV-002)
  │
  ├──► Step 1.3 (Server Port)
  │     │
  │     ├──► Step 1.4 (Update 3 Adapters)
  │     │
  │     ├──► Step 1.5 (Cartesia Adapter)
  │     │     │
  │     │     └──► Step 1.9 (Register Cartesia)
  │     │
  │     ├──► Step 1.6 (TTS Service)
  │     │     │
  │     │     └──► Step 1.7 (Controller)
  │     │           │
  │     │           └──► Step 1.8 (Test-Key Endpoint)
  │     │
  │     └──► Step 1.10 (Server Tests)
  │
  └──► Step 2.1 (IApiClient Port)
        │
        ├──► Step 2.2 (ProsoApiAdapter)
        │
        ├──► Step 2.3 (NoOpAdapter)
        │
        ├──► Step 2.4 (ServerTtsAudioAdapter)
        │     │
        │     └──► Step 2.5 (Simplify Factory)
        │           │
        │           ├──► Step 2.6 (Delete Adapters)
        │           │     │
        │           │     └──► Step 2.7 (Barrel Export)
        │           │
        │           └──► Step 2.8 (Settings Handler)
        │
        └──► Step 2.9 (Tests)
              │
              └──► Step 3.1 (Full Test Suite)
                    │
                    ├──► Step 3.2 (Build Verification)
                    │
                    └──► Step 3.3 (Smoke Test)
```

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| BYOK key accidentally logged server-side | High (security) | Code review: grep for log statements near apiKey variables. Test: verify logs contain no key values. |
| Extension regression from adapter deletion | Medium | Run full test suite. Manual smoke test all providers. |
| Cartesia adapter bugs (new code) | Low | Contract tests. BYOK-only, so limited blast radius. |
| Latency increase for BYOK users | Medium | Benchmark: measure BYOK synthesis time before/after. Target: <200ms additional. |
| Free-tier BYOK users blocked by auth | High (INV-002) | Test: BYOK request with no license key must succeed. |
