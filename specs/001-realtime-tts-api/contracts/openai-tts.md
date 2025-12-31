# OpenAI TTS API Contract

**Provider ID**: `openai`
**Base URL**: `https://api.openai.com`
**Documentation**: https://platform.openai.com/docs/api-reference/audio/createSpeech

---

## Authentication

| Header | Format | Required |
|--------|--------|----------|
| Authorization | `Bearer {API_KEY}` | Yes |

---

## Endpoints

### POST /v1/audio/speech

Generate speech audio from text input.

#### Request

**Headers**:
```
Authorization: Bearer {API_KEY}
Content-Type: application/json
```

**Body**:
```json
{
  "model": "tts-1",
  "input": "Hello, world!",
  "voice": "alloy",
  "response_format": "mp3",
  "speed": 1.0
}
```

| Field | Type | Required | Values | Default |
|-------|------|----------|--------|---------|
| model | string | Yes | `tts-1`, `tts-1-hd` | - |
| input | string | Yes | 1-4096 characters | - |
| voice | string | Yes | `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer` | - |
| response_format | string | No | `mp3`, `opus`, `aac`, `flac`, `wav`, `pcm` | `mp3` |
| speed | number | No | 0.25 - 4.0 | 1.0 |

#### Response

**Success (200)**:
```
Content-Type: audio/mpeg
Content-Length: {bytes}

[Binary audio data]
```

**Error (4xx/5xx)**:
```json
{
  "error": {
    "message": "Invalid API key",
    "type": "invalid_request_error",
    "code": "invalid_api_key"
  }
}
```

---

## Voices

| ID | Name | Description |
|----|------|-------------|
| alloy | Alloy | Neutral, balanced |
| echo | Echo | Warm, conversational |
| fable | Fable | British, expressive |
| onyx | Onyx | Deep, authoritative |
| nova | Nova | Friendly, upbeat |
| shimmer | Shimmer | Soft, gentle |

---

## Pricing

| Model | Rate | Unit |
|-------|------|------|
| tts-1 | $0.015 | per 1,000 characters |
| tts-1-hd | $0.030 | per 1,000 characters |

---

## Rate Limits

- Default: 3 requests per minute (RPM), 12,500 tokens per minute (TPM)
- Varies by usage tier

---

## VoxPage Implementation

### Provider Configuration

```javascript
{
  id: 'openai',
  name: 'OpenAI',
  endpoint: 'https://api.openai.com/v1/audio/speech',
  requiresApiKey: true,
  supportsStreaming: true,
  authHeaderName: 'Authorization',
  authHeaderFormat: 'Bearer {key}',
  pricingModel: {
    type: 'per_character',
    rate: 0.015,
    unit: 1000,
    currency: 'USD'
  }
}
```

### Request Builder

```javascript
function buildOpenAIRequest(text, voice, options = {}) {
  return {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: options.hd ? 'tts-1-hd' : 'tts-1',
      input: text,
      voice: voice,
      response_format: 'mp3',
      speed: options.speed || 1.0
    })
  };
}
```

### Error Handling

| Error Code | Action |
|------------|--------|
| 401 | Invalid API key - prompt user to update in settings |
| 429 | Rate limited - show retry message with countdown |
| 400 (input too long) | Split text and retry |
| 500+ | Server error - suggest trying again later |
