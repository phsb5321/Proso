# Data Model: Hexagonal Architecture

**Feature**: 034-hexagonal-architecture
**Date**: 2026-01-06

## Overview

This document defines the domain entities, port interfaces, and type relationships for the hexagonal architecture refactoring. The model follows these principles:

1. **Domain entities** are pure data structures with no external dependencies
2. **Port interfaces** define contracts without implementation details
3. **Result types** make error handling explicit
4. **Existing Zod schemas** are preserved and reused where applicable

---

## Domain Layer (src/core/)

### PlaybackState Entity

Immutable state model for playback orchestration.

```typescript
// core/playback/playback-state.ts

export interface PlaybackState {
  readonly status: PlaybackStatus;
  readonly currentParagraphIndex: number;
  readonly totalParagraphs: number;
  readonly paragraphs: readonly string[];
  readonly progress: number; // 0-1 within current paragraph
  readonly speed: number;
  readonly provider: ProviderId;
  readonly voice: string | null;
  readonly mode: ExtractionMode;
  readonly activeTabId: number | null;
  readonly currentPageUrl: string | null;
  readonly error: PlaybackError | null;
}

export type PlaybackStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'stopped'
  | 'error';

export type ExtractionMode = 'selection' | 'article' | 'full';

export type ProviderId =
  | 'openai'
  | 'elevenlabs'
  | 'cartesia'
  | 'groq'
  | 'browser';
```

**State Transitions**:

```
idle → loading (start playback)
loading → playing (audio ready)
loading → error (generation failed)
playing → paused (user pauses)
paused → playing (user resumes)
playing → loading (next paragraph)
playing → stopped (user stops / end of content)
* → idle (reset)
```

**Validation Rules**:
- `currentParagraphIndex` must be 0 ≤ index < totalParagraphs
- `progress` must be 0 ≤ progress ≤ 1
- `speed` must be 0.5 ≤ speed ≤ 2.0
- `paragraphs` must not be empty when status is not 'idle'

---

### PlaybackError Entity

Typed errors for domain layer.

```typescript
// core/shared/errors.ts

export type PlaybackError =
  | { type: 'audio_generation'; provider: ProviderId; message: string }
  | { type: 'no_content'; mode: ExtractionMode }
  | { type: 'invalid_paragraph_index'; index: number; max: number }
  | { type: 'tab_not_found'; tabId: number }
  | { type: 'provider_unavailable'; provider: ProviderId };

export type ContentExtractionError =
  | { type: 'no_readable_content' }
  | { type: 'extraction_failed'; message: string }
  | { type: 'invalid_selection' }
  | { type: 'dom_access_denied' };

export type CacheError =
  | { type: 'storage_full'; currentSize: number; maxSize: number }
  | { type: 'entry_not_found'; key: string }
  | { type: 'serialization_failed'; message: string }
  | { type: 'database_error'; message: string };
```

---

### Result Type

Generic result type for explicit error handling.

```typescript
// core/shared/result.ts

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}
```

---

### ExtractedContent Entity

Result of content extraction.

```typescript
// core/content-extraction/extracted-content.ts

export interface ExtractedContent {
  readonly paragraphs: readonly Paragraph[];
  readonly totalCharacters: number;
  readonly extractionTimeMs: number;
  readonly sourceUrl: string;
  readonly title: string | null;
}

export interface Paragraph {
  readonly text: string;
  readonly index: number;
  readonly type: 'paragraph' | 'heading' | 'list';
  readonly characterCount: number;
}

export interface ContentScore {
  readonly score: number;
  readonly paragraphCount: number;
  readonly linkDensity: number;
  readonly headingCount: number;
}
```

---

## Port Interfaces (src/ports/)

### IAudioGenerator Port

Port for TTS audio generation.

```typescript
// ports/audio-generator.port.ts

export interface IAudioGenerator {
  /**
   * Generate audio from text
   */
  generateAudio(request: AudioRequest): Promise<Result<AudioResponse, AudioError>>;

  /**
   * Get available voices for a language
   */
  getVoices(language?: string): Promise<Result<Voice[], AudioError>>;

  /**
   * Check if provider credentials are valid
   */
  validateCredentials(): Promise<boolean>;

  /**
   * Provider identifier
   */
  readonly providerId: ProviderId;

  /**
   * Whether this provider supports word-level timing
   */
  readonly supportsWordTiming: boolean;
}

export interface AudioRequest {
  readonly text: string;
  readonly voice: string | null;
  readonly speed: number;
  readonly language: string | null;
}

export interface AudioResponse {
  readonly audioBlob: Blob;
  readonly durationMs: number;
  readonly wordTimings: readonly WordTiming[] | null;
}

export interface WordTiming {
  readonly word: string;
  readonly startMs: number;
  readonly endMs: number;
}

export interface Voice {
  readonly id: string;
  readonly name: string;
  readonly language: string | null;
  readonly gender: 'male' | 'female' | 'neutral' | null;
}

export type AudioError =
  | { type: 'network'; message: string }
  | { type: 'rate_limit'; retryAfterMs: number }
  | { type: 'invalid_credentials' }
  | { type: 'unsupported_language'; language: string }
  | { type: 'text_too_long'; maxLength: number }
  | { type: 'provider_error'; code: string; message: string };
```

---

### ICacheStore Port

Port for audio cache storage.

```typescript
// ports/cache-store.port.ts

export interface ICacheStore {
  /**
   * Get cached audio entry
   */
  get(key: CacheKey): Promise<Result<CacheEntry | null, CacheError>>;

  /**
   * Store audio entry
   */
  set(key: CacheKey, entry: CacheEntry): Promise<Result<void, CacheError>>;

  /**
   * Delete specific entry
   */
  delete(key: CacheKey): Promise<Result<boolean, CacheError>>;

  /**
   * Clear all entries (optionally filtered by URL)
   */
  clear(urlFilter?: string): Promise<Result<number, CacheError>>;

  /**
   * Check if entry exists without retrieving it
   */
  has(key: CacheKey): Promise<boolean>;

  /**
   * Get cache statistics
   */
  getStats(): Promise<CacheStats>;

  /**
   * Run eviction if needed
   */
  evictIfNeeded(): Promise<Result<number, CacheError>>;
}

export interface CacheKey {
  readonly urlHash: string;
  readonly paragraphIndex: number;
  readonly provider: string;
  readonly voice: string;
  readonly contentHash: string;
}

export interface CacheEntry {
  readonly audioBlob: Blob;
  readonly durationMs: number;
  readonly wordTimings: readonly WordTiming[] | null;
  readonly createdAt: number;
  readonly lastAccessedAt: number;
  readonly accessCount: number;
  readonly sizeBytes: number;
}

export interface CacheStats {
  readonly entries: number;
  readonly totalSizeBytes: number;
  readonly maxSizeBytes: number;
  readonly hitCount: number;
  readonly missCount: number;
  readonly oldestEntryAgeMs: number | null;
}
```

---

### IHighlightSynchronizer Port

Port for content script highlight coordination.

```typescript
// ports/highlight-sync.port.ts

export interface IHighlightSynchronizer {
  /**
   * Highlight a paragraph in the content script
   */
  highlightParagraph(
    tabId: number,
    paragraphIndex: number,
    scroll: boolean
  ): Promise<Result<void, HighlightError>>;

  /**
   * Highlight a word within the current paragraph
   */
  highlightWord(
    tabId: number,
    paragraphIndex: number,
    wordIndex: number
  ): Promise<Result<void, HighlightError>>;

  /**
   * Clear all highlights
   */
  clearHighlights(tabId: number): Promise<Result<void, HighlightError>>;

  /**
   * Show the sticky footer player
   */
  showFooter(tabId: number): Promise<Result<void, HighlightError>>;

  /**
   * Hide the sticky footer player
   */
  hideFooter(tabId: number): Promise<Result<void, HighlightError>>;

  /**
   * Update footer state
   */
  updateFooterState(tabId: number, state: FooterState): Promise<Result<void, HighlightError>>;
}

export interface FooterState {
  readonly status: PlaybackStatus;
  readonly currentIndex: number;
  readonly totalParagraphs: number;
  readonly progress: number;
  readonly currentText: string;
  readonly speed: number;
}

export type HighlightError =
  | { type: 'tab_not_found'; tabId: number }
  | { type: 'content_script_not_loaded' }
  | { type: 'message_failed'; message: string };
```

---

### ITextExtractor Port

Port for text extraction strategies.

```typescript
// ports/text-extractor.port.ts

export interface ITextExtractor {
  /**
   * Extract readable text from document/selection
   */
  extract(
    mode: ExtractionMode,
    document: Document | string
  ): Promise<Result<ExtractedContent, ContentExtractionError>>;

  /**
   * Check if this extractor can handle the content type
   */
  canHandle(contentType: string, url?: string): boolean;

  /**
   * Extractor identifier
   */
  readonly extractorId: string;
}
```

---

### IContentScorer Port

Port for content relevance scoring.

```typescript
// ports/content-scorer.port.ts

export interface IContentScorer {
  /**
   * Score an element for content relevance
   */
  scoreElement(element: Element): ContentScore;

  /**
   * Score HTML content
   */
  scoreHtml(html: string): ContentScore;

  /**
   * Find the best content container
   */
  findBestContainer(document: Document): Element | null;
}
```

---

### ISettingsStore Port

Port for settings persistence.

```typescript
// ports/settings-store.port.ts

export interface ISettingsStore {
  /**
   * Get all settings
   */
  getSettings(): Promise<Settings>;

  /**
   * Update settings (partial)
   */
  updateSettings(updates: Partial<Settings>): Promise<void>;

  /**
   * Get API key for provider
   */
  getApiKey(provider: ProviderId): Promise<string | null>;

  /**
   * Set API key for provider
   */
  setApiKey(provider: ProviderId, key: string): Promise<void>;

  /**
   * Subscribe to settings changes
   */
  subscribe(callback: (settings: Settings) => void): () => void;
}

// Settings type from existing schema
export interface Settings {
  mode: ExtractionMode;
  provider: ProviderId;
  voice: string | null;
  speed: number;
  showCostEstimate: boolean;
  cacheEnabled: boolean;
  maxCacheSize: number;
  wordSyncEnabled: boolean;
}
```

---

## Adapter Interface Implementations

Each adapter must implement exactly one port interface:

| Adapter | Port | Technology |
|---------|------|------------|
| `OpenAIAudioAdapter` | `IAudioGenerator` | OpenAI TTS API |
| `ElevenLabsAudioAdapter` | `IAudioGenerator` | ElevenLabs API |
| `GroqAudioAdapter` | `IAudioGenerator` | Groq API |
| `CartesiaAudioAdapter` | `IAudioGenerator` | Cartesia API |
| `BrowserAudioAdapter` | `IAudioGenerator` | Web Speech API |
| `IndexedDBCacheAdapter` | `ICacheStore` | IndexedDB via idb |
| `InMemoryCacheAdapter` | `ICacheStore` | Map (testing) |
| `HighlightSyncAdapter` | `IHighlightSynchronizer` | browser.tabs messaging |
| `ReadabilityExtractorAdapter` | `ITextExtractor` | Mozilla Readability |
| `TrafilaturaScorerAdapter` | `IContentScorer` | Custom scoring |
| `BrowserSettingsAdapter` | `ISettingsStore` | browser.storage.local |

---

## Service Dependencies

### PlaybackService

```typescript
interface PlaybackServiceDependencies {
  audioGenerator: IAudioGenerator;
  cacheStore: ICacheStore;
  highlightSync: IHighlightSynchronizer;
  settingsStore: ISettingsStore;
}
```

### ContentExtractionService

```typescript
interface ContentExtractionServiceDependencies {
  textExtractor: ITextExtractor;
  contentScorer: IContentScorer;
}
```

---

## Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DOMAIN LAYER                                │
│  ┌─────────────────┐    ┌──────────────────────────┐               │
│  │ PlaybackService │    │ ContentExtractionService │               │
│  │   - start()     │    │   - extract()            │               │
│  │   - pause()     │    │   - score()              │               │
│  │   - next()      │    └──────────────────────────┘               │
│  │   - seek()      │                                                │
│  └────────┬────────┘                                                │
│           │ depends on                                              │
└───────────┼─────────────────────────────────────────────────────────┘
            │
┌───────────┼─────────────────────────────────────────────────────────┐
│           ▼         PORT INTERFACES                                 │
│  ┌───────────────┐  ┌─────────────┐  ┌───────────────────────────┐ │
│  │IAudioGenerator│  │ICacheStore  │  │IHighlightSynchronizer     │ │
│  └───────────────┘  └─────────────┘  └───────────────────────────┘ │
│  ┌───────────────┐  ┌─────────────┐  ┌───────────────────────────┐ │
│  │ITextExtractor │  │IContentScor.│  │ISettingsStore             │ │
│  └───────────────┘  └─────────────┘  └───────────────────────────┘ │
└───────────┬─────────────────────────────────────────────────────────┘
            │ implemented by
┌───────────┼─────────────────────────────────────────────────────────┐
│           ▼         ADAPTER LAYER                                   │
│  ┌───────────────┐  ┌─────────────┐  ┌───────────────────────────┐ │
│  │OpenAIAdapter  │  │IndexedDB    │  │HighlightSyncAdapter       │ │
│  │ElevenLabsAdpt.│  │CacheAdapter │  │                           │ │
│  │GroqAdapter    │  │InMemoryCache│  │                           │ │
│  │CartesiaAdapter│  │             │  │                           │ │
│  │BrowserAdapter │  │             │  │                           │ │
│  └───────────────┘  └─────────────┘  └───────────────────────────┘ │
│           │                                                         │
│           ▼ uses                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ INFRASTRUCTURE (external services)                          │   │
│  │ • OpenAI API       • IndexedDB      • browser.tabs          │   │
│  │ • ElevenLabs API   • Map (memory)   • browser.storage.local │   │
│  │ • Groq API         • Readability                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 2 Additions: Handler & Dispatch Entities (2026-01-07)

### Handler Entity

Represents a registered message handler.

```typescript
// handlers/registry.ts

export interface HandlerEntry {
  handler: Handler<unknown, unknown>;
  description?: string;
}

export type Handler<TParams, TResponse> = (
  params: TParams
) => Promise<TResponse>;
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Handler name (e.g., `playback.start`) |
| `handler` | `Handler` | Function that processes the message |
| `description` | `string?` | Optional documentation |

---

### HandlerRegistry Entity

Central dispatcher for routing messages to handlers.

```typescript
export class HandlerRegistry {
  handlers: Map<string, HandlerEntry>;
  
  register(name: string, handler: Handler, description?: string): void;
  unregister(name: string): boolean;
  has(name: string): boolean;
  dispatch(name: string, params: unknown): Promise<Result<unknown, HandlerError>>;
  getHandlerNames(): string[];
  getHandlersByPrefix(): Map<string, string[]>;
  readonly size: number;
}
```

---

### DispatchLogEntry Entity

Telemetry record for dispatch verification.

```typescript
export interface DispatchLogEntry {
  timestamp: number;      // Unix timestamp (ms)
  type: string;           // Message type dispatched
  path: 'hex' | 'legacy'; // Which path handled the message
  durationMs: number;     // Handler execution time
  success: boolean;       // Whether handler succeeded
}
```

**Storage**: In-memory circular buffer (max 1000 entries)

---

### DispatchStats Entity

Aggregated telemetry for verification.

```typescript
export interface DispatchStats {
  total: number;
  hex: number;
  legacy: number;
  hexPercent: number;
  byDomain: Record<string, { hex: number; legacy: number; total: number }>;
}
```

---

### FeatureFlag Entity

Runtime toggle for rollback capability.

| Key | Domain | Default |
|-----|--------|---------|
| `USE_LEGACY_PLAYBACK` | playback.* | false |
| `USE_LEGACY_AUDIO` | audio.* | false |
| `USE_LEGACY_SETTINGS` | settings.* | false |
| `USE_LEGACY_FOOTER` | footer.* | false |
| `USE_LEGACY_CACHE` | cache.*, prefetch.* | false |
| `USE_LEGACY_PDF` | pdf.* | false |
| `USE_LEGACY_QUEUE` | queue.* | false |

**Storage**: `browser.storage.local`

---

### Message Type Mapping

Legacy message types are translated to hexagonal format:

```typescript
const LEGACY_TO_HEXAGONAL_MAP: Record<string, string> = {
  'startPlayback': 'playback.start',
  'pausePlayback': 'playback.pause',
  'stopPlayback': 'playback.stop',
  'getPlaybackState': 'playback.getState',
  'nextParagraph': 'playback.next',
  'previousParagraph': 'playback.previous',
  'seekToPosition': 'playback.seek',
  'setSpeed': 'playback.setSpeed',
  'getVoices': 'audio.getVoices',
  'setVoice': 'audio.setVoice',
  'testApiKey': 'audio.validateCredentials',
  'FOOTER_ACTION': 'footer.action',
  'FOOTER_SHOW': 'footer.show',
  'FOOTER_HIDE': 'footer.hide',
  // ... etc
};
```

---

### Handler Domain Coverage

| Domain | Target Count | Currently Registered | Status |
|--------|-------------|---------------------|--------|
| playback | 8 | 7 | Partial |
| cache | 10 | 6 | Partial |
| content | 4 | 4 | Complete |
| audio | 4 | 0 | Needs migration |
| provider | 3 | 0 | Needs migration |
| settings | 6 | 0 | Needs migration |
| footer | 4 | 0 | Needs migration |
| prefetch | 4 | 0 | Needs migration |
| pdf | 8 | 0 | Needs migration |
| queue | 9 | 0 | Needs migration |
| debug | 2 | 2 | Complete |
| **Total** | **65+** | **19** | **29%** |
