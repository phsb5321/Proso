# Data Model: PDF Removal + Web Page Reading Pivot

**Feature**: 045-pdf-removal-page-reader
**Date**: 2026-01-13

## Entities

### Article

Extracted content from a web page.

```typescript
interface Article {
  // Identity
  url: string;              // Canonical URL (without hash/query params)
  extractedAt: string;      // ISO 8601 timestamp

  // Content
  title: string;            // Page title (from Readability or <title>)
  byline?: string;          // Author info if available
  siteName?: string;        // Site name if available
  content: string;          // Full extracted text (HTML stripped)
  paragraphs: Paragraph[];  // Chunked for TTS

  // Metadata
  length: number;           // Word count
  excerpt?: string;         // First ~150 chars
  lang?: string;            // Detected language code (e.g., 'en')
}

interface Paragraph {
  index: number;            // 0-based position
  text: string;             // Paragraph content
  startOffset: number;      // Character offset in full content
  endOffset: number;        // Character offset end
}
```

**Storage**: Not persisted (transient, extracted on demand)

**Validation Rules**:
- `url` must be valid HTTP/HTTPS URL
- `paragraphs` must have at least 1 item
- `content` must be non-empty string

---

### Highlight

User-created annotation on a page.

```typescript
interface Highlight {
  // Identity
  id: string;               // UUID v4
  url: string;              // Canonical page URL

  // W3C Web Annotation target
  target: {
    source: string;         // Same as url
    selector: TextQuoteSelector[];
  };

  // Optional note body
  body?: {
    type: 'TextualBody';
    value: string;          // User's note text
    format: 'text/plain';
  };

  // Display
  color: HighlightColor;    // Preset color enum
  orphaned: boolean;        // True if re-anchoring failed

  // Timestamps
  created: string;          // ISO 8601
  modified?: string;        // ISO 8601
}

type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
```

**Storage**: IndexedDB (`highlights` object store)

**Indexes**:
- `url` (for listing highlights per page)
- `created` (for chronological listing)

**Validation Rules**:
- `id` must be valid UUID v4
- `url` must be valid HTTP/HTTPS URL
- `target.selector` must have at least one TextQuoteSelector
- `color` must be one of the preset colors

---

### TextQuoteSelector

W3C selector for robust text re-anchoring.

```typescript
interface TextQuoteSelector {
  type: 'TextQuoteSelector';
  exact: string;            // The highlighted text
  prefix?: string;          // ~32 chars before (optional but recommended)
  suffix?: string;          // ~32 chars after (optional but recommended)
}
```

**Storage**: Embedded in Highlight.target.selector

**Validation Rules**:
- `exact` must be non-empty string (1-10000 chars)
- `prefix` should be ≤64 chars
- `suffix` should be ≤64 chars

---

### AudioChunk

Cached TTS audio segment.

```typescript
interface AudioChunk {
  // Identity (composite key)
  id: string;               // `${urlHash}:${paragraphIndex}:${voiceId}`

  // References
  url: string;              // Page URL
  paragraphIndex: number;   // Which paragraph

  // Audio data
  audioBlob: Blob;          // MP3 audio data
  durationMs: number;       // Playback duration

  // Generation metadata
  voiceId: string;          // ElevenLabs voice ID
  textHash: string;         // SHA-256 of paragraph text (for invalidation)

  // Timestamps
  created: string;          // ISO 8601
  lastAccessed: string;     // For LRU eviction
}
```

**Storage**: IndexedDB (`audioCache` object store)

**Indexes**:
- `url` (for clearing page cache)
- `lastAccessed` (for LRU eviction)
- `created` (for age-based eviction)

**Validation Rules**:
- `audioBlob` must be non-empty Blob with type 'audio/mpeg'
- `durationMs` must be positive number
- `paragraphIndex` must be non-negative integer

---

### PlaybackState

Current reading state (in-memory only).

```typescript
interface PlaybackState {
  // Identity
  url: string;              // Current page URL
  tabId: number;            // Browser tab ID

  // Position
  currentParagraph: number; // 0-based index
  positionMs: number;       // Position within current paragraph

  // Status
  status: PlaybackStatus;
  speed: number;            // 0.5 - 2.0

  // Audio
  audioElement?: HTMLAudioElement;  // Reference (in offscreen doc)
}

type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
```

**Storage**: In-memory only (service worker state)

**Validation Rules**:
- `speed` must be 0.5 ≤ speed ≤ 2.0
- `currentParagraph` must be valid index

---

### UserSettings

User configuration.

```typescript
interface UserSettings {
  // ElevenLabs
  elevenLabsApiKey?: string;    // Encrypted in storage
  voiceId: string;              // Selected voice
  speed: number;                // TTS speed (0.5-2.0)

  // Highlights
  defaultHighlightColor: HighlightColor;

  // UI
  theme: 'auto' | 'light' | 'dark';

  // Cache
  cacheEnabled: boolean;
  maxCacheSizeMb: number;       // Default 500

  // Telemetry
  telemetryEnabled: boolean;
}
```

**Storage**: browser.storage.local

**Default Values**:
```typescript
const DEFAULT_SETTINGS: UserSettings = {
  voiceId: 'EXAVITQu4vr4xnSDxMaL',  // Rachel voice
  speed: 1.0,
  defaultHighlightColor: 'yellow',
  theme: 'auto',
  cacheEnabled: true,
  maxCacheSizeMb: 500,
  telemetryEnabled: false,
};
```

---

## Entity Relationships

```
┌──────────────┐
│    Article   │ ←── Extracted from web page (transient)
└──────────────┘
       │
       │ url
       ▼
┌──────────────┐     ┌──────────────┐
│  Highlight   │────►│TextQuoteSelector│
└──────────────┘     └──────────────┘
       │
       │ url, paragraphIndex
       ▼
┌──────────────┐
│  AudioChunk  │ ←── Cached audio for paragraph
└──────────────┘
       │
       │ voiceId
       ▼
┌──────────────┐
│ UserSettings │ ←── API key, preferences
└──────────────┘
```

## State Transitions

### PlaybackState FSM

```
             ┌─────────┐
             │  idle   │◄─────────────────────┐
             └────┬────┘                      │
                  │ play()                    │ stop()
                  ▼                           │
             ┌─────────┐                      │
             │ loading │                      │
             └────┬────┘                      │
                  │ audioReady()              │
                  ▼                           │
             ┌─────────┐    pause()    ┌──────┴─────┐
             │ playing │──────────────►│   paused   │
             └────┬────┘               └──────┬─────┘
                  │ ▲                         │
                  │ │ resume()                │
                  │ └─────────────────────────┘
                  │
                  │ error
                  ▼
             ┌─────────┐
             │  error  │
             └─────────┘
```

### Highlight Lifecycle

```
     create()           save()           load()
[Selection] ──────► [Highlight] ──────► [IndexedDB]
                         │
                         │ pageLoad()
                         ▼
                    [Re-anchor]
                         │
            ┌────────────┼────────────┐
            │            │            │
            ▼            ▼            ▼
       [Success]    [Fuzzy OK]   [Orphaned]
       score=1.0    score>0.8    score<0.8
```

## IndexedDB Schema

```typescript
// Database: voxpage
// Version: 1

interface VoxPageDB {
  highlights: {
    key: string;  // id
    value: Highlight;
    indexes: {
      byUrl: string;      // url
      byCreated: string;  // created
    };
  };

  audioCache: {
    key: string;  // id (composite)
    value: AudioChunk;
    indexes: {
      byUrl: string;          // url
      byLastAccessed: string; // lastAccessed
    };
  };
}
```

## Zod Schemas

```typescript
// src/utils/schemas/highlight.schema.ts
import { z } from 'zod';

export const TextQuoteSelectorSchema = z.object({
  type: z.literal('TextQuoteSelector'),
  exact: z.string().min(1).max(10000),
  prefix: z.string().max(64).optional(),
  suffix: z.string().max(64).optional(),
});

export const HighlightColorSchema = z.enum(['yellow', 'green', 'blue', 'pink', 'purple']);

export const HighlightSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  target: z.object({
    source: z.string().url(),
    selector: z.array(TextQuoteSelectorSchema).min(1),
  }),
  body: z.object({
    type: z.literal('TextualBody'),
    value: z.string(),
    format: z.literal('text/plain'),
  }).optional(),
  color: HighlightColorSchema,
  orphaned: z.boolean().default(false),
  created: z.string().datetime(),
  modified: z.string().datetime().optional(),
});

export type Highlight = z.infer<typeof HighlightSchema>;
```
