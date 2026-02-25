# Multi-stage build for Proso API server
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
RUN pnpm install --frozen-lockfile --filter @proso/server...

# Stage 3: Build
FROM deps AS build
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY tsconfig.base.json ./
# Build shared package first (produces CJS in packages/shared/dist/)
RUN pnpm --filter @proso/shared run build
RUN pnpm --filter @proso/server exec prisma generate
RUN pnpm --filter @proso/server run build
# Create a pruned production deployment
RUN pnpm --filter @proso/server deploy --prod --legacy /app/pruned

# Stage 4: Production
FROM node:22-slim AS production
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy pruned deployment (includes all production deps)
COPY --from=build --chown=nestjs:nodejs /app/pruned/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/pruned/package.json ./
# Copy built output
COPY --from=build --chown=nestjs:nodejs /app/packages/server/dist ./dist
# Copy generated Prisma client (used by compiled TS)
COPY --from=build --chown=nestjs:nodejs /app/packages/server/src/generated ./src/generated
# Copy prisma schema for migrations
COPY --from=build --chown=nestjs:nodejs /app/packages/server/prisma ./prisma
# Copy predeploy script (used by Dokku predeploy task)
COPY --from=build --chown=nestjs:nodejs /app/packages/server/scripts ./scripts

USER nestjs

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:5000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]
