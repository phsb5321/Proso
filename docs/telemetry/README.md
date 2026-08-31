# Proso Telemetry System

> **Public-build status (31/08/2026): disabled.** The AMO build has no telemetry host permission, gateway configuration, settings toggle, or entrypoint initializer and declares only the required `websiteContent` transmission used for synthesis. The modules below remain as inactive historical/internal tooling; calls into the uninitialized tracker are no-ops.

This documentation covers the retained usage-telemetry implementation.

## Overview

The telemetry system consists of three main components:

1. **Client-Side Tracker** - Captures events in the browser extension
2. **Log Gateway** - Receives events and forwards to Loki
3. **Loki Storage** - Stores and indexes logs for querying

```
┌─────────────────────┐     ┌──────────────────┐     ┌─────────────┐
│ Proso Extension   │────▶│ Log Gateway      │────▶│ Loki        │
│ (UsageTracker)      │HTTP │ (Node.js/Dokku)  │     │             │
└─────────────────────┘     └──────────────────┘     └─────────────┘
```

## Privacy First

The telemetry system is designed with privacy as a core principle:

- **No Personal Data**: We never log names, emails, or account information
- **URL Hashing**: All URLs are SHA-256 hashed before logging
- **API Key Redaction**: API keys are automatically removed from all events
- **Public build disabled**: no user event is buffered or sent because the tracker is never initialized
- **Stable IDs Only**: We use randomly-generated install/session IDs, not user identifiers

## Quick Links

- [Event Catalog](./event-catalog.md) - Complete list of tracked events
- [Debugging Guide](./debugging.md) - How to query and debug telemetry
- [Rollout Plan](./rollout.md) - Gradual rollout strategy

## Architecture

### Client Components

| Module | Location | Purpose |
|--------|----------|---------|
| `types.ts` | `src/utils/telemetry/usage/` | Event types and Zod schemas |
| `context.ts` | `src/utils/telemetry/usage/` | Install/session ID management |
| `redaction.ts` | `src/utils/telemetry/usage/` | Sensitive data removal |
| `buffer.ts` | `src/utils/telemetry/usage/` | IndexedDB ring buffer |
| `shipper.ts` | `src/utils/telemetry/usage/` | HTTP transport with retry |
| `tracker.ts` | `src/utils/telemetry/usage/` | Main tracker singleton |
| `error-capture.ts` | `src/utils/telemetry/usage/` | Global error handling |

### Gateway Service

Located at `services/proso-log-gateway/`:

- Express.js server deployed on Dokku
- Bearer token authentication
- Rate limiting (60 req/min per IP)
- Schema validation with helpful errors
- Forwards to Loki with low-cardinality labels

## Configuration

### Extension Settings

Telemetry is configured via `browser.storage.local`:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `telemetryEnabled` | boolean | `false` | Retained storage-schema field; the public UI does not expose it |
| `telemetryGatewayUrl` | string | unset | No public-build gateway is seeded |
| `telemetryGatewayToken` | string | unset | No public-build credential is seeded |

### Environment Variables (Gateway)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Server port |
| `GATEWAY_TOKEN` | Yes (prod) | - | Bearer token |
| `LOKI_URL` | No | `http://loki.web.1:3100` | Loki push URL |
| `LOKI_USER` | No | - | Loki basic auth user |
| `LOKI_PASSWORD` | No | - | Loki basic auth password |
| `RATE_LIMIT_RPM` | No | `60` | Requests per minute |
| `NODE_ENV` | No | `development` | Environment |

## Event Flow

1. **Track**: Code calls `usageTracker.track('event.name', { data })`
2. **Enrich**: Context added (installId, sessionId, entrypoint, version)
3. **Redact**: Sensitive data removed (API keys, URLs hashed)
4. **Buffer**: Event stored in IndexedDB ring buffer
5. **Batch**: Events batched (max 100 or 30s interval)
6. **Ship**: HTTP POST to gateway with gzip compression
7. **Validate**: Gateway validates schema
8. **Forward**: Gateway pushes to Loki
9. **Index**: Loki indexes by labels (entrypoint, level, eventGroup)

## Reliability Features

### Circuit Breaker

If the gateway becomes unavailable:

1. After 5 consecutive failures → circuit opens
2. No send attempts while circuit is open
3. After 60 seconds → circuit half-opens
4. Next successful send → circuit closes
5. Events continue buffering during outage

### Retry with Backoff

Failed sends are retried with exponential backoff:

- Base delay: 1 second
- Maximum delay: 30 seconds
- Jitter: ±10% randomization
- Max retries: 3 per batch

### Buffer Limits

- Maximum size: 10 MB
- Maximum age: 14 days
- Oldest events evicted when full

## Development

### Testing Telemetry Locally

1. Start the gateway in development mode:
   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @proso/log-gateway dev
   ```

2. Configure extension to use local gateway:
   ```javascript
   // In browser console (extension context)
   browser.storage.local.set({
     telemetryEnabled: true,
     telemetryGatewayUrl: 'http://localhost:3000',
     telemetryGatewayToken: 'dev-token'
   });
   ```

3. Set gateway token:
   ```bash
   export GATEWAY_TOKEN=dev-token
   ```

### Adding New Events

1. Add event type to `UsageEventTypes` in `types.ts`
2. Determine event group in `getEventGroup()` function
3. Track the event in appropriate code location:
   ```typescript
   usageTracker.track('category.action', {
     relevantField: value
   });
   ```

### Viewing Events

Query logs using the scripts in `scripts/loki/`:

```bash
# Query by session
./scripts/loki/query-session.sh <sessionId>

# Query errors
./scripts/loki/query-errors.sh 24h

# Query by install
./scripts/loki/query-user.sh <installId>
```

## Deployment

### Gateway Deployment (Dokku)

```bash
# Create app
dokku apps:create proso-log-gateway

# Set environment
dokku config:set proso-log-gateway \
  GATEWAY_TOKEN=<secure-token> \
  LOKI_URL=http://loki.web.1:3100 \
  NODE_ENV=production

# Deploy
git push dokku main
```

The gateway shares the repository's pinned pnpm version and lockfile. Its
Dockerfile must therefore use the repository root as its build context:

```bash
docker build -f services/proso-log-gateway/Dockerfile .
```

### Loki Setup

The gateway expects Loki to be available at the configured URL. Ensure:

1. Loki is running and accessible from gateway
2. Push endpoint available at `/loki/api/v1/push`
3. Query endpoint available at `/loki/api/v1/query_range`
