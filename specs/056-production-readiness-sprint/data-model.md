# Data Model: Production Readiness Sprint

**Branch**: `056-production-readiness-sprint` | **Date**: 2026-02-06

This document defines the key entities that are created, modified, or validated during this sprint. It does not introduce new database tables or storage schemas -- all entities use existing storage mechanisms (`browser.storage.local`, IndexedDB via Dexie, in-memory registries).

## Entity: Provider Configuration

The settings and credentials for a TTS provider. This sprint adds Browser TTS as a second valid provider and removes phantom providers from the UI.

### Current State

```typescript
// src/core/shared/errors.ts
type ProviderId = 'elevenlabs';

// src/utils/config/schema.ts
const PROVIDERS = ['elevenlabs'] as const;

// src/utils/messaging/schemas.ts
const providerIdSchema = z.enum(['elevenlabs']);
```

### Target State

```typescript
// src/core/shared/errors.ts
type ProviderId = 'elevenlabs' | 'browser';

// src/utils/config/schema.ts
const PROVIDERS = ['elevenlabs', 'browser'] as const;

// src/utils/messaging/schemas.ts
const providerIdSchema = z.enum(['elevenlabs', 'browser']);
```

### Storage

- **Location**: `browser.storage.local`
- **Keys**: `provider` (string), `voice` (string | null), `voiceId` (string | null), `speed` (number)
- **API keys**: `browser.storage.local` keyed by provider (e.g., `apiKey_elevenlabs`). Browser TTS has no API key.
- **Migration**: Settings migration v6 (new) must clean up orphaned keys from removed providers (OpenAI, Groq, Cartesia, Anthropic) and set `provider: 'browser'` for users who had no valid provider configured.

### Invariants

1. `ProviderId` MUST be exhaustively matched in all switch/case statements
2. Every provider in `PROVIDERS` MUST have a corresponding adapter in `src/composition/factories.ts`
3. Every provider in `PROVIDERS` MUST have metadata in `src/handlers/provider.handlers.ts`
4. The UI MUST only display providers present in `PROVIDERS`
5. When `provider === 'browser'`, credential validation always returns `true`

### Relationships

- `IAudioGenerator` port: One adapter per provider (`ElevenLabsAudioAdapter`, `BrowserTtsAudioAdapter`)
- `ISettingsStore` port: Stores the active `ProviderId` and associated voice/speed settings
- `Container`: `createAudioGeneratorAdapter()` factory selects adapter based on `ProviderId`

---

## Entity: Debug Log Entry

A structured log record with component tagging, stored in a circular buffer. This sprint formalizes the existing `LogEntry`/`LogBuffer` system and ensures production stripping.

### Current State (Already Defined)

```typescript
// src/utils/logging/entry.ts
interface LogEntry {
  timestamp: string;        // 19-digit nanosecond string
  level: LogLevel;          // 'debug' | 'info' | 'warn' | 'error'
  message: string;          // Max 8192 bytes
  component: Component;     // 'background' | 'content' | 'popup' | 'options'
  metadata?: Record<string, any> | null;  // Max 4096 bytes
}

// src/utils/logging/buffer.ts
interface LogBufferState {
  count: number;
  totalBytes: number;
  maxBytes: number;          // Default: 1MB
  maxEntries: number;
  lastFlushAttempt: number;
  consecutiveFailures: number;
}
```

### Target State (Sprint Changes)

The schema is already well-defined. Sprint work focuses on:

1. **Component tags expanded**: Consider adding `'handler'`, `'adapter'`, `'service'` to the `COMPONENTS` tuple for hexagonal architecture tracing
2. **Structured logging wrapper**: A `createLogger(component: Component)` factory that returns typed log methods (`debug()`, `info()`, `warn()`, `error()`) pre-bound to the component tag
3. **Production stripping**: Ensure `esbuild.drop: ['console', 'debugger']` in `wxt.config.ts` strips all debug logging in production builds. Validate via security build scan tests.

### Storage

- **Location**: In-memory circular buffer (`LogBuffer` class)
- **Persistence**: Optional save/load to `browser.storage.session` (transient)
- **Eviction**: Oldest entries evicted when buffer exceeds `maxBytes` (1MB) or `maxEntries`
- **Flush**: Batch flush to telemetry gateway via `UsageShipper`

### Invariants

1. Buffer MUST NOT exceed `maxBytes` (memory safety)
2. Production builds MUST contain zero `console.log` statements (verified by build scan)
3. Component tag MUST be present on every log entry (no untagged logs)
4. Circuit breaker MUST prevent flush storms when gateway is unreachable

---

## Entity: Handler Registration

The mapping between a message type string and its hexagonal handler function. Managed by `HandlerRegistry`.

### Current State

```typescript
// src/handlers/registry.ts
type Handler<TParams, TResponse> = (params: TParams) => Promise<TResponse>;

interface HandlerEntry {
  handler: Handler;
  description?: string;
}

// Registration pattern (src/handlers/index.ts → registerAllHandlers)
// Currently registers ~71 handlers across 12 domain groups
```

### Target State

After migration completion:

1. **All message types routed through handlers**: The `LEGACY_TO_HEXAGONAL_MAP` in `background.ts` must cover 100% of message types
2. **Migration flags all `false`**: `USE_LEGACY_PLAYBACK: false` (the last remaining legacy domain)
3. **Missing handlers created**: `export.*` (4), `summarize.*` (3), `language.*` (4), `logging.*` (3), `settings.getTheme/setTheme/resetSection` (3) = 17 new handlers
4. **Stubs deleted**: ~34 stubs in `src/utils/messaging/handlers/` with `TODO Phase 4` removed
5. **Real implementations preserved**: `queue.ts`, `cache-handlers.ts`, `export.ts`, `summarize.ts`, parts of `settings.ts` in `src/utils/messaging/handlers/` are kept (or their logic moves into hexagonal handlers)

### Registration Map (Target)

| Domain | Handler Count | File |
|--------|--------------|------|
| playback.* | 10 | `playback.handlers.ts` |
| audio.* | 4 | `audio.handlers.ts` |
| settings.* | 8 (+3) | `settings.handlers.ts` |
| provider.* | 3 | `provider.handlers.ts` |
| cache.* | 7 | `cache.handlers.ts` |
| prefetch.* | 4 | `prefetch.handlers.ts` |
| queue.* | 11 | `queue.handlers.ts` |
| footer.* | 6 | `footer.handlers.ts` |
| content.* | 4 | `content.handlers.ts` |
| debug.* | 5 | `debug.handlers.ts` |
| reader.* | 6 | `reader.handlers.ts` |
| highlight.* | 6 | `highlight.handlers.ts` |
| export.* | 4 (new) | `export.handlers.ts` |
| summarize.* | 3 (new) | `summarize.handlers.ts` |
| language.* | 4 (new) | `language.handlers.ts` |
| logging.* | 3 (new) | `logging.handlers.ts` |
| **Total** | **~88** | |

### Invariants

1. Every handler MUST return `Promise<T>` (async)
2. Handler names MUST follow the pattern `domain.action` (e.g., `playback.start`)
3. `registerAllHandlers()` MUST be called exactly once during init
4. `InstrumentedRegistry` MUST wrap all handler calls with telemetry timing

---

## Entity: Settings Migration

Version-tracked migration functions that transform stored settings between schema versions.

### Current State

```typescript
// src/utils/config/migrations.ts
const CURRENT_CONFIG_VERSION = 5;

interface Migration {
  version: number;
  key: string;
  description: string;
  migrate: MigrationFunction;
}

// Existing migrations:
// v2: Mode migration (selection/article/full normalization)
// v3: Theme migration (light/dark/system)
// v5: Provider normalization
```

### Target State (Sprint Addition)

Add migration v6 for provider cleanup:

```typescript
// Migration v6: Provider consolidation cleanup
{
  version: 6,
  key: 'provider-consolidation',
  description: 'Remove orphaned provider data from removed providers (OpenAI, Groq, Cartesia)',
  migrate: async (stored, save) => {
    const removedProviders = ['openai', 'groq', 'cartesia', 'anthropic'];
    const updates: Record<string, unknown> = {};

    // Clean up orphaned API keys
    for (const provider of removedProviders) {
      if (stored[`apiKey_${provider}`]) {
        updates[`apiKey_${provider}`] = undefined;
      }
    }

    // Reset provider to 'browser' if it was a removed provider
    if (removedProviders.includes(stored.provider as string)) {
      updates.provider = 'browser';
      updates.voice = null;
      updates.voiceId = null;
    }

    if (Object.keys(updates).length > 0) {
      await save(updates);
    }

    return { ...stored, ...updates, _configVersion: 6 };
  }
}
```

### Invariants

1. Migrations MUST be idempotent (safe to re-run)
2. Migrations MUST NOT delete user data without explicit user action (orphaned keys are cleared silently since the providers no longer exist)
3. `CURRENT_CONFIG_VERSION` MUST equal the highest migration version
4. `applyMigrations()` MUST run all pending migrations in order on extension update

---

## Entity: Telemetry Configuration

Runtime configuration for the telemetry gateway, seeded at install time from build-time constants.

### Current State

Hardcoded fallback token in 3 source files (security issue).

### Target State

```typescript
// Stored in browser.storage.local (seeded by background.ts onInstalled)
interface TelemetryConfig {
  telemetryGatewayUrl: string;    // Build-time injected, stored at install
  telemetryGatewayToken: string;  // Build-time injected, stored at install
  telemetryEnabled: boolean;      // User-controlled opt-out
}

// Build-time constants (wxt.config.ts vite.define)
declare const __TELEMETRY_GATEWAY_URL__: string;
declare const __TELEMETRY_GATEWAY_TOKEN__: string;
```

### Storage

- **Location**: `browser.storage.local`
- **Seeding**: `background.ts` `runtime.onInstalled` writes build-time values if not already present
- **Reading**: All entrypoints read from storage (matching existing `content.ts` pattern)
- **Opt-out**: `telemetryEnabled: false` skips all telemetry operations

### Invariants

1. No source file MUST contain a hardcoded token (enforced by security build scan)
2. All entrypoints MUST gracefully handle missing telemetry config (skip, don't crash)
3. User opt-out (`telemetryEnabled: false`) MUST prevent all data transmission
