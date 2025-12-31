# Research: Real-Time TTS API Integration

**Feature**: 001-realtime-tts-api
**Date**: 2025-12-30
**Status**: Complete

## Research Questions

1. What is the best approach for streaming TTS audio in a browser extension?
2. What are the specific API contracts for OpenAI, ElevenLabs, and Cartesia?
3. How should audio segments be cached for session playback?
4. What is the cost structure for each provider?

---

## 1. Streaming TTS in Browser Extensions

### Decision: Use HTTP streaming with ReadableStream API

### Rationale
- WebSocket connections require persistent connections; HTTP streaming is simpler for per-paragraph requests
- Fetch API with `response.body.getReader()` supports chunked audio streaming in Firefox 109+
- Background service workers can handle streaming responses without content script involvement

### Alternatives Considered
- **WebSocket (Cartesia native)**: Rejected - adds complexity, requires connection management, not needed for paragraph-level granularity
- **Full audio download before playback**: Rejected - adds latency, violates SC-001 (1-second time-to-audio)

### Implementation Notes
```javascript
// Streaming audio fetch pattern
const response = await fetch(url, options);
const reader = response.body.getReader();
const chunks = [];
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  chunks.push(value);
}
```

---

## 2. TTS Provider API Contracts

### OpenAI TTS API

**Endpoint**: `POST https://api.openai.com/v1/audio/speech`

**Authentication**: `Authorization: Bearer <API_KEY>`

**Request**:
```json
{
  "model": "tts-1" | "tts-1-hd",
  "input": "<text>",
  "voice": "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
  "response_format": "mp3" | "opus" | "aac" | "flac",
  "speed": 0.25 - 4.0
}
```

**Response**: Audio binary (Content-Type: audio/mpeg)

**Pricing**: $0.015 per 1,000 characters (tts-1), $0.030 per 1,000 characters (tts-1-hd)

**Latency**: ~200ms TTFA

### ElevenLabs TTS API

**Endpoint**: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`

**Authentication**: `xi-api-key: <API_KEY>`

**Request**:
```json
{
  "text": "<text>",
  "model_id": "eleven_multilingual_v2" | "eleven_turbo_v2_5",
  "voice_settings": {
    "stability": 0.0 - 1.0,
    "similarity_boost": 0.0 - 1.0,
    "style": 0.0 - 1.0,
    "use_speaker_boost": true
  }
}
```

**Response**: Audio binary (Content-Type: audio/mpeg)

**Pricing**: ~$0.30 per 1,000 characters (varies by plan)

**Latency**: ~150ms TTFA (Flash model: ~75ms)

### Cartesia TTS API (NEW)

**Endpoint**: `POST https://api.cartesia.ai/tts/bytes`

**Authentication**: `Authorization: Bearer <API_KEY>`

**Required Headers**:
- `Cartesia-Version: 2025-04-16`
- `Content-Type: application/json`

**Request**:
```json
{
  "model_id": "sonic-2024-12-12",
  "transcript": "<text>",
  "voice": {
    "mode": "id",
    "id": "<voice_id>"
  },
  "output_format": {
    "container": "mp3",
    "encoding": "mp3",
    "sample_rate": 24000
  },
  "generation_config": {
    "speed": 0.6 - 1.5
  }
}
```

**Response**: Audio binary (Content-Type: audio/mpeg)

**Pricing**: 1 credit per character (~$0.05 per 1,000 characters at standard rates)

**Latency**: 40-90ms TTFA (fastest available)

**Available Voices**:
- Default voices from Cartesia library
- Custom voice cloning available

---

## 3. Audio Caching Strategy

### Decision: In-memory Map with paragraph hash keys

### Rationale
- Session-only persistence avoids storage quota concerns
- Map provides O(1) lookup by paragraph text hash
- Automatic cleanup on tab close/extension reload
- No privacy concerns with persistent audio storage

### Data Structure
```javascript
const audioCache = new Map();
// Key: hash(provider + voice + text)
// Value: { audioBlob: Blob, duration: number, timestamp: Date }
```

### Cache Policy
- Max 50 entries (configurable)
- LRU eviction when limit reached
- Clear on provider change
- Clear on page navigation

### Alternatives Considered
- **IndexedDB**: Rejected - overkill for session cache, adds async complexity
- **browser.storage.local**: Rejected - 5MB limit, not designed for binary data
- **No caching**: Rejected - violates FR-007 (rewind without regeneration)

---

## 4. Cost Estimation

### Decision: Character count × provider rate with pre-playback display

### Provider Rates (per 1,000 characters)

| Provider | Standard | Premium | Notes |
|----------|----------|---------|-------|
| OpenAI | $0.015 | $0.030 (HD) | Most affordable, good quality |
| ElevenLabs | ~$0.24 | ~$0.30 | Premium voices, highest cost |
| Cartesia | ~$0.05 | ~$0.05 | Best latency, mid-range cost |
| Browser | $0.00 | $0.00 | Free, variable quality |

### Estimation Formula
```javascript
function estimateCost(text, provider, quality) {
  const charCount = text.length;
  const rates = {
    openai: quality === 'hd' ? 0.030 : 0.015,
    elevenlabs: 0.30,
    cartesia: 0.05,
    browser: 0
  };
  return (charCount / 1000) * rates[provider];
}
```

### Display Format
- Show before playback: "Estimated cost: $0.02"
- Show per paragraph during playback (optional)
- Accumulate session total in popup

---

## 5. Provider Interface Design

### Decision: Common interface class with provider-specific implementations

### Interface
```javascript
class TTSProvider {
  constructor(apiKey) {}

  async validateKey() → boolean
  async generateAudio(text, voice, options) → ArrayBuffer
  async streamAudio(text, voice, options) → ReadableStream
  getVoices() → Voice[]
  estimateCost(text) → number

  static get id() → string
  static get name() → string
  static get requiresApiKey() → boolean
}
```

### Rationale
- Enables adding new providers without modifying core logic
- Simplifies testing with mock implementations
- Follows Constitution IV (Modular Architecture)

---

## Summary

All research questions resolved. Key decisions:

1. **Streaming**: HTTP streaming with ReadableStream, not WebSocket
2. **Providers**: OpenAI (existing), ElevenLabs (existing), Cartesia (add), Browser (existing)
3. **Caching**: In-memory Map with LRU eviction, session-only
4. **Cost**: Pre-playback estimate based on character count × provider rate
5. **Architecture**: Common provider interface class

Sources:
- [Cartesia TTS WebSocket Docs](https://docs.cartesia.ai/api-reference/tts/websocket)
- [Cartesia TTS Bytes Docs](https://docs.cartesia.ai/api-reference/tts/bytes)
- [OpenAI TTS API](https://platform.openai.com/docs/api-reference/audio/createSpeech)
- [ElevenLabs API](https://docs.elevenlabs.io/api-reference/text-to-speech)
