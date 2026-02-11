# Tasks: VoxPage Monorepo + NestJS Server + Dokku Deployment

**Input**: Design documents from `/specs/064-monorepo-nestjs-dokku/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-v1.yaml, quickstart.md

**Tests**: Server unit tests (200+) are part of the spec success criteria (SC-007). Test tasks are included for server domain logic. Extension tests (2,881+) are regression-only — no new extension test tasks.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Root**: `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `.npmrc`
- **Extension**: `packages/extension/` (existing code, moved via `git mv`)
- **Server**: `packages/server/` (new NestJS backend)
- **Shared**: `packages/shared/` (new shared types package)

---

## Phase 1: Setup (Workspace Scaffolding)

**Purpose**: Convert single-package project into pnpm workspace monorepo. No behavior changes.

- [X] T001 Create `pnpm-workspace.yaml` at repo root with `packages: ["packages/*"]`
- [X] T002 Create `tsconfig.base.json` at repo root with shared strict-mode compiler options from plan.md
- [X] T003 Update `.npmrc` to replace `shamefully-hoist=true` with `public-hoist-pattern[]=@nestjs/*` per research.md §3.3
- [X] T004 Create `packages/` directory and `packages/shared/package.json` for `@voxpage/shared` (private, no build step, `main`/`types` point to `./src/index.ts`)
- [X] T005 Create `packages/shared/tsconfig.json` extending `../../tsconfig.base.json`
- [X] T006 Move extension code via `git mv`: `src/` → `packages/extension/src/`, `tests/` → `packages/extension/tests/`, `public/` → `packages/extension/public/`, `wxt.config.ts`, `jest.config.js`, `tsconfig.json` → `packages/extension/`
- [X] T007 Create `packages/extension/package.json` for `@voxpage/extension` with existing dependencies moved from root, add `"@voxpage/shared": "workspace:*"` dependency
- [X] T008 Update root `package.json` to workspace root (remove extension-specific deps, keep shared devDeps like `typescript`, `@biomejs/biome`)
- [X] T009 Update `packages/extension/tsconfig.json` to extend `../../tsconfig.base.json` and add path references for `@voxpage/shared`
- [X] T010 Update `packages/extension/wxt.config.ts` with alias for `@voxpage/shared` pointing to `../../packages/shared/src`
- [X] T011 Update `packages/extension/jest.config.js` paths and moduleNameMapper for new monorepo location
- [X] T012 Move `wxt prepare` postinstall script from root to `packages/extension/package.json`
- [X] T013 Update `biome.json` at root for monorepo; create `packages/extension/biome.json` with `"extends": ["../../biome.json"]` and browser globals
- [X] T014 Run `pnpm install` from root to validate workspace resolution and fix any dependency issues
- [X] T015 Run extension test suite from `packages/extension/` and verify all 2,881+ tests pass
- [X] T016 Run `pnpm --filter @voxpage/extension build:firefox` and verify build succeeds under 1.1 MB

**Checkpoint**: Monorepo structure working, extension unchanged. All existing tests pass from new location.

---

## Phase 2: Foundational (Server Skeleton + Shared Package)

**Purpose**: Minimal NestJS server that boots, passes health checks, and produces structured logs. Shared package with domain types. BLOCKS all server user stories.

**⚠️ CRITICAL**: No server user story work can begin until this phase is complete.

### Shared Package Core

- [X] T017 [P] Implement `Result<T,E>` type with `Ok()`, `Err()`, `isOk()`, `isErr()`, `unwrap()`, `map()`, `andThen()` helpers in `packages/shared/src/result.ts`
- [X] T018 [P] Define `SubscriptionTier` and `SubscriptionStatus` enums in `packages/shared/src/domain/subscription.ts`
- [X] T019 [P] Define `TTSProvider` enum and `ProviderCost` type in `packages/shared/src/domain/provider.ts`
- [X] T020 [P] Define `CreditAllocation` and `CreditTransaction` interfaces in `packages/shared/src/domain/credits.ts`
- [X] T021 [P] Define `LicenseKey` types in `packages/shared/src/domain/license.ts`
- [X] T022 [P] Implement `TIER_CREDITS` and `FEATURE_MATRIX` constants in `packages/shared/src/constants/tiers.ts`
- [X] T023 [P] Implement `PROVIDER_COSTS` constants in `packages/shared/src/constants/providers.ts`
- [X] T024 [P] Implement business invariant constants (INV-001 through INV-006) in `packages/shared/src/constants/invariants.ts`
- [X] T025 [P] Define API request/response types matching `contracts/api-v1.yaml` schemas in `packages/shared/src/types/api.ts`
- [X] T026 [P] Define shared error types in `packages/shared/src/types/errors.ts`
- [X] T027 Create barrel export `packages/shared/src/index.ts` re-exporting all domain types, constants, and the Result type

### Server Scaffold

- [X] T028 Create `packages/server/package.json` for `@voxpage/server` with NestJS 10+, Prisma, nestjs-pino, @nestjs/terminus, @nestjs/throttler dependencies and `"@voxpage/shared": "workspace:*"`
- [X] T029 Create `packages/server/tsconfig.json` extending `../../tsconfig.base.json` with `emitDecoratorMetadata: true` and `experimentalDecorators: true`
- [X] T030 Create `packages/server/nest-cli.json` with `sourceRoot: "src"` and `compilerOptions`
- [X] T031 Create `packages/server/biome.json` with `"extends": ["../../biome.json"]`
- [X] T032 Implement `packages/server/src/main.ts` with NestJS bootstrap: `rawBody: true`, `bufferLogs: true`, `trust proxy`, port from env, Pino logger
- [X] T033 Implement `packages/server/src/app.module.ts` root module importing HealthModule and LoggingModule
- [X] T034 [P] Implement `packages/server/src/infrastructure/config/app.config.ts` with `@nestjs/config` reading env vars (PORT, NODE_ENV, DATABASE_URL, REDIS_URL, JWT_SECRET, etc.)
- [X] T035 [P] Implement `packages/server/src/infrastructure/modules/logging.module.ts` with nestjs-pino + pino-loki transport, health endpoint excluded
- [X] T036 [P] Implement `packages/server/src/infrastructure/modules/health.module.ts` with @nestjs/terminus
- [X] T037 [P] Implement `packages/server/src/infrastructure/controllers/health.controller.ts` with `GET /health` returning status, version, uptime, and component health (database, memory)
- [X] T038 [P] Implement custom `packages/server/src/infrastructure/health/prisma.health.ts` PrismaHealthIndicator
- [X] T039 Implement `packages/server/src/ports/logger.port.ts` abstract class with info/warn/error/debug methods
- [X] T040 Implement `packages/server/src/adapters/logging/pino-logger.adapter.ts` implementing LoggerPort via nestjs-pino

### Database & Prisma

- [X] T041 Write `packages/server/prisma/schema.prisma` with all 7 models (User, Subscription, CreditAllocation, CreditTransaction, TTSRequest, RoutingDecision, LicenseKey) and 4 enums per data-model.md
- [X] T042 Create `packages/server/src/infrastructure/modules/prisma.module.ts` with PrismaService (global, onModuleInit connect, onModuleDestroy disconnect)
- [X] T043 Add Prisma scripts to `packages/server/package.json`: `prisma:generate`, `prisma:migrate:dev`, `prisma:migrate:deploy`

### Auth Infrastructure

- [X] T044 Implement `packages/server/src/infrastructure/guards/license-key.guard.ts` extracting `X-License-Key` header, with `@Public()` decorator for unprotected routes
- [X] T045 Implement `packages/server/src/infrastructure/modules/auth.module.ts` registering LicenseKeyGuard as global APP_GUARD

### Rate Limiting

- [X] T046 Implement `packages/server/src/infrastructure/modules/rate-limit.module.ts` with @nestjs/throttler (short: 3/s, medium: 20/10s, long: 100/min) and Redis storage

### Deployment Artifacts

- [X] T047 [P] Create `packages/server/Dockerfile` with multi-stage build: base → deps (pnpm fetch) → build (pnpm deploy --prod) → production (node:22-slim, non-root user, HEALTHCHECK)
- [X] T048 [P] Create `packages/server/Procfile` with `release: npx prisma migrate deploy` and `web: node dist/main.js`
- [X] T049 [P] Create `packages/server/app.json` with Dokku predeploy script for Prisma migrations
- [X] T050 [P] Create `packages/server/.env.example` with all env vars from quickstart.md
- [X] T051 [P] Create `packages/server/.dockerignore` excluding node_modules, .git, tests, coverage, *.md

### Server Boot Verification

- [X] T052 Run `pnpm install` from root to install server dependencies
- [X] T053 Run `pnpm --filter @voxpage/server build` and verify TypeScript compilation succeeds
- [X] T054 Verify server starts locally and `GET /health` responds (database=down expected without PG, memory=up)

**Checkpoint**: Server boots, health check works, structured logs emit, Prisma schema compiles, shared package types importable by both extension and server.

---

## Phase 3: User Story 1 — Extension Continues Working After Monorepo Migration (Priority: P1) 🎯 MVP

**Goal**: Validate that the monorepo migration from Phase 1 is fully non-breaking. Extension builds, all tests pass, behavior is identical.

**Independent Test**: Run full test suite, build extension, verify build size, manually test in Firefox.

- [ ] T055 [US1] Verify `@voxpage/shared` types are importable in extension code by adding a sample import in `packages/extension/src/core/shared/result.ts` that re-exports from `@voxpage/shared`
- [ ] T056 [US1] Run full extension test suite: `pnpm --filter @voxpage/extension test` — all 2,881+ tests must pass
- [ ] T057 [US1] Build extension: `pnpm --filter @voxpage/extension build:firefox` — verify output under 1.1 MB
- [ ] T058 [US1] Run `pnpm --filter @voxpage/extension lint` — verify zero lint errors
- [ ] T059 [US1] Manually install built `.xpi` in Firefox Nightly and verify basic playback, settings, and footer work

**Checkpoint**: Extension is proven non-breaking in monorepo. SC-001, SC-002, SC-012 validated.

---

## Phase 4: User Story 2 — Server Health & Deployment (Priority: P1)

**Goal**: Deploy the minimal NestJS server to Dokku. Health check passes. Logs appear in Grafana/Loki.

**Independent Test**: `curl https://voxpage-api.home301server.com.br/health` returns 200 with status "ok". Check Grafana for log entries.

- [ ] T060 [US2] Create Dokku app: `ssh ProxMox.Dokku "dokku apps:create voxpage-api"`
- [ ] T061 [US2] Create and link PostgreSQL: `dokku postgres:create voxpage-db && dokku postgres:link voxpage-db voxpage-api`
- [ ] T062 [US2] Create and link Redis: `dokku redis:create voxpage-cache && dokku redis:link voxpage-cache voxpage-api`
- [ ] T063 [US2] Set environment variables on Dokku: NODE_ENV, PORT, JWT_SECRET, LOG_LEVEL, LOKI_HOST
- [ ] T064 [US2] Set Dokku domain: `dokku domains:add voxpage-api voxpage-api.home301server.com.br`
- [ ] T065 [US2] Configure Dokku health check: `dokku checks:set voxpage-api web /health`
- [ ] T066 [US2] Add Dokku git remote and push: `git remote add dokku dokku@ProxMox.Dokku:voxpage-api && git push dokku main`
- [ ] T067 [US2] Verify health endpoint: `curl https://voxpage-api.home301server.com.br/health` returns 200 with `{ status: "ok", version, uptime }`
- [ ] T068 [US2] Verify structured logs appear in Grafana/Loki within 30 seconds of a request
- [ ] T069 [US2] Verify zero-downtime deployment by pushing an update and confirming no health check failures

**Checkpoint**: Server deployed and observable. SC-003, SC-004, SC-005 validated.

---

## Phase 5: User Story 3 — Free Tier TTS Without Account (Priority: P1)

**Goal**: Ensure free-tier and BYOK users are never affected by the server. Extension works fully without server. Business invariants INV-001, INV-002, INV-005 enforced.

**Independent Test**: Use extension with no license key, verify no network calls to VoxPage server. Use BYOK, verify direct provider calls.

- [ ] T070 [US3] Implement `packages/server/src/core/subscription/feature-gate.ts` with `isFeatureEnabled(tier, feature)` returning free-tier defaults for unknown keys (INV-001)
- [ ] T071 [US3] Implement free-tier default response in license validation: unknown keys return `{ valid: false, tier: 'free', features: { managedTts: false, premiumVoices: false }, credits: { total: 0, remaining: 0, usagePercent: 0 } }` in `packages/server/src/core/subscription/subscription.service.ts`
- [ ] T072 [US3] Write unit tests for feature-gate free-tier defaults in `packages/server/tests/unit/core/subscription/feature-gate.spec.ts` (10+ test cases)
- [ ] T073 [US3] Write unit tests for INV-001 enforcement in `packages/server/tests/unit/core/subscription/subscription.service.spec.ts` (5+ test cases)
- [ ] T074 [US3] Verify extension makes zero network calls to VoxPage server when no license key is configured (manual test in Firefox Nightly with network monitor)

**Checkpoint**: Free-tier users completely unaffected. SC-012 validated. INV-001, INV-002, INV-005 enforced.

---

## Phase 6: User Story 4 — License Validation & Subscription Management (Priority: P2)

**Goal**: Users can activate license keys, view subscription status, and manage billing via Paddle checkout.

**Independent Test**: POST license key to `/api/v1/license/validate`, verify correct tier/credits/features returned.

### Server Ports

- [ ] T075 [P] [US4] Implement `packages/server/src/ports/subscription-repository.port.ts` abstract class with findById, findByUserId, save, findActiveByUserId methods
- [ ] T076 [P] [US4] Implement `packages/server/src/ports/credit-repository.port.ts` abstract class with findCurrentAllocation, deductCredits, getAllocationHistory methods
- [ ] T077 [P] [US4] Implement `packages/server/src/ports/billing-gateway.port.ts` abstract class with createCheckoutUrl, getSubscription, cancelSubscription methods

### Server Core (ZERO NestJS imports)

- [ ] T078 [P] [US4] Implement `packages/server/src/core/subscription/subscription.entity.ts` domain entity with `isActive()`, `cancel()`, `upgrade()`, `isInGracePeriod()` methods
- [ ] T079 [P] [US4] Implement `packages/server/src/core/subscription/license-validation.service.ts` with `validate(keyHash)` returning `Result<LicenseValidationResponse, LicenseError>`
- [ ] T080 [P] [US4] Implement `packages/server/src/core/shared/domain-errors.ts` with discriminated union error types: `LicenseError`, `SubscriptionError`, `CreditError`

### Server Adapters

- [ ] T081 [US4] Implement `packages/server/src/adapters/persistence/prisma-subscription.repository.ts` with Prisma queries, domain↔persistence mapping
- [ ] T082 [US4] Implement `packages/server/src/adapters/persistence/prisma-user.repository.ts` with findByLicenseKeyHash, create, findById
- [ ] T083 [US4] Implement `packages/server/src/adapters/billing/paddle.adapter.ts` wrapping `@paddle/paddle-node-sdk` for checkout URL generation

### Server Infrastructure

- [ ] T084 [US4] Implement `packages/server/src/infrastructure/controllers/license.controller.ts` with `POST /api/v1/license/validate` and `POST /api/v1/license/activate` per api-v1.yaml
- [ ] T085 [US4] Implement `packages/server/src/infrastructure/controllers/subscription.controller.ts` with `GET /api/v1/subscription` and `POST /api/v1/subscription/checkout` per api-v1.yaml
- [ ] T086 [US4] Implement `packages/server/src/infrastructure/modules/subscription.module.ts` wiring ports → adapters via factory providers for core services
- [ ] T087 [US4] Implement `packages/server/src/infrastructure/modules/license.module.ts` wiring license validation service

### Server Tests

- [ ] T088 [P] [US4] Write unit tests for Subscription entity in `packages/server/tests/unit/core/subscription/subscription.entity.spec.ts` (15+ tests: isActive, cancel, upgrade, grace period, INV-004)
- [ ] T089 [P] [US4] Write unit tests for LicenseValidationService in `packages/server/tests/unit/core/subscription/license-validation.service.spec.ts` (10+ tests: valid key, invalid key, expired, free-tier default)
- [ ] T090 [P] [US4] Write contract tests for PrismaSubscriptionRepository in `packages/server/tests/contract/prisma-subscription.repository.spec.ts`

### Extension Integration

- [ ] T091 [US4] Implement `packages/extension/src/ports/api-client.port.ts` with `IApiClient` interface for server communication
- [ ] T092 [US4] Implement `packages/extension/src/adapters/api/voxpage-api.adapter.ts` HTTP client with retry, auth (X-License-Key header), base URL configuration
- [ ] T093 [US4] Implement license validation call on extension startup in `packages/extension/src/entrypoints/background.ts` — only when license key is configured
- [ ] T094 [US4] Add subscription status display to extension popup showing tier, credits, and manage link in `packages/extension/src/entrypoints/popup/`

**Checkpoint**: License keys validate, subscription status visible in extension, checkout URLs generated. SC-008 validated.

---

## Phase 7: User Story 5 — Managed Credit TTS Proxy (Priority: P2)

**Goal**: Subscribed users can use premium TTS via server proxy with credit deduction, caching, and provider routing.

**Independent Test**: POST to `/api/v1/tts/synthesize` with valid license key, verify audio returned, credits deducted, X-Credits-Remaining header present.

### Server Ports

- [ ] T095 [P] [US5] Implement `packages/server/src/ports/tts-provider.port.ts` abstract class with `synthesize(text, voice, language)` returning `Result<Buffer, TTSError>`
- [ ] T096 [P] [US5] Implement `packages/server/src/ports/cache-store.port.ts` abstract class with `get(key)`, `set(key, data, ttl)`, `has(key)` for audio caching

### Server Core (ZERO NestJS imports)

- [ ] T097 [P] [US5] Implement `packages/server/src/core/credits/credit.service.ts` with `deductCredits(userId, amount)` returning `Result<CreditTransaction, CreditError>`, enforcing atomic deduction and INV-004 (no mid-cycle expiry)
- [ ] T098 [P] [US5] Implement `packages/server/src/core/credits/credit-allocation.entity.ts` domain entity with `hasCredits(amount)`, `deduct(amount)`, `isExpired()` methods
- [ ] T099 [P] [US5] Implement `packages/server/src/core/routing/provider-router.ts` with `selectProvider(tier, language, preferredProvider)` returning `RoutingDecision` with fallback chain
- [ ] T100 [P] [US5] Implement `packages/server/src/core/routing/fallback-chain.ts` with ordered provider fallback logic per tier
- [ ] T101 [US5] Implement `packages/server/src/core/tts/tts.service.ts` orchestrating: cache check (INV-006) → credit check → provider routing → synthesis → credit deduction → cache store

### Server Adapters

- [ ] T102 [P] [US5] Implement `packages/server/src/adapters/tts/openai-tts.adapter.ts` implementing TTSProviderPort, calling OpenAI TTS API
- [ ] T103 [P] [US5] Implement `packages/server/src/adapters/tts/elevenlabs-tts.adapter.ts` implementing TTSProviderPort, calling ElevenLabs API
- [ ] T104 [P] [US5] Implement `packages/server/src/adapters/tts/groq-tts.adapter.ts` implementing TTSProviderPort, calling Groq API
- [ ] T105 [US5] Implement `packages/server/src/adapters/cache/redis-cache.adapter.ts` implementing CacheStorePort with Redis get/set/has
- [ ] T106 [US5] Implement `packages/server/src/adapters/persistence/prisma-credit.repository.ts` with atomic credit deduction using Prisma transactions

### Server Infrastructure

- [ ] T107 [US5] Implement `packages/server/src/infrastructure/controllers/tts.controller.ts` with `POST /api/v1/tts/synthesize` (returns audio/mpeg with X-Credits-Used, X-Credits-Remaining, X-Cache-Hit, X-Provider headers) and `GET /api/v1/tts/voices/:provider` per api-v1.yaml
- [ ] T108 [US5] Implement `packages/server/src/infrastructure/modules/tts.module.ts` wiring TTS ports → adapters, registering provider factory
- [ ] T109 [US5] Implement `packages/server/src/infrastructure/modules/credits.module.ts` wiring credit ports → adapters via factory providers

### Server Tests

- [ ] T110 [P] [US5] Write unit tests for CreditService in `packages/server/tests/unit/core/credits/credit.service.spec.ts` (20+ tests: deduction, insufficient credits, atomic, INV-004, INV-006 cache skip)
- [ ] T111 [P] [US5] Write unit tests for CreditAllocation entity in `packages/server/tests/unit/core/credits/credit-allocation.entity.spec.ts` (10+ tests)
- [ ] T112 [P] [US5] Write unit tests for ProviderRouter in `packages/server/tests/unit/core/routing/provider-router.spec.ts` (15+ tests: tier routing, fallback, language, unavailable provider)
- [ ] T113 [P] [US5] Write unit tests for TTSService in `packages/server/tests/unit/core/tts/tts.service.spec.ts` (15+ tests: cache hit, cache miss, credit deduction, provider fallback, insufficient credits)
- [ ] T114 [P] [US5] Write contract tests for TTS provider adapters in `packages/server/tests/contract/tts-provider.adapter.spec.ts`

### Extension Integration

- [ ] T115 [US5] Update `packages/extension/src/adapters/api/voxpage-api.adapter.ts` to add `synthesize(text, provider, voice, language)` method calling server TTS proxy
- [ ] T116 [US5] Update extension audio generation flow to route managed-credit requests through server proxy while keeping BYOK direct (INV-002) in `packages/extension/src/composition/factories.ts`

**Checkpoint**: TTS proxy works end-to-end: text → server → provider → audio → extension. Credits tracked. SC-009, SC-011 validated.

---

## Phase 8: User Story 6 — Billing Webhook Processing (Priority: P2)

**Goal**: Paddle webhook events automatically update subscription status, credit allocations, and features.

**Independent Test**: Send Paddle webhook payloads to `POST /webhooks/paddle`, verify subscription state transitions and credit allocations.

### Server Core

- [ ] T117 [US6] Implement `packages/server/src/core/subscription/subscription.service.ts` with `handleSubscriptionCreated()`, `handleSubscriptionUpdated()`, `handleSubscriptionCanceled()`, `handleRenewal()` — all returning `Result<Subscription, SubscriptionError>`

### Server Adapters & Infrastructure

- [ ] T118 [US6] Implement `packages/server/src/infrastructure/guards/paddle-webhook.guard.ts` with Paddle SDK `unmarshal()` signature verification (requires rawBody)
- [ ] T119 [US6] Implement `packages/server/src/infrastructure/controllers/webhook.controller.ts` with `POST /webhooks/paddle` handling SubscriptionCreated, SubscriptionUpdated, SubscriptionCanceled, TransactionCompleted events per api-v1.yaml
- [ ] T120 [US6] Implement `packages/server/src/infrastructure/modules/billing.module.ts` wiring Paddle adapter and webhook controller
- [ ] T121 [US6] Implement idempotency check: store processed webhook event IDs to prevent duplicate processing (FR-021)

### Server Tests

- [ ] T122 [P] [US6] Write unit tests for SubscriptionService webhook handlers in `packages/server/tests/unit/core/subscription/subscription.service.spec.ts` (20+ tests: create, update, cancel, renew, idempotency, INV-004 cancel-at-period-end)
- [ ] T123 [P] [US6] Write integration tests for webhook signature verification in `packages/server/tests/integration/webhook.integration.spec.ts` (5+ tests: valid sig, invalid sig, malformed payload)
- [ ] T124 [P] [US6] Write integration tests for full webhook → subscription → credit flow in `packages/server/tests/integration/billing-flow.integration.spec.ts`

### Dokku Config

- [ ] T125 [US6] Set Paddle env vars on Dokku: `dokku config:set voxpage-api PADDLE_API_KEY=<key> PADDLE_WEBHOOK_SECRET=<secret>`
- [ ] T126 [US6] Verify webhook endpoint with Paddle sandbox test events

**Checkpoint**: Billing lifecycle fully automated. SC-010 validated.

---

## Phase 9: User Story 7 — Credit Balance Visibility & History (Priority: P3)

**Goal**: Users see credit balance, usage percentage, and transaction history in the extension.

**Independent Test**: `GET /api/v1/credits/balance` and `GET /api/v1/credits/history` return correct data for authenticated user.

### Server Infrastructure

- [ ] T127 [US7] Implement `packages/server/src/infrastructure/controllers/credits.controller.ts` with `GET /api/v1/credits/balance` and `GET /api/v1/credits/history?limit=50&offset=0` per api-v1.yaml
- [ ] T128 [US7] Implement `packages/server/src/infrastructure/modules/credits-api.module.ts` (if not already covered by credits.module.ts) registering the credits controller

### Server Tests

- [ ] T129 [P] [US7] Write unit tests for credit balance calculation in `packages/server/tests/unit/core/credits/credit-balance.spec.ts` (5+ tests: percentage calculation, period boundaries)
- [ ] T130 [P] [US7] Write integration tests for credits endpoints in `packages/server/tests/integration/credits-api.integration.spec.ts`

### Extension Integration

- [ ] T131 [US7] Update `packages/extension/src/adapters/api/voxpage-api.adapter.ts` to add `getBalance()` and `getHistory(limit, offset)` methods
- [ ] T132 [US7] Display credit balance (percentage + absolute) in extension popup in `packages/extension/src/entrypoints/popup/`
- [ ] T133 [US7] Add low-credit warning (below 10%) with upgrade prompt in extension popup

**Checkpoint**: Credit visibility complete. Users can see balance and history.

---

## Phase 10: User Story 8 — Shared Domain Types Across Extension & Server (Priority: P3)

**Goal**: Developers import shared types from `@voxpage/shared` in both packages. Type mismatches caught at compile time.

**Independent Test**: Both `pnpm --filter @voxpage/extension build:firefox` and `pnpm --filter @voxpage/server build` succeed with shared type imports. Intentional type mismatch causes compile error.

- [ ] T134 [US8] Refactor extension to import `SubscriptionTier`, `TTSProvider`, `TIER_CREDITS`, `PROVIDER_COSTS` from `@voxpage/shared` instead of local definitions in `packages/extension/src/`
- [ ] T135 [US8] Verify server imports `SubscriptionTier`, `TTSProvider`, `Result`, `TIER_CREDITS`, `PROVIDER_COSTS` from `@voxpage/shared` throughout `packages/server/src/core/`
- [ ] T136 [US8] Run full workspace type check: `pnpm -r exec tsc --noEmit` — zero type errors across all 3 packages
- [ ] T137 [US8] Run full workspace build: `pnpm --filter @voxpage/extension build:firefox && pnpm --filter @voxpage/server build` — both succeed

**Checkpoint**: Shared types proven consistent. SC-013 validated.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories. CI/CD, documentation, final validations.

- [ ] T138 [P] Create `packages/server/tests/unit/core/shared/` with tests verifying `core/` directory has zero `@nestjs/*` imports (SC-006 static analysis)
- [ ] T139 [P] Create `.github/workflows/server-ci.yml` for server CI: install, lint, test, build
- [ ] T140 [P] Update `.github/workflows/` extension CI to use `pnpm --filter @voxpage/extension` commands from monorepo root
- [ ] T141 Verify total server test count meets 200+ target (SC-007): `pnpm --filter @voxpage/server test -- --verbose 2>&1 | tail -5`
- [ ] T142 Set TTS provider API keys on Dokku: `dokku config:set voxpage-api GROQ_API_KEY=<key> ELEVENLABS_API_KEY=<key> OPENAI_API_KEY=<key>`
- [ ] T143 Run full E2E validation: extension with license key → server validates → TTS proxy → audio plays
- [ ] T144 Update `CLAUDE.md` with monorepo development guidelines, workspace commands, and new project structure
- [ ] T145 Final deployment push to Dokku and full health/log verification

**Checkpoint**: All success criteria validated. Production-ready.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all server user stories
- **Phase 3 (US1 - Extension Regression)**: Depends on Phase 1 only — can run in parallel with Phase 2
- **Phase 4 (US2 - Deployment)**: Depends on Phase 2
- **Phase 5 (US3 - Free Tier)**: Depends on Phase 2 — can run in parallel with Phase 4
- **Phase 6 (US4 - License/Subscription)**: Depends on Phase 2 and Phase 4 (server deployed)
- **Phase 7 (US5 - TTS Proxy)**: Depends on Phase 6 (needs subscription/credit infrastructure)
- **Phase 8 (US6 - Webhooks)**: Depends on Phase 6 (needs subscription infrastructure)
- **Phase 9 (US7 - Credit Visibility)**: Depends on Phase 7 (needs credit transaction data)
- **Phase 10 (US8 - Shared Types)**: Can start after Phase 2 — independent of other stories
- **Phase 11 (Polish)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Phase 1 (Setup) ──┬──→ Phase 3 (US1: Extension Regression) ✅ MVP
                   │
                   └──→ Phase 2 (Foundational) ──┬──→ Phase 4 (US2: Deployment)
                                                  │
                                                  ├──→ Phase 5 (US3: Free Tier) [parallel with US2]
                                                  │
                                                  ├──→ Phase 10 (US8: Shared Types) [parallel]
                                                  │
                                                  └──→ Phase 6 (US4: License) ──┬──→ Phase 7 (US5: TTS Proxy)
                                                                                │
                                                                                └──→ Phase 8 (US6: Webhooks)
                                                                                         │
                                                                                         └──→ Phase 9 (US7: Credits UI)
```

### Parallel Opportunities

**Within Phase 1**: T001-T005 can run in parallel (different files)
**Within Phase 2**: T017-T026 (shared package) all [P]. T034-T038 (server modules) all [P]. T047-T051 (deployment artifacts) all [P].
**Between Phases**: Phase 3 and Phase 2 can run concurrently. Phase 4 and Phase 5 can run concurrently. Phase 7 and Phase 8 can run concurrently.

---

## Parallel Example: Phase 2 (Foundational)

```
# Launch all shared package types in parallel:
T017: Result<T,E> type in packages/shared/src/result.ts
T018: Subscription types in packages/shared/src/domain/subscription.ts
T019: Provider types in packages/shared/src/domain/provider.ts
T020: Credit types in packages/shared/src/domain/credits.ts
T021: License types in packages/shared/src/domain/license.ts
T022: Tier constants in packages/shared/src/constants/tiers.ts
T023: Provider costs in packages/shared/src/constants/providers.ts
T024: Invariants in packages/shared/src/constants/invariants.ts
T025: API types in packages/shared/src/types/api.ts
T026: Error types in packages/shared/src/types/errors.ts

# After T027 (barrel export), launch server modules in parallel:
T034: App config
T035: Logging module
T036: Health module
T037: Health controller
T038: Prisma health indicator

# Launch deployment artifacts in parallel (any time):
T047: Dockerfile
T048: Procfile
T049: app.json
T050: .env.example
T051: .dockerignore
```

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 3 = Extension Regression Only)

1. Complete Phase 1: Monorepo Setup
2. Complete Phase 3: Extension Regression Validation (US1)
3. **STOP and VALIDATE**: All 2,881+ tests pass, extension builds, behavior unchanged
4. Commit and push — monorepo migration is complete and safe

### Server MVP (Add Phase 2 + Phase 4)

1. Complete Phase 2: Server Skeleton + Shared Package
2. Complete Phase 4: Deploy to Dokku (US2)
3. **STOP and VALIDATE**: Health check works, logs in Grafana
4. Server is live — feature development can begin

### Incremental Delivery

1. Setup + Extension Regression → Monorepo migration validated
2. Foundational + Deployment → Server live on Dokku
3. Free Tier (US3) → Business invariants enforced
4. License/Subscription (US4) → Revenue model functional
5. TTS Proxy (US5) → Core value delivered
6. Webhooks (US6) → Billing automated
7. Credit Visibility (US7) → User experience polished
8. Shared Types (US8) → Developer experience improved
9. Polish → Production-ready

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Server `core/` directory must have ZERO `@nestjs/*` imports (SC-006)
- All 6 business invariants (INV-001 through INV-006) must be enforced
- Commit after each phase completion
- Total: 145 tasks across 11 phases
