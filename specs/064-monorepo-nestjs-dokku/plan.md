# Implementation Plan: VoxPage Monorepo + NestJS Server + Dokku Deployment

**Branch**: `064-monorepo-nestjs-dokku` | **Date**: 2026-02-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/064-monorepo-nestjs-dokku/spec.md`

## Summary

Expand VoxPage from a standalone Firefox extension into a pnpm workspace monorepo with three packages: `@voxpage/extension` (existing extension), `@voxpage/server` (NestJS backend), and `@voxpage/shared` (shared domain types). The server implements subscription management, credit-based TTS proxy, and provider routing using hexagonal architecture (ports & adapters), deployed to an existing Dokku 0.37.6 instance with PostgreSQL, Redis, and full Grafana LGTM observability.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode: strictNullChecks, noImplicitAny, strictFunctionTypes)
**Primary Dependencies**: NestJS 10+, Prisma ORM, @paddle/paddle-node-sdk, nestjs-pino, pino-loki, @nestjs/terminus, @nestjs/throttler, WXT 0.20.13
**Storage**: PostgreSQL 18.1 (Dokku postgres plugin), Redis (Dokku redis plugin), IndexedDB (extension audio cache)
**Testing**: Jest 29.x (unit + contract), Playwright (E2E), @nestjs/testing (server integration)
**Target Platform**: Linux server (Dokku 0.37.6 on Ubuntu x86_64), Firefox 112+ / Chrome 88+ (extension)
**Project Type**: Monorepo (pnpm workspaces) — 3 packages: extension, server, shared
**Performance Goals**: Health check <200ms, license validation round-trip <500ms, TTS proxy overhead <300ms vs direct, webhook processing 100 events/min
**Constraints**: Extension build <1.1 MB, zero breaking changes to existing extension behavior, server core/ has zero NestJS imports, all 2,881+ existing tests pass after migration
**Scale/Scope**: Single Dokku instance (16 GB RAM, 118 GB disk free), initial user base <1000

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Cross-Browser MV3 Priority | PASS | Extension unchanged. Monorepo migration is file-only. Server is separate. |
| II. Privacy by Design | PASS | License keys stored server-side. No raw page content sent to server. BYOK keys stay in extension. Telemetry opt-out via free tier. |
| III. Hexagonal Architecture | PASS | Server mirrors extension hexagonal pattern: core/ (pure TS), ports/ (interfaces), adapters/ (implementations). Port tokens via abstract classes. |
| IV. Test Coverage | PASS | 200+ server unit tests target. Extension 2,881+ tests maintained. Contract tests for adapters. Integration tests for webhooks/TTS flow. |
| V. Observability | PASS | nestjs-pino structured JSON logging → Loki via Vector. Health checks via @nestjs/terminus. Tempo for tracing (OTLP). |
| VI. Simplicity | PASS | Incremental deployment (hello world first, then features). Prisma for migrations. `pnpm deploy` for Docker. No premature abstractions. |

**Quality Gates**:
- TypeScript strict mode: Both extension and server
- Biome lint pass: Shared config with per-package overrides
- All tests pass: Extension (2,881+) + Server (200+)
- E2E on Firefox: Extension regression

## Project Structure

### Documentation (this feature)

```text
specs/064-monorepo-nestjs-dokku/
├── plan.md              # This file
├── research.md          # Phase 0 infrastructure discovery
├── data-model.md        # Entity definitions and relationships
├── quickstart.md        # Developer quickstart guide
├── contracts/           # API contracts (OpenAPI)
│   └── api-v1.yaml      # REST API specification
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
# Root (workspace configuration)
package.json                    # Workspace root, shared devDeps
pnpm-workspace.yaml             # packages: ["packages/*"]
tsconfig.base.json              # Shared compiler options
biome.json                      # Shared linter config
.npmrc                          # public-hoist-pattern[]=@nestjs/*

# Extension Package (existing code, moved)
packages/extension/
├── package.json                # @voxpage/extension, depends on @voxpage/shared
├── tsconfig.json               # Extends ../../tsconfig.base.json
├── wxt.config.ts               # srcDir: "src", unchanged behavior
├── jest.config.js
├── src/
│   ├── entrypoints/            # background.ts, content.ts, popup/, options/
│   ├── core/                   # Domain layer (PlaybackService, etc.)
│   ├── ports/                  # IAudioGenerator, ICacheStore, etc.
│   ├── adapters/               # Concrete implementations
│   ├── composition/            # DI container
│   ├── handlers/               # 15 handler files
│   ├── utils/                  # Shared utilities
│   └── styles/                 # CSS
├── tests/                      # 2,881+ existing tests
└── public/                     # Extension icons

# Server Package (new)
packages/server/
├── package.json                # @voxpage/server, depends on @voxpage/shared
├── tsconfig.json               # Extends base, emitDecoratorMetadata
├── Dockerfile                  # Multi-stage build with pnpm deploy
├── Procfile                    # release: prisma migrate deploy, web: node dist/main.js
├── nest-cli.json
├── prisma/
│   └── schema.prisma           # Database schema
├── src/
│   ├── main.ts                 # NestJS bootstrap
│   ├── app.module.ts           # Root module
│   ├── core/                   # Domain layer — ZERO NestJS imports
│   │   ├── subscription/       # Subscription entity, service, feature-gate
│   │   ├── credits/            # CreditAllocation, CreditService
│   │   ├── routing/            # ProviderRouter, FallbackChain
│   │   ├── tts/                # TTSService (orchestration)
│   │   └── shared/             # Domain errors, business rules
│   ├── ports/                  # Abstract class port definitions
│   │   ├── subscription-repository.port.ts
│   │   ├── credit-repository.port.ts
│   │   ├── billing-gateway.port.ts
│   │   ├── tts-provider.port.ts
│   │   ├── cache-store.port.ts
│   │   └── logger.port.ts
│   ├── adapters/               # @Injectable() implementations
│   │   ├── persistence/        # Prisma repositories
│   │   ├── billing/            # Paddle adapter
│   │   ├── tts/                # OpenAI, ElevenLabs, Groq adapters
│   │   ├── cache/              # Redis cache adapter
│   │   └── logging/            # Pino logger adapter
│   └── infrastructure/         # NestJS framework glue
│       ├── modules/            # Feature modules
│       ├── controllers/        # REST endpoints
│       ├── guards/             # License, rate-limit, webhook guards
│       ├── interceptors/       # Logging interceptor
│       └── config/             # Environment configuration
├── tests/
│   ├── unit/                   # Core domain tests (200+)
│   ├── contract/               # Adapter contract tests
│   ├── integration/            # Webhook, TTS flow tests
│   └── e2e/                    # Full request flow tests
└── app.json                    # Dokku predeploy (prisma migrate)

# Shared Package (new)
packages/shared/
├── package.json                # @voxpage/shared, no build step
├── tsconfig.json               # Extends base
└── src/
    ├── index.ts                # Barrel export
    ├── result.ts               # Result<T,E> type + helpers
    ├── domain/                 # Shared entities
    │   ├── subscription.ts     # SubscriptionTier, SubscriptionStatus
    │   ├── credits.ts          # CreditAllocation, CreditTransaction
    │   ├── provider.ts         # TTSProvider, ProviderCosts
    │   └── license.ts          # LicenseKey types
    ├── constants/              # Business constants
    │   ├── tiers.ts            # TIER_CREDITS, FEATURE_MATRIX
    │   ├── providers.ts        # PROVIDER_COSTS
    │   └── invariants.ts       # INV-001 through INV-006
    └── types/                  # Shared TypeScript types
        ├── api.ts              # API request/response types
        └── errors.ts           # Shared error types

# Kept at root (project-wide)
specs/                          # Feature specifications
docs/                           # Documentation
CLAUDE.md                       # Dev guidelines (updated)
.github/workflows/              # CI (extension-ci.yml, server-ci.yml)
```

**Structure Decision**: Monorepo with 3 packages (`packages/*`). Extension code moves via `git mv` to preserve history. Server is new. Shared package has no build step (source TypeScript consumed directly via `workspace:*`). Root retains specs/, docs/, CLAUDE.md, and CI workflows.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 3 packages (extension + server + shared) | Shared types prevent drift between extension and server (SC-013). Server has fundamentally different runtime (Node.js vs browser). | 2 packages (no shared) rejected: would duplicate types and constants, causing drift. |
| Prisma ORM | Migrations, type safety, PostgreSQL integration | Direct SQL rejected: too much boilerplate for 7+ entities. TypeORM rejected: weaker migration tooling, community-maintained. |
| Abstract class port tokens | NestJS DI requires runtime tokens. Interfaces are erased at compile time. | Symbol tokens rejected: require @Inject() everywhere, break with npm link. String tokens rejected: typo-prone. |
