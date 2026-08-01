# Contract: Message Validation

**Feature**: 063-extension-quality-sprint
**Covers**: FR-001, FR-002, FR-003, FR-004, FR-005

## Handler Param Validation (FR-001)

Every handler registered in `HandlerRegistry` MUST validate incoming params before processing:

```typescript
// Pattern for all handlers:
async function handleFoo(params: unknown): Promise<FooResponse> {
  const parsed = fooParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message, code: 'VALIDATION_ERROR' };
  }
  // Process with parsed.data (fully typed)
}
```

### Handlers requiring schemas (by prefix):

| Prefix | Handler File | Handlers |
|--------|-------------|----------|
| `playback.*` | `playback.handlers.ts` | start, pause, resume, stop, next, prev, setSpeed, setMode |
| `cache.*` | `cache.handlers.ts` | getStats, clear, clearUrl, check, get, set |
| `settings.*` | `settings.handlers.ts` | get, update, getApiKeys, setApiKey |
| `provider.*` | `provider.handlers.ts` | select, getVoices, validateKey |
| `footer.*` | `footer.handlers.ts` | show, hide, stateUpdate, action, toggleSettings |
| `content.*` | `content.handlers.ts` | extract, getStatus |
| `language.*` | `language.handlers.ts` | detect, getState, setOverride, clearOverride |
| `export.*` | `export.handlers.ts` | start, getProgress, cancel |
| `queue.*` | `queue.handlers.ts` | add, remove, getAll, reorder |
| `audio.*` | `audio.handlers.ts` | generate, getUrl |
| `highlight.*` | `highlight.handlers.ts` | update, clear |
| `prefetch.*` | `prefetch.handlers.ts` | start, status |
| `reader.*` | `reader.handlers.ts` | getContent |
| `logging.*` | `logging.handlers.ts` | setLevel, flush |
| `debug.*` | `debug.handlers.ts` | getState, reset |

## Popup Response Validation (FR-002)

The popup MUST validate responses from background using Zod:

```typescript
// Replace: const result = response as T;
// With:
const parsed = responseSchema.safeParse(response);
if (!parsed.success) {
  showError('Unexpected response format');
  return;
}
const result = parsed.data;
```

## Structured Error Responses (FR-003)

All handlers MUST return structured errors (never throw unhandled):

```typescript
interface HandlerErrorResponse {
  success: false;
  error: string;       // Human-readable
  code?: string;       // Machine-readable (e.g., 'VALIDATION_ERROR', 'NOT_FOUND')
}
```

## Export Timeout (FR-004)

Export progress polling MUST enforce a 10-minute maximum:

```typescript
const EXPORT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
// Timer starts when export begins
// If timeout reached: stop polling, notify user, clean up resources
```

## Security: No Key Metadata Logging (FR-005)

No handler, adapter, or provider may log:
- API key values (full or partial)
- API key lengths
- API key prefixes
- Any data that could reconstruct or identify a key

Enforcement: Biome custom rule or grep-based CI check.
