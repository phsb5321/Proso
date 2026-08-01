# Data Model: Extension Quality Sprint

**Feature**: 063-extension-quality-sprint
**Date**: 2026-02-09

## Entities

### MessagePayload (enhanced)

Represents a validated message exchanged between extension contexts.

```typescript
// Existing: all messages pass through as `unknown` params
// New: validated at handler boundaries using Zod schemas

interface ValidatedMessagePayload<T> {
  readonly type: string;            // Canonical dot-notation name (e.g., 'playback.start')
  readonly params: T;               // Runtime-validated params
  readonly __validated: true;       // Discriminator for validated messages
}

interface MessageError {
  readonly success: false;
  readonly error: string;           // Human-readable error message
  readonly code?: string;           // Machine-readable error code
  readonly field?: string;          // Specific field that failed validation
}
```

### ProviderId (expanded)

Currently: `'elevenlabs' | 'browser'`
After: `'elevenlabs' | 'browser' | 'openai' | 'groq' | 'cartesia'`

```typescript
// src/core/shared/errors.ts — line 13
export type ProviderId = 'elevenlabs' | 'browser' | 'openai' | 'groq' | 'cartesia';

// src/utils/config/schema.ts — line 24
export const PROVIDERS = ['elevenlabs', 'browser', 'openai', 'groq', 'cartesia'] as const;
```

### ApiKeys (expanded)

Currently only tracks `elevenlabs` key. Must expand for all API-based providers.

```typescript
// src/composition/types.ts
export interface ApiKeys {
  readonly elevenlabs: string | null;
  readonly openai: string | null;
  readonly groq: string | null;
  readonly cartesia: string | null;
}
```

### AudioGeneratorAdapter (new adapters)

Three new adapters implementing `IAudioGenerator` port interface:

| Adapter | Provider | Playback Mode | Word Timing | Languages |
|---------|----------|---------------|-------------|-----------|
| `OpenAiAudioAdapter` | openai | blob | No | All (*) |
| `GroqAudioAdapter` | groq | blob | No | English only |
| `CartesiaAudioAdapter` | cartesia | blob | No | English only |

All adapters wrap existing legacy `ITTSProvider` implementations from `src/utils/providers/`.

### HandlerValidationSchema

Per-handler Zod schemas for runtime param validation:

```typescript
// Example: playback.start handler
const playbackStartSchema = z.object({
  tabId: z.number().int().positive(),
  paragraphIndex: z.number().int().nonneg().optional(),
  mode: z.enum(['selection', 'article', 'full']).optional(),
});

// Applied at handler boundary:
function handlePlaybackStart(params: unknown): Promise<Result<...>> {
  const parsed = playbackStartSchema.safeParse(params);
  if (!parsed.success) {
    return Err({ success: false, error: parsed.error.message });
  }
  // Use parsed.data with full type safety
}
```

### MessageNameBridge

Mapping from legacy SCREAMING_SNAKE names to canonical dot-notation:

```typescript
const MESSAGE_BRIDGE: Record<string, string> = {
  'FOOTER_SHOW':           'footer.show',
  'FOOTER_HIDE':           'footer.hide',
  'FOOTER_STATE_UPDATE':   'footer.stateUpdate',
  'FOOTER_ACTION':         'footer.action',
  'TOGGLE_FOOTER_SETTINGS':'footer.toggleSettings',
  'languageDetected':      'language.detect',
  // ... all legacy names mapped
};
```

## Relationships

```
ProviderId ─── 1:1 ──→ IAudioGenerator adapter
ProviderId ─── 1:1 ──→ ApiKeys entry
HandlerRegistry ─── 1:N ──→ Handler (validated via schema)
Handler ─── uses ──→ HandlerValidationSchema
MessagePayload ─── bridges via ──→ MessageNameBridge
```

## Invariants

1. Every handler parameter MUST be validated against a Zod schema before processing
2. Every ProviderId value MUST have a corresponding factory case and adapter
3. Every legacy message name MUST have exactly one bridge mapping to dot-notation
4. Audio adapters returning `playbackMode: 'direct'` MUST provide `onEndPromise`
5. Audio adapters returning `playbackMode: 'blob'` MUST return non-empty `audioBlob`
6. No API key metadata (length, prefix) shall appear in any logging statement
