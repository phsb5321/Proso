# Research: VoxPage Monorepo + NestJS Server + Dokku Deployment

**Branch**: `064-monorepo-nestjs-dokku` | **Date**: 2026-02-10 | **Phase**: 0 (Discovery)

## 1. Dokku Infrastructure Discovery

### 1.1 Host System

| Property | Value |
|----------|-------|
| Dokku Version | 0.37.6 |
| OS | Ubuntu, Linux 6.8.0-94-generic x86_64 |
| RAM | 16 GB total, ~11 GB available |
| Disk | 187 GB total, 118 GB free (37% used) |
| Swap | None |
| Global Domain | `home301server.com.br` |
| Global Proxy | nginx |

### 1.2 Installed Plugins

| Plugin | Version | Purpose |
|--------|---------|---------|
| postgres | 1.46.0 | PostgreSQL service plugin |
| redis | 1.42.1 | Redis service plugin (no instances yet) |
| letsencrypt | 0.20.4 | Automated TLS certificates |
| cloudflare-dns | 0.2.0 | DNS record updates on deploy |
| builder-dockerfile | core | Dockerfile-based builds |

All 22 of 23 apps use Dockerfile builds. Only `dokku-homepage` uses herokuish.

### 1.3 Database Availability

| Database | Version | Status | Linked Apps |
|----------|---------|--------|-------------|
| analytics-db | postgres:18.1 | running | dagster (via env var) |
| delicasa-dev-db | postgres:16 | running | 5 Delicasa apps |
| sparkyfitness-db | postgres:18.1 | running | sparkyfitness-backend |

**Redis**: Plugin installed, **zero instances** exist. Available for creation.
**MongoDB**: Plugin **not installed**.

**Decision**: Use PostgreSQL 18.1 (latest available on host) + Redis for caching.
**Rationale**: Both plugins are installed and proven on this host. PostgreSQL is used by all existing apps. Redis is available but has no instances — perfect for a fresh `voxpage-cache` instance.
**Alternative Rejected**: MongoDB — plugin not installed, no existing usage patterns on this host.

### 1.4 Observability Stack (Grafana LGTM)

The host runs a complete Grafana LGTM observability stack:

| Service | Domain | Port | Purpose |
|---------|--------|------|---------|
| Grafana | grafana.home301server.com.br | 3000 | Dashboards |
| Loki | loki.home301server.com.br | 3100 | Log aggregation |
| Tempo | tempo.home301server.com.br | 3200, 4317, 4318 | Distributed tracing (OTLP) |
| Prometheus | prometheus.home301server.com.br | 9090 | Metrics |
| Alloy | alloy.home301server.com.br | 12345, 4317, 4318 | Telemetry collector |
| Alertmanager | alertmanager.home301server.com.br | 9093 | Alert routing |
| MinIO | minio.home301server.com.br | 9000 | S3-compatible storage for Loki/Tempo |

**Log shipping**: All apps use a global **Vector** log sink (`timberio/vector:0.53.0-debian`) that forwards to Loki. Max log size: 10 MB per app. No per-app Loki plugin — logs flow via Vector automatically.

**Decision**: Use `nestjs-pino` + `pino-loki` for structured JSON logging. Logs will flow through Vector to Loki automatically, plus direct pino-loki transport for application-level labels.
**Rationale**: Vector handles all Docker container logs automatically. Adding pino-loki gives us application-level structured labels (userId, requestId, endpoint) that Vector's generic container log parsing cannot provide.

### 1.5 Existing VoxPage Infrastructure

**voxpage-log-gateway** already exists:
- Domains: `voxpage-log-gateway.home301server.com.br`, `voxpage-logs.home301server.com.br`
- Port: 3000, Dockerfile build
- Purpose: Lightweight Node.js proxy accepting logs from the browser extension, forwarding to Loki at `http://loki.web:3100`
- Auth: Token-based (`GATEWAY_TOKEN`)
- Rate limit: 60 RPM

**Decision**: The new `voxpage-api` server will be a separate Dokku app, NOT merged with the log gateway.
**Rationale**: Separation of concerns. The log gateway is a thin proxy; the API server has complex business logic, database dependencies, and different scaling characteristics.

### 1.6 Docker Networks

| Network | Driver | Used By |
|---------|--------|---------|
| monitoring | bridge | Grafana, Alloy, Alertmanager, cAdvisor |
| observability_observability | bridge | Bridgeserver |
| data-engineering | bridge | (unused currently) |

**Decision**: Connect `voxpage-api` to the `monitoring` network for direct access to Loki/Tempo if needed.
**Alternative**: Use the default bridge network and rely on Vector for log shipping (simpler, less coupling).

### 1.7 Secret Management Patterns

From existing apps, secrets are stored via `dokku config:set`. Patterns observed:
- API keys as individual env vars: `PADDLE_API_KEY`, `GROQ_API_KEY`, etc.
- Database URLs auto-injected by Dokku plugin linking: `DATABASE_URL`
- JWT secrets as generated random values
- No external secret manager (Vault, AWS Secrets Manager, etc.)

### 1.8 Deployment Patterns

- All apps use `git push dokku` deployment
- Dockerfile-based builds are standard
- Cloudflare DNS plugin auto-updates DNS records on deploy
- TLS is handled at Cloudflare proxy layer (no Let's Encrypt certs active on host)
- Zero-downtime deploys via Dokku health checks
- Tailscale available for private access (`*.tail1ba2bb.ts.net`)

---

## 2. Extension Architecture Analysis

### 2.1 Hexagonal Architecture Patterns

The extension uses a mature hexagonal architecture with these layers:

```
src/core/        → Domain layer (pure business logic, zero dependencies)
src/ports/       → Port interfaces (dependency contracts)
src/adapters/    → Adapter implementations (concrete dependencies)
src/composition/ → DI container (singleton, factory pattern)
src/handlers/    → Message handler registry (dot-notation dispatch)
```

### 2.2 Result Type

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
// Helpers: Ok(), Err(), isOk(), isErr(), unwrap(), map(), andThen()
```

All fallible operations return `Result<T, E>` — never throw exceptions for domain errors.

### 2.3 Error Types (Discriminated Unions)

```typescript
type PlaybackError = { type: 'no_content' } | { type: 'generation_failed'; ... } | ...
type AudioError = { type: 'invalid_credentials' } | { type: 'unsupported_language'; ... } | ...
type CacheError = { type: 'storage_full' } | { type: 'entry_not_found'; ... } | ...
```

Each has factory helpers: `playbackError.noContent()`, `audioError.invalidCredentials()`, etc.

### 2.4 Port Interfaces (11 ports)

| Port | Methods | Domain |
|------|---------|--------|
| IAudioGenerator | generateAudio, getVoices, validateCredentials | Audio |
| ICacheStore | get, set, delete, clear, has, getStats, evictIfNeeded | Cache |
| ITextExtractor | extract, canHandle | Content |
| IContentScorer | score | Content |
| ISettingsStore | getSettings, updateSettings, getApiKey, setApiKey, subscribe | Settings |
| IHighlightSynchronizer | highlightParagraph, highlightWord, clearHighlights, showFooter, hideFooter | UI |
| IAudioUrlProvider | (URL generation) | Audio |
| IAudioPlayer | load, play, pause, stop, seek, setSpeed, getPosition, getDuration | Audio |
| IReader | (document reading) | Content |
| IHighlightRepository | (highlight persistence) | Storage |

### 2.5 Composition Root

```typescript
createContainer(config: AppConfig, apiKeys: ApiKeys) → Container
getContainer() → Container (singleton)
ensureContainerInitialized(config, apiKeys) → Container (lazy)
reconfigureAudioGenerator(provider, apiKey) → void (runtime swap)
```

Adapter factories: `createAudioGeneratorAdapter()`, `createCacheStoreAdapter()`, etc.

### 2.6 Naming Conventions

| Artifact | Pattern | Example |
|----------|---------|---------|
| Port interface | `I{Domain}` | `IAudioGenerator` |
| Port file | `{domain}.port.ts` | `audio-generator.port.ts` |
| Adapter class | `{Concrete}{Domain}Adapter` | `ElevenLabsAudioAdapter` |
| Adapter file | `{concrete}-{domain}.adapter.ts` | `elevenlabs-audio.adapter.ts` |
| Service class | `{Domain}Service` | `PlaybackService` |
| Handler file | `{domain}.handlers.ts` | `playback.handlers.ts` |
| Handler name | `{domain}.{action}` | `playback.start` |
| Error helper | `{domain}Error` | `playbackError` |

### 2.7 Handler Registry

- `HandlerRegistry` class with register/dispatch/getHandlerNames
- Dot-notation naming: `playback.start`, `cache.get`, `settings.update`
- 15 handler files across domains (playback, content, cache, audio, settings, provider, highlight, footer, language, queue, export, reader, prefetch, debug, logging)
- 86 handlers total

---

## 3. pnpm Monorepo Configuration

### 3.1 Current State

- Single package `"voxpage"` v1.1.3, pnpm 10.29.2
- `.npmrc`: `shamefully-hoist=true`, `auto-install-peers=true`, `engine-strict=true`
- No `pnpm-workspace.yaml` exists
- TypeScript 5.9.3, strict mode, bundler moduleResolution
- Biome 1.9.4 for linting (indentStyle space, width 2, lineWidth 100, single quotes)

### 3.2 Workspace Configuration

**Decision**: `pnpm-workspace.yaml` with `packages: ["packages/*"]`
**Rationale**: Standard pnpm workspace pattern. Three packages: `@voxpage/extension`, `@voxpage/server`, `@voxpage/shared`.

### 3.3 .npmrc Changes

**Decision**: Replace `shamefully-hoist=true` with targeted hoisting for NestJS.
**Rationale**: NestJS has a known issue (#13463) where duplicate `@nestjs/core` instances in a pnpm monorepo break dependency injection. `public-hoist-pattern[]=@nestjs/*` prevents this while maintaining better isolation.

```ini
auto-install-peers=true
engine-strict=true
public-hoist-pattern[]=@nestjs/*
```

### 3.4 Shared Package (`@voxpage/shared`)

**Decision**: Point `main` and `types` at `.ts` source files (no build step needed for internal packages).
**Rationale**: Both Vite (WXT) and NestJS's tsc can resolve TypeScript source directly via `workspace:*` protocol. Avoids a build step for the shared package during development.

### 3.5 File Migration Strategy

**Decision**: Use `git mv` for moving files to `packages/extension/`.
**Rationale**: Non-destructive, preserves history with `git log --follow`, no force-push required. `git filter-repo` is overkill for single-repo restructuring.
**Alternative Rejected**: `git filter-repo --to-subdirectory-filter` — rewrites all commit hashes, invalidates PRs/tags/branches.

### 3.6 WXT in Monorepo

Known issues and solutions:
1. **Path aliases**: Must be in `wxt.config.ts` alias config AND `tsconfig.json` paths for IDE support
2. **`srcDir`**: Remains `"src"` relative to `packages/extension/`
3. **`public/`**: Must be alongside `wxt.config.ts` at `packages/extension/public/`
4. **`postinstall`**: Move `wxt prepare` from root to `packages/extension/package.json`

### 3.7 Biome Configuration

**Decision**: Stay on Biome 1.9.x with relative extends paths (`"extends": ["../../biome.json"]`).
**Rationale**: Upgrading to Biome v2 would be a separate concern. Relative extends works fine.
**Alternative**: Upgrade to Biome v2+ for `"extends": "//"` microsyntax (better, but orthogonal to this feature).

---

## 4. NestJS Hexagonal Architecture

### 4.1 Port Token Strategy

**Decision**: Use abstract classes as injection tokens.
**Rationale**: Abstract classes survive TypeScript compilation (unlike interfaces), serve as both type AND injection token, and don't require `@Inject()` decorators. This mirrors the extension's port pattern closely.

```typescript
// Port definition (survives compilation)
export abstract class SubscriptionRepository {
  abstract findById(id: string): Promise<Subscription | null>;
  abstract save(subscription: Subscription): Promise<Subscription>;
}

// Module wiring
{ provide: SubscriptionRepository, useClass: PrismaSubscriptionRepository }

// Service injection (no @Inject needed)
constructor(private readonly subscriptionRepo: SubscriptionRepository) {}
```

**Alternative Rejected**: Symbol tokens — require `@Inject()` everywhere, can break with `npm link`.

### 4.2 Framework-Agnostic Core Services

**Decision**: Use factory providers to keep core services free of `@Injectable()`.
**Rationale**: The spec requires `core/` to have ZERO NestJS imports (SC-006). Factory providers instantiate pure TypeScript classes without decorators.

```typescript
// Pure core service (no NestJS imports)
export class CreditService {
  constructor(private readonly repo: CreditRepository) {}
}

// Module factory (NestJS glue)
{ provide: CreditService, useFactory: (repo) => new CreditService(repo), inject: [CreditRepository] }
```

### 4.3 ORM Selection

**Decision**: Prisma ORM.
**Rationale**:
- Superior migration story (`prisma migrate deploy` in Dokku release phase)
- Excellent TypeScript type inference from schema
- Active maintenance (funded company)
- Works perfectly with PostgreSQL on Dokku
- Wrapped behind port abstractions for hexagonal purity

**Alternative Rejected**: TypeORM — community-maintained, critical bugs can sit unresolved, migration tooling is weaker.
**Alternative Noted**: Drizzle ORM is gaining traction but less mature for production use.

### 4.4 Paddle Webhook Integration

**Decision**: Use `@paddle/paddle-node-sdk` `unmarshal()` function with a NestJS guard.
**Rationale**: Official SDK handles signature verification. Guard pattern separates auth from business logic.
**Critical**: Must enable `rawBody: true` in `NestFactory.create()` for signature verification.

### 4.5 Logging

**Decision**: `nestjs-pino` + `pino-loki` transport.
**Rationale**: Auto-binds request context (requestId, method, URL) via `AsyncLocalStorage`. Structured JSON output compatible with Loki. Health endpoint excluded from request logging.

### 4.6 Health Checks

**Decision**: `@nestjs/terminus` with database, memory, and disk indicators.
**Rationale**: Official NestJS package. Dokku-compatible. Provides `/health`, `/health/liveness`, `/health/readiness` endpoints.

### 4.7 Rate Limiting

**Decision**: `@nestjs/throttler` with Redis storage.
**Rationale**: Multiple tiers (short/medium/long), per-route overrides, multi-instance safe with Redis storage. Must enable `trust proxy` for nginx/Cloudflare.

### 4.8 Authentication

**Decision**: License key guard + JWT for session management.
**Rationale**: Extension sends license key via `X-License-Key` header. Server validates and returns JWT for subsequent requests. `@Public()` decorator for health/webhook endpoints.

---

## 5. Deployment Architecture

### 5.1 Dokku App Configuration

```
App name:     voxpage-api
Domain:       voxpage-api.home301server.com.br
Builder:      Dockerfile
Port:         5000 (Dokku default)
Database:     postgres:18.1 (new instance: voxpage-db)
Cache:        redis (new instance: voxpage-cache)
Health check: GET /health
TLS:          Cloudflare proxy (no Let's Encrypt needed)
```

### 5.2 Dockerfile Strategy

**Decision**: Multi-stage build with `pnpm deploy --prod` for minimal production image.
**Rationale**: `pnpm deploy` creates an isolated deployment with only production dependencies, including resolved workspace packages. Cache mounts for pnpm store speed up rebuilds.

### 5.3 Release Phase

```
Procfile:
  release: npx prisma migrate deploy
  web: node dist/main.js
```

**Decision**: Run Prisma migrations in Dokku's release phase.
**Rationale**: Migrations run before the new version receives traffic. If migrations fail, deployment rolls back.

### 5.4 Environment Variables

| Variable | Source | Purpose |
|----------|--------|---------|
| DATABASE_URL | Dokku postgres:link | PostgreSQL connection |
| REDIS_URL | Dokku redis:link | Redis connection |
| NODE_ENV | config:set | production |
| PORT | config:set | 5000 |
| PADDLE_API_KEY | config:set | Paddle billing |
| PADDLE_WEBHOOK_SECRET | config:set | Webhook verification |
| GROQ_API_KEY | config:set | Groq TTS proxy |
| ELEVENLABS_API_KEY | config:set | ElevenLabs TTS proxy |
| OPENAI_API_KEY | config:set | OpenAI TTS proxy |
| JWT_SECRET | config:set | JWT signing |
| LOKI_HOST | config:set | Direct Loki transport |
