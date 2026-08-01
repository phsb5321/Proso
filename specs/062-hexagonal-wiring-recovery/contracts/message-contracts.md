# Message Contracts: 062-hexagonal-wiring-recovery

**Date**: 2026-02-08

These contracts define the exact message shapes that MUST match between senders and receivers.

## Contract 1: Highlight Message (Background → Content)

**Sender**: `HighlightSyncAdapter.highlightParagraph()` in `src/adapters/messaging/highlight-sync.adapter.ts`
**Receiver**: `case 'highlight'` in `src/entrypoints/content.ts` (line 998)

```typescript
// MUST match HighlightMessage interface in content.ts
interface HighlightMessageContract {
  type: 'highlight';       // message discriminator
  index: number;           // paragraph index (NOT paragraphIndex)
  text: string;            // paragraph text for DOM matching
  timestamp: number;       // Date.now() for freshness checking
  scroll?: boolean;        // whether to scroll into view
}
```

**Current adapter sends**: `{ type: 'highlight', paragraphIndex, scroll }` — WRONG
**Required**: `{ type: 'highlight', index, text, timestamp, scroll }`

---

## Contract 2: Footer State Update (Background → Content)

**Sender**: `HighlightSyncAdapter.updateFooterState()` in `src/adapters/messaging/highlight-sync.adapter.ts`
**Receiver**: `case 'FOOTER_STATE_UPDATE'` in `src/entrypoints/content.ts` (line 1122)

```typescript
// MUST match FooterStateMessage interface in content.ts
interface FooterStateUpdateContract {
  type: 'FOOTER_STATE_UPDATE';   // message discriminator
  status?: string;               // 'playing' | 'paused' | 'stopped' | 'loading'
  progress?: number;             // 0.0 to 1.0
  currentTime?: string;          // formatted time e.g. "1:23" (NOT currentText)
  totalTime?: string;            // formatted time e.g. "5:47"
  currentParagraph?: number;     // 0-based paragraph index
  totalParagraphs?: number;      // total paragraphs in document
  speed?: number;                // playback speed multiplier
}
```

**Current adapter sends**: `{ ..., currentText, ... }` — WRONG (should be `currentTime`)
**Missing fields**: `totalTime`

---

## Contract 3: Language Detection (Content → Background)

**Sender**: `sendLanguageDetectionRequest()` in `src/entrypoints/content.ts` (line 617)
**Receiver**: Background message listener in `src/entrypoints/background.ts`

```typescript
// Content script sends this format (legacy action field)
interface LanguageDetectedContract {
  action: 'languageDetected';    // legacy action field (NOT type)
  metadata: {
    htmlLang?: string;           // from <html lang="...">
    metaLang?: string;           // from <meta> tags
  };
  textSample: string;            // sample text for franc-min analysis
  url: string;                   // page URL for per-tab state
}
```

**Current state**: No handler registered for `languageDetected`.
**Required**: Background must bridge `action: 'languageDetected'` → `language.detect` handler, passing `sender.tab.id`.

---

## Contract 4: Provider Select (Popup → Background)

**Sender**: Provider dropdown handler in `src/entrypoints/popup/main.ts`
**Receiver**: `provider.select` handler in `src/handlers/provider.handlers.ts`

```typescript
// Popup should send TWO messages for provider change:
// 1. Persist: { type: 'settings.update', provider: '...' }
// 2. Reconfigure: { type: 'provider.select', provider: '...' }

interface ProviderSelectContract {
  type: 'provider.select';
  provider: string;              // 'browser' | 'elevenlabs' | 'openai' | 'groq' | 'cartesia'
}
```

**Current popup sends**: Only `settings.update` (persist-only, no reconfiguration)
**Required**: Also send `provider.select`

---

## Contract 5: Speed Change (Popup → Background)

**Sender**: Speed control in `src/entrypoints/popup/main.ts`
**Receiver**: `playback.setSpeed` handler in `src/handlers/playback.handlers.ts`

```typescript
// Popup should send TWO messages for speed change:
// 1. Persist: { type: 'settings.update', speed: 1.5 }
// 2. Runtime: { type: 'playback.setSpeed', speed: 1.5 }

interface PlaybackSetSpeedContract {
  type: 'playback.setSpeed';
  speed: number;                 // 0.25 to 4.0
}
```

**Current popup sends**: Only `settings.update` (persist-only, no runtime effect)
**Required**: Also send `playback.setSpeed`

---

## Contract 6: Dispatch Response Discrimination

**Caller**: Background message dispatcher in `src/entrypoints/background.ts`
**Implementation**: `dispatchToHexagonal()` in `src/background/init-hexagonal.ts`

```typescript
// dispatchToHexagonal returns:
type DispatchResult<T> =
  | T                                         // Handler succeeded, return value
  | null                                      // Handler NOT FOUND → try legacy
  | { _hexError: true; error: string }        // Handler FOUND but FAILED → don't try legacy

// Caller checks:
const result = await dispatchToHexagonal(type, data);
if (result === null) {
  // Handler not found → try legacy fallback
} else if (result && typeof result === 'object' && '_hexError' in result) {
  // Handler found but failed → return error to caller
} else {
  // Handler succeeded → return result
}
```

**Current behavior**: Both "not found" and "handler error" return `null` — indistinguishable.

---

## Contract 7: Tab ID Forwarding

**Sender**: Background message listener in `src/entrypoints/background.ts`
**Receiver**: Handlers that need per-tab state (language, footer)

```typescript
// Background enriches dispatch data with sender tab ID:
interface EnrichedHandlerData {
  __tabId?: number;              // injected by background from sender.tab?.id
  [key: string]: unknown;        // original message data
}
```

**Current behavior**: `sender.tab.id` is available in the message listener but NOT forwarded to `dispatchToHexagonal()`.
**Required**: Inject `__tabId` into data before dispatch.
