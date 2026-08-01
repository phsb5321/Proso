# Handler Registry API Contract

**Feature**: 034-hexagonal-architecture  
**Version**: 1.0.0  
**Date**: 2026-01-07

## Overview

This contract defines the internal API for the handler registry and dispatch system. It is not an external HTTP API but rather an internal TypeScript interface contract.

---

## HandlerRegistry Interface

### register

Register a handler for a message type.

```typescript
register<TParams, TResponse>(
  name: string,
  handler: Handler<TParams, TResponse>,
  description?: string
): void
```

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | `string` | Yes | Handler name (e.g., `playback.start`) |
| `handler` | `Handler` | Yes | Async function to handle the message |
| `description` | `string` | No | Documentation for introspection |

**Behavior**:
- Overwrites existing handler with warning log
- Name should match pattern `^[a-z]+\.[a-zA-Z]+$`

---

### dispatch

Route a message to the appropriate handler.

```typescript
dispatch<TParams, TResponse>(
  name: string,
  params: TParams
): Promise<Result<TResponse, HandlerError>>
```

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | `string` | Yes | Handler name to dispatch to |
| `params` | `TParams` | Yes | Parameters passed to handler |

**Returns**: `Result<TResponse, HandlerError>`

**Error Types**:
```typescript
type HandlerError =
  | { type: 'not_found'; handlerName: string }
  | { type: 'execution_failed'; handlerName: string; message: string };
```

---

### getHandlerNames

Get list of all registered handler names.

```typescript
getHandlerNames(): string[]
```

**Returns**: Array of handler names, sorted alphabetically.

---

### getHandlersByPrefix

Group handlers by domain prefix.

```typescript
getHandlersByPrefix(): Map<string, string[]>
```

**Returns**: Map where keys are domain prefixes (e.g., `playback`, `cache`) and values are arrays of handler names.

---

## Message Type Translations

The Strangler Fig dispatch uses a translation map for backward compatibility.

### Legacy to Hexagonal Mapping

```yaml
# Playback domain
startPlayback: playback.start
pausePlayback: playback.pause
stopPlayback: playback.stop
getPlaybackState: playback.getState
nextParagraph: playback.next
previousParagraph: playback.previous
seekToPosition: playback.seek
setSpeed: playback.setSpeed

# Audio domain
getVoices: audio.getVoices
setVoice: audio.setVoice
testApiKey: audio.validateCredentials
audio.generate: audio.generate

# Provider domain
provider.select: provider.select
provider.getList: provider.getList
validateLanguageSupport: provider.validateLanguage

# Settings domain
settings.get: settings.get
settings.update: settings.update
settings.migrate: settings.migrate

# Footer domain
FOOTER_ACTION: footer.action
FOOTER_SHOW: footer.show
FOOTER_HIDE: footer.hide
FOOTER_STATE_UPDATE: footer.stateUpdate

# Cache domain
getCachedParagraphs: cache.getCachedParagraphs
cost.estimate: cost.estimate

# Prefetch domain
prefetch.start: prefetch.start
prefetch.stop: prefetch.stop
prefetch.getStatus: prefetch.getStatus
prefetch.clearBuffer: prefetch.clearBuffer

# PDF domain
pdf.detected: pdf.detected
pdf.extract: pdf.extract
pdf.ocr: pdf.ocr

# Queue domain
queue.add: queue.add
queue.remove: queue.remove
queue.getState: queue.getState
```

---

## Telemetry API

### hexagonal.getDispatchStats

Get aggregated dispatch statistics.

**Request**: `{ type: 'hexagonal.getDispatchStats' }`

**Response**:
```typescript
{
  total: number;        // Total messages dispatched
  hex: number;          // Handled by hexagonal path
  legacy: number;       // Handled by legacy path
  hexPercent: number;   // Percentage using hex path
  byDomain: {
    [domain: string]: {
      hex: number;
      legacy: number;
      total: number;
    }
  }
}
```

---

### hexagonal.getStatus

Get current hexagonal architecture status.

**Request**: `{ type: 'hexagonal.getStatus' }`

**Response**:
```typescript
{
  initialized: boolean;
  adapters: string[];           // Adapter class names
  services: string[];           // Service class names
  registeredHandlers: string[]; // Handler names
  handlerCount: number;
  legacyHandlerCount: number;   // Remaining in messageHandlers{}
}
```

---

## Feature Flag API

### Storage Keys

Feature flags are stored in `browser.storage.local`:

```yaml
USE_LEGACY_PLAYBACK: boolean   # Default: false
USE_LEGACY_AUDIO: boolean      # Default: false
USE_LEGACY_SETTINGS: boolean   # Default: false
USE_LEGACY_FOOTER: boolean     # Default: false
USE_LEGACY_CACHE: boolean      # Default: false
USE_LEGACY_PDF: boolean        # Default: false
USE_LEGACY_QUEUE: boolean      # Default: false
```

### Reading Flags

```typescript
const flags = await browser.storage.local.get([
  'USE_LEGACY_PLAYBACK',
  'USE_LEGACY_AUDIO',
  // ... etc
]);
```

### Setting Flags (Debug/Rollback)

```typescript
await browser.storage.local.set({ USE_LEGACY_PLAYBACK: true });
```

---

## Contract Test Requirements

All handlers must pass these contract tests:

### 1. Registration Contract

```typescript
describe('handler registration', () => {
  it('registers without error', () => {
    registry.register('test.handler', async () => ({}));
    expect(registry.has('test.handler')).toBe(true);
  });
  
  it('appears in getHandlerNames()', () => {
    expect(registry.getHandlerNames()).toContain('test.handler');
  });
});
```

### 2. Dispatch Contract

```typescript
describe('handler dispatch', () => {
  it('returns Ok on successful execution', async () => {
    registry.register('test.success', async () => ({ value: 42 }));
    const result = await registry.dispatch('test.success', {});
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ value: 42 });
  });
  
  it('returns Err for unknown handler', async () => {
    const result = await registry.dispatch('unknown.handler', {});
    expect(result.ok).toBe(false);
    expect(result.error.type).toBe('not_found');
  });
  
  it('returns Err on handler exception', async () => {
    registry.register('test.throws', async () => { throw new Error('oops'); });
    const result = await registry.dispatch('test.throws', {});
    expect(result.ok).toBe(false);
    expect(result.error.type).toBe('execution_failed');
  });
});
```

### 3. Domain Grouping Contract

```typescript
describe('handler grouping', () => {
  it('groups by prefix correctly', () => {
    registry.register('playback.start', async () => {});
    registry.register('playback.stop', async () => {});
    registry.register('cache.get', async () => {});
    
    const groups = registry.getHandlersByPrefix();
    expect(groups.get('playback')).toEqual(['playback.start', 'playback.stop']);
    expect(groups.get('cache')).toEqual(['cache.get']);
  });
});
```
