# Quickstart: Extension Quality Sprint

**Feature**: 063-extension-quality-sprint
**Branch**: `063-extension-quality-sprint`

## Prerequisites

- Node.js 20+, pnpm 9+
- Firefox Nightly (for E2E testing): `/run/current-system/sw/bin/firefox-nightly`
- Valid API keys for testing providers (OpenAI, ElevenLabs, Groq, Cartesia)

## Setup

```bash
git checkout 063-extension-quality-sprint
pnpm install
pnpm run build:firefox
```

## Development Workflow

```bash
# Run tests (2,405+ existing)
pnpm test

# Run tests with coverage
pnpm run test:coverage

# Lint with Biome
pnpm run lint

# Quality check (deps, duplication, manifest)
pnpm run quality

# Dev server with HMR
pnpm run dev:firefox
```

## Implementation Order

### Phase 1: Message Validation & Error Handling (P1)
1. Add Zod schemas to handler params (all 15+ handler files)
2. Add response validation in popup `sendMessage()`
3. Add structured error responses to all handlers
4. Add export timeout (10 min)
5. Remove API key metadata logging

### Phase 2: TTS Provider Expansion (P2)
1. Expand `ProviderId` type to include openai, groq, cartesia
2. Expand `PROVIDERS` const and schema
3. Create `OpenAiAudioAdapter` implementing `IAudioGenerator`
4. Create `GroqAudioAdapter` implementing `IAudioGenerator`
5. Create `CartesiaAudioAdapter` implementing `IAudioGenerator`
6. Update factory switch and `getApiKeyForProvider()`
7. Update `ApiKeys` type with new provider fields

### Phase 3: Accessibility (P2)
1. Add `prefers-reduced-motion` to popup and options CSS
2. Add `aria-live` regions for dynamic content
3. Audit keyboard shortcuts for modifier keys
4. Audit touch targets for 44x44px minimum

### Phase 4: Test Coverage & Quality Gates (P3)
1. Raise jest coverage thresholds (60/50/60/60)
2. Enable Biome rules (noUnusedVariables, noExplicitAny) at warn
3. Fix all new warnings
4. Add dispatch integration tests
5. Add popup-background round-trip integration tests

### Phase 5: Architecture Cleanup (P3)
1. Consolidate straggling handlers into `src/handlers/`
2. Standardize message names to dot-notation
3. Add bridge mappings for legacy names
4. Extract language detection to dedicated module
5. Remove dead code (TODOs in content.ts)

## Key Files to Modify

| File | Changes |
|------|---------|
| `src/core/shared/errors.ts` | Expand `ProviderId` |
| `src/utils/config/schema.ts` | Expand `PROVIDERS` |
| `src/composition/factories.ts` | Add factory cases for 3 providers |
| `src/composition/types.ts` | Expand `ApiKeys` |
| `src/adapters/audio/` | 3 new adapter files |
| `src/handlers/*.handlers.ts` | Add Zod validation to all handlers |
| `src/entrypoints/popup/main.ts` | Response validation |
| `src/entrypoints/background.ts` | Legacy bridge mapping |
| `src/entrypoints/content.ts` | Dead code removal, message naming |
| `jest.config.js` | Coverage thresholds |
| `biome.json` | Enable linting rules |
| Popup/Options CSS | Accessibility improvements |

## Verification

```bash
# All tests pass
pnpm test

# Coverage meets thresholds
pnpm run test:coverage

# Lint passes (with new rules enabled)
pnpm run lint

# Build succeeds
pnpm run build:firefox

# Quality check passes
pnpm run quality
```
