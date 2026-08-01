# Developer Quickstart: VoxPage Monorepo

**Branch**: `064-monorepo-nestjs-dokku` | **Date**: 2026-02-10

## Prerequisites

- Node.js 20+ (LTS)
- pnpm 10.29+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- Docker (for local PostgreSQL/Redis, optional)
- SSH access to `ProxMox.Dokku` (for deployment)

## Initial Setup

```bash
# Clone and install
git clone git@github.com:phsb5321/VoxPage.git
cd VoxPage
pnpm install

# Verify workspace structure
pnpm ls --depth 0 -r
# Should show: @voxpage/extension, @voxpage/server, @voxpage/shared
```

## Package Commands

### Extension (`packages/extension`)

```bash
# Development (Firefox with HMR)
pnpm --filter @voxpage/extension dev

# Build for Firefox
pnpm --filter @voxpage/extension build:firefox

# Run tests (2,881+ tests)
pnpm --filter @voxpage/extension test

# Lint
pnpm --filter @voxpage/extension lint
```

### Server (`packages/server`)

```bash
# Setup database (first time)
pnpm --filter @voxpage/server prisma:generate
pnpm --filter @voxpage/server prisma:migrate:dev

# Development (with hot reload)
pnpm --filter @voxpage/server start:dev

# Build
pnpm --filter @voxpage/server build

# Run tests
pnpm --filter @voxpage/server test

# Run tests with coverage
pnpm --filter @voxpage/server test:cov
```

### Shared (`packages/shared`)

```bash
# No build step needed — consumed as TypeScript source
# Type-check only
pnpm --filter @voxpage/shared tsc --noEmit
```

### Root (all packages)

```bash
# Install all dependencies
pnpm install

# Run all tests across workspace
pnpm -r test

# Lint all packages
pnpm -r lint

# Build all packages
pnpm -r build
```

## Environment Variables

### Server Development

Create `packages/server/.env`:

```env
# Database (local Docker or Dokku)
DATABASE_URL="postgresql://voxpage:voxpage@localhost:5432/voxpage_dev"

# Redis (local Docker)
REDIS_URL="redis://localhost:6379"

# Server
PORT=5000
NODE_ENV=development
JWT_SECRET=dev-jwt-secret-change-in-production

# Paddle (sandbox)
PADDLE_API_KEY=your-paddle-sandbox-api-key
PADDLE_WEBHOOK_SECRET=your-paddle-webhook-secret

# TTS Providers (optional for development)
GROQ_API_KEY=your-groq-key
ELEVENLABS_API_KEY=your-elevenlabs-key
OPENAI_API_KEY=your-openai-key

# Logging
LOG_LEVEL=debug
LOKI_HOST=http://localhost:3100
```

### Local Database (Docker)

```bash
# Start PostgreSQL and Redis
docker run -d --name voxpage-postgres \
  -e POSTGRES_USER=voxpage \
  -e POSTGRES_PASSWORD=voxpage \
  -e POSTGRES_DB=voxpage_dev \
  -p 5432:5432 postgres:18

docker run -d --name voxpage-redis \
  -p 6379:6379 redis:7-alpine

# Run Prisma migrations
pnpm --filter @voxpage/server prisma:migrate:dev
```

## Project Structure

```
VoxPage/
├── packages/
│   ├── extension/      # Firefox extension (WXT)
│   ├── server/         # NestJS backend (Dokku)
│   └── shared/         # Shared types & constants
├── specs/              # Feature specifications
├── docs/               # Documentation
├── CLAUDE.md           # Development guidelines
├── pnpm-workspace.yaml # Workspace definition
├── tsconfig.base.json  # Shared TypeScript config
└── biome.json          # Shared linter config
```

## Key Architecture Patterns

### Hexagonal Architecture (Both Extension & Server)

```
core/       → Pure business logic (no framework imports)
ports/      → Dependency contracts (interfaces/abstract classes)
adapters/   → Concrete implementations
composition/→ DI container (extension) / modules (server)
handlers/   → Message handlers (extension) / controllers (server)
```

### Result Type

All fallible operations return `Result<T, E>` instead of throwing:

```typescript
import { Ok, Err, Result, isOk } from '@voxpage/shared';

function divide(a: number, b: number): Result<number, string> {
  if (b === 0) return Err('Division by zero');
  return Ok(a / b);
}

const result = divide(10, 2);
if (isOk(result)) {
  console.log(result.value); // 5
}
```

### Shared Types

```typescript
import { SubscriptionTier, TIER_CREDITS, PROVIDER_COSTS } from '@voxpage/shared';

const credits = TIER_CREDITS[SubscriptionTier.Pro]; // number
const cost = PROVIDER_COSTS['openai']; // per-character cost
```

## Deployment

### Deploy Server to Dokku

```bash
# Add Dokku remote (first time)
git remote add dokku dokku@ProxMox.Dokku:voxpage-api

# Deploy
git push dokku main

# Check health
curl https://voxpage-api.home301server.com.br/health
```

### Deploy Extension

```bash
# Build extension
pnpm --filter @voxpage/extension build:firefox

# Package as .xpi
pnpm --filter @voxpage/extension zip:firefox

# Submit to AMO or self-distribute
```

## Troubleshooting

### NestJS DI errors ("Can't resolve dependencies")

This usually means `@nestjs/core` is duplicated in node_modules. Ensure `.npmrc` has:

```ini
public-hoist-pattern[]=@nestjs/*
```

Then delete `node_modules` and reinstall: `rm -rf node_modules && pnpm install`

### Extension tests fail after migration

Ensure all path aliases in `jest.config.js` and `tsconfig.json` are updated relative to `packages/extension/`.

### Prisma client not found

Run `pnpm --filter @voxpage/server prisma:generate` after installing dependencies.

### WXT types missing

Run `pnpm --filter @voxpage/extension postinstall` (runs `wxt prepare`).
