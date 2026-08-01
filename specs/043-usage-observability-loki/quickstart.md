# Spec 043: Quickstart Guide

## Overview

This spec implements full usage observability for VoxPage, tracking 100% of meaningful actions and reliably shipping them to Loki via a Dokku-hosted gateway.

## Prerequisites

1. **Dokku Host**: Access to a Dokku server for deploying the log gateway
2. **Loki Instance**: Running Loki instance accessible from Dokku
3. **VoxPage Dev Environment**: Standard VoxPage development setup

## Quick Implementation Path

### Phase 1: Core Telemetry Module (Day 1-2)

1. **Create types** (`src/utils/telemetry/usage/types.ts`):
   - Event types, LogLevel, EventGroup enums
   - UsageEvent interface
   - Config interfaces

2. **Create context provider** (`src/utils/telemetry/usage/context.ts`):
   - Generate/persist installId
   - Generate sessionId per session
   - Detect entrypoint context

3. **Create buffer** (`src/utils/telemetry/usage/buffer.ts`):
   - IndexedDB ring buffer
   - Size limits and TTL cleanup

4. **Create shipper** (`src/utils/telemetry/usage/shipper.ts`):
   - HTTP client with retry/backoff
   - Circuit breaker pattern

5. **Create tracker** (`src/utils/telemetry/usage/tracker.ts`):
   - Main UsageTracker class
   - Periodic flush
   - Error capture

### Phase 2: Gateway Service (Day 2-3)

1. **Create service scaffold** (`services/voxpage-log-gateway/`):
   ```bash
   mkdir -p services/voxpage-log-gateway/src/{middleware,routes,loki}
   ```

2. **Implement middleware**:
   - Auth (Bearer token)
   - Rate limiting
   - Validation (Zod)

3. **Implement Loki client**:
   - Transform events to Loki format
   - Push to Loki API

4. **Deploy to Dokku**:
   ```bash
   dokku apps:create voxpage-log-gateway
   dokku config:set voxpage-log-gateway LOKI_URL=http://loki:3100 GATEWAY_TOKEN=<secret>
   git push dokku main
   ```

### Phase 3: Extension Integration (Day 3-4)

1. **Background script**:
   ```typescript
   import { usageTracker } from '../utils/telemetry/usage';
   
   // Initialize on startup
   await usageTracker.initialize({ enabled: true });
   usageTracker.track('background.started');
   ```

2. **Message handlers**:
   ```typescript
   registry.register('playback.start', async (params) => {
     usageTracker.track('playback.start_requested', { paragraphs: params.paragraphs?.length });
     // ... handler logic ...
   });
   ```

3. **Popup/Options/Content**:
   - Track lifecycle events
   - Track user interactions

### Phase 4: Verification (Day 4-5)

1. **Manual testing**:
   - Open extension, perform actions
   - Query Loki for events
   
2. **E2E tests**:
   - Playwright test that verifies events arrive in Loki

## File Structure

```
src/utils/telemetry/usage/
├── index.ts              # Public exports
├── types.ts              # TypeScript types
├── context.ts            # Context provider
├── redaction.ts          # Sensitive data redaction
├── buffer.ts             # IndexedDB buffer
├── shipper.ts            # HTTP shipper
├── tracker.ts            # Main tracker class
└── error-capture.ts      # Global error handlers

services/voxpage-log-gateway/
├── Dockerfile
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── rate-limit.ts
│   │   └── validate.ts
│   ├── routes/
│   │   └── ingest.ts
│   └── loki/
│       └── client.ts
└── dokku.yml
```

## Key APIs

### UsageTracker

```typescript
import { usageTracker } from '../utils/telemetry/usage';

// Initialize (call once in each context)
await usageTracker.initialize({
  enabled: true,
  gatewayUrl: 'https://voxpage-log-gateway.example.com',
  gatewayToken: 'sk_xxxxx',
});

// Track an event
usageTracker.track('popup.opened');

// Track with data
usageTracker.track('playback.start_requested', { paragraphs: 15 });

// Track with level and actionId
usageTracker.track('error.handler_exception', 
  { handler: 'playback.start', message: 'Failed' },
  'error',
  { actionId: crypto.randomUUID() }
);

// Set provider context
usageTracker.setProvider('elevenlabs');

// Force flush
await usageTracker.flush();
```

### Gateway API

```bash
# Ingest events
curl -X POST https://voxpage-log-gateway.example.com/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_xxxxx" \
  -d '{"events": [...]}'

# Health check
curl https://voxpage-log-gateway.example.com/health
```

### Loki Queries

```bash
# Query by session
./scripts/loki/query-session.sh <sessionId>

# Query errors
./scripts/loki/query-errors.sh 1h

# Full LogQL
curl -G "http://loki:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={app="voxpage"} | json | sessionId="abc123"'
```

## Configuration

### Extension (environment variables)

```bash
VITE_TELEMETRY_ENABLED=true
VITE_TELEMETRY_GATEWAY_URL=https://voxpage-log-gateway.example.com
VITE_TELEMETRY_GATEWAY_TOKEN=sk_xxxxx
VITE_TELEMETRY_ENVIRONMENT=dev
```

### Gateway (Dokku config)

```bash
dokku config:set voxpage-log-gateway \
  LOKI_URL=http://loki:3100 \
  GATEWAY_TOKEN=sk_xxxxx \
  PORT=3000 \
  RATE_LIMIT_MAX_REQUESTS=100
```

## Verification Checklist

- [ ] Events appear in browser console (debug mode)
- [ ] Events appear in Loki within 60s
- [ ] Session can be reconstructed from Loki
- [ ] Error events trigger immediate flush
- [ ] Buffer persists across browser restart
- [ ] Circuit breaker opens on gateway failure
- [ ] API keys are redacted from all logs
