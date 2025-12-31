# Data Model: Real-Time TTS API Integration

**Feature**: 001-realtime-tts-api
**Date**: 2025-12-30
**Source**: [spec.md](./spec.md) Key Entities section

---

## Entities

### TTSProvider

A service that converts text to speech audio.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique provider identifier (e.g., "openai", "elevenlabs", "cartesia", "browser") |
| name | string | Yes | Display name for UI (e.g., "OpenAI", "ElevenLabs") |
| endpoint | string | Yes | Base API URL for requests |
| requiresApiKey | boolean | Yes | Whether an API key is needed |
| supportsStreaming | boolean | Yes | Whether provider supports chunked streaming |
| pricingModel | PricingModel | Yes | Cost calculation parameters |
| voices | Voice[] | Yes | Available voice options |
| authHeaderName | string | No | Header name for API key (default: "Authorization") |
| authHeaderFormat | string | No | Format string for auth value (e.g., "Bearer {key}") |

**Validation Rules**:
- `id` must be lowercase alphanumeric with hyphens only
- `endpoint` must be valid HTTPS URL (except "browser" which has none)
- `voices` must contain at least one voice

**State Transitions**: N/A (static configuration)

---

### Voice

A specific voice option within a provider.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Provider-specific voice identifier |
| name | string | Yes | Display name (e.g., "Alloy", "Rachel") |
| language | string | Yes | Primary language code (e.g., "en-US") |
| gender | string | No | Voice gender hint ("male", "female", "neutral") |
| description | string | No | Voice characteristics description |
| sampleUrl | string | No | URL to audio sample |

**Validation Rules**:
- `id` must be unique within provider
- `language` must be valid BCP-47 language tag

---

### PricingModel

Cost calculation parameters for a provider.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | string | Yes | "per_character" or "per_minute" or "free" |
| rate | number | Yes | Cost per unit (e.g., 0.015 for $0.015/1K chars) |
| unit | number | Yes | Characters or seconds per rate (e.g., 1000) |
| currency | string | Yes | Currency code (e.g., "USD") |

**Validation Rules**:
- `rate` must be >= 0
- `unit` must be > 0

---

### AudioSegment

A generated audio clip for a single paragraph.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique segment identifier (hash of provider+voice+text) |
| sourceText | string | Yes | Original paragraph text |
| providerId | string | Yes | Provider that generated this audio |
| voiceId | string | Yes | Voice used for generation |
| audioData | ArrayBuffer | Yes | Raw audio binary data |
| mimeType | string | Yes | Audio format (e.g., "audio/mpeg") |
| duration | number | Yes | Audio duration in seconds |
| generatedAt | number | Yes | Unix timestamp of generation |
| byteSize | number | Yes | Size of audioData in bytes |

**Validation Rules**:
- `duration` must be > 0
- `byteSize` must match `audioData.byteLength`
- `generatedAt` must be valid timestamp

**State Transitions**: N/A (immutable once created)

---

### PlaybackSession

Active listening state for a page.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique session identifier |
| tabId | number | Yes | Browser tab ID |
| url | string | Yes | Page URL being read |
| providerId | string | Yes | Current TTS provider |
| voiceId | string | Yes | Current voice selection |
| speed | number | Yes | Playback speed (0.5 - 2.0) |
| status | PlaybackStatus | Yes | Current playback state |
| paragraphs | Paragraph[] | Yes | Extracted text paragraphs |
| currentIndex | number | Yes | Currently playing paragraph index |
| audioPosition | number | Yes | Position in current audio (seconds) |
| cache | Map<string, AudioSegment> | Yes | Cached audio segments |
| totalDuration | number | No | Estimated total duration |
| startedAt | number | No | Session start timestamp |

**Validation Rules**:
- `speed` must be between 0.5 and 2.0
- `currentIndex` must be valid index in `paragraphs`
- `audioPosition` must be >= 0

**State Transitions**:
```
IDLE → LOADING → PLAYING ⇄ PAUSED → STOPPED → IDLE
         ↓          ↓
       ERROR      ERROR
```

---

### Paragraph

A text segment extracted from a page.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| index | number | Yes | Position in paragraph list |
| text | string | Yes | Paragraph text content |
| element | Element | No | DOM element reference (for highlighting) |
| characterCount | number | Yes | Length of text |
| estimatedDuration | number | No | Estimated speech duration in seconds |

**Validation Rules**:
- `text` must be non-empty after trimming
- `characterCount` must equal `text.length`

---

### PlaybackStatus (Enum)

| Value | Description |
|-------|-------------|
| IDLE | No active playback |
| LOADING | Generating audio for current paragraph |
| PLAYING | Audio is playing |
| PAUSED | Audio is paused |
| STOPPED | Playback stopped by user |
| ERROR | An error occurred |

---

### ExtensionSettings

User preferences stored in browser.storage.local.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| defaultProvider | string | Yes | "browser" | Default TTS provider ID |
| defaultVoice | object | Yes | {} | Map of providerId → voiceId |
| defaultSpeed | number | Yes | 1.0 | Default playback speed |
| openaiApiKey | string | No | null | OpenAI API key (encrypted) |
| elevenlabsApiKey | string | No | null | ElevenLabs API key (encrypted) |
| cartesiaApiKey | string | No | null | Cartesia API key (encrypted) |
| showCostEstimate | boolean | Yes | true | Display cost before playback |
| cacheEnabled | boolean | Yes | true | Enable audio segment caching |
| maxCacheSize | number | Yes | 50 | Maximum cached segments |

**Validation Rules**:
- `defaultSpeed` must be between 0.5 and 2.0
- `maxCacheSize` must be between 10 and 100
- API keys must not be empty strings if provided

---

## Relationships

```
ExtensionSettings
    └─ references → TTSProvider (defaultProvider)

PlaybackSession
    ├─ references → TTSProvider (providerId)
    ├─ references → Voice (voiceId)
    ├─ contains → Paragraph[] (paragraphs)
    └─ contains → AudioSegment[] (cache)

AudioSegment
    ├─ references → TTSProvider (providerId)
    └─ references → Voice (voiceId)

TTSProvider
    ├─ contains → Voice[] (voices)
    └─ contains → PricingModel (pricingModel)
```

---

## Storage Schema

### browser.storage.local

```javascript
{
  // Settings
  "settings": ExtensionSettings,

  // API Keys (stored separately for security)
  "apiKey_openai": string | null,
  "apiKey_elevenlabs": string | null,
  "apiKey_cartesia": string | null
}
```

### In-Memory (background worker)

```javascript
{
  // Active session (one per tab)
  "sessions": Map<tabId, PlaybackSession>,

  // Audio cache (global, LRU-managed)
  "audioCache": Map<segmentId, AudioSegment>,

  // Provider registry
  "providers": Map<providerId, TTSProvider>
}
```
