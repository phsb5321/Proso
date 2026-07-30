# Build from the repository root:
# docker build -f services/proso-log-gateway/Dockerfile .
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/proso-log-gateway/package.json services/proso-log-gateway/package.json
RUN pnpm install --frozen-lockfile --filter @proso/log-gateway...

COPY services/proso-log-gateway/tsconfig.json services/proso-log-gateway/tsconfig.json
COPY services/proso-log-gateway/src services/proso-log-gateway/src
RUN pnpm --filter @proso/log-gateway build
RUN pnpm --filter @proso/log-gateway deploy --legacy --prod /prod/gateway

FROM node:22-alpine

WORKDIR /app

COPY --from=builder /prod/gateway ./
COPY --from=builder /workspace/services/proso-log-gateway/dist ./dist

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/health || exit 1

EXPOSE 3000

CMD ["node", "dist/index.js"]
