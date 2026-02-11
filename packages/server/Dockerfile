# Multi-stage build for VoxPage API server
# Optimized for Dokku deployment with pnpm workspaces

# Stage 1: Base with pnpm
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Stage 2: Install dependencies
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --filter @voxpage/server...

# Stage 3: Build
FROM deps AS build
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY tsconfig.base.json ./
RUN pnpm --filter @voxpage/server exec prisma generate
RUN pnpm --filter @voxpage/server run build

# Stage 4: Production
FROM node:22-slim AS production
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs
USER nestjs

# Copy built artifacts
COPY --from=build --chown=nestjs:nodejs /app/packages/server/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/packages/server/prisma ./prisma
COPY --from=build --chown=nestjs:nodejs /app/packages/server/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/packages/server/package.json ./
COPY --from=build --chown=nestjs:nodejs /app/node_modules/.pnpm node_modules/.pnpm

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:5000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]
