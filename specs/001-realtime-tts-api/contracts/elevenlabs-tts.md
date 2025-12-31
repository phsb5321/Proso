# ElevenLabs TTS API Contract

**Provider ID**: `elevenlabs`
**Base URL**: `https://api.elevenlabs.io`
**Documentation**: https://docs.elevenlabs.io/api-reference/text-to-speech

---

## Authentication

| Header | Format | Required |
|--------|--------|----------|
| xi-api-key | `{API_KEY}` | Yes |

---

## Endpoints

### POST /v1/text-to-speech/{voice_id}

Generate speech audio from text input.

#### Request

**Headers**:
```
xi-api-key: {API_KEY}
Content-Type: application/json
Accept: audio/mpeg
```

**Body**:
```json
{
  "text": "Hello, world!",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.5,
    "use_speaker_boost": true
  }
}
```

| Field | Type | Required | Values | Default |
|-------|------|----------|--------|---------|
| text | string | Yes | 1-5000 characters | - |
| model_id | string | No | `eleven_multilingual_v2`, `eleven_turbo_v2_5`, `eleven_english_v1` | `eleven_multilingual_v2` |
| voice_settings | object | No | See below | Provider defaults |

**Voice Settings**:
| Field | Type | Range | Default |
|-------|------|-------|---------|
| stability | number | 0.0 - 1.0 | 0.5 |
| similarity_boost | number | 0.0 - 1.0 | 0.75 |
| style | number | 0.0 - 1.0 | 0.0 |
| use_speaker_boost | boolean | - | true |

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
  "detail": {
    "status": "invalid_api_key",
    "message": "Invalid API key"
  }
}
```

---

## Voices

| ID | Name | Description |
|----|------|-------------|
| 21m00Tcm4TlvDq8ikWAM | Rachel | Calm, soothing |
| 29vD33N1CtxCmqQRPOHJ | Drew | Well-rounded, confident |
| EXAVITQu4vr4xnSDxMaL | Sarah | Soft news presenter |
| ErXwobaYiN019PkySvjV | Antoni | Crisp, natural |
| 2EiwWnXFnvU5JabPnv8n | Clyde | Deep, warm |
| 5Q0t7uMcjvnagumLfvZi | Paul | News anchor style |
| AZnzlk1XvdvUeBnXmlld | Domi | Assertive, strong |
| CYw3kZ02Hs0563khs1Fj | Dave | British, conversational |
| D38z5RcWu1voky8WS1ja | Fin | Irish, friendly |
| MF3mGyEYCl7XYWbV9V6O | Elli | Youthful, engaging |

---

## Pricing

| Plan | Rate | Notes |
|------|------|-------|
| Free | Limited characters/month | 10,000 chars |
| Starter | ~$0.30 | per 1,000 characters |
| Creator+ | ~$0.24 | per 1,000 characters |

---

## Rate Limits

- Free: 3 concurrent requests
- Paid: Up to 10 concurrent requests

---

## VoxPage Implementation

### Provider Configuration

```javascript
{
  id: 'elevenlabs',
  name: 'ElevenLabs',
  endpoint: 'https://api.elevenlabs.io/v1/text-to-speech',
  requiresApiKey: true,
  supportsStreaming: true,
  authHeaderName: 'xi-api-key',
  authHeaderFormat: '{key}',
  pricingModel: {
    type: 'per_character',
    rate: 0.30,
    unit: 1000,
    currency: 'USD'
  }
}
```

### Request Builder

```javascript
function buildElevenLabsRequest(text, voiceId, options = {}) {
  return {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text: text,
      model_id: options.turbo ? 'eleven_turbo_v2_5' : 'eleven_multilingual_v2',
      voice_settings: {
        stability: options.stability || 0.5,
        similarity_boost: options.similarityBoost || 0.75,
        style: options.style || 0.5,
        use_speaker_boost: true
      }
    })
  };
}
```

### Voice ID Mapping

```javascript
const elevenLabsVoices = {
  'rachel': '21m00Tcm4TlvDq8ikWAM',
  'drew': '29vD33N1CtxCmqQRPOHJ',
  'sarah': 'EXAVITQu4vr4xnSDxMaL',
  'antoni': 'ErXwobaYiN019PkySvjV',
  'clyde': '2EiwWnXFnvU5JabPnv8n',
  'paul': '5Q0t7uMcjvnagumLfvZi',
  'domi': 'AZnzlk1XvdvUeBnXmlld',
  'dave': 'CYw3kZ02Hs0563khs1Fj',
  'fin': 'D38z5RcWu1voky8WS1ja',
  'elli': 'MF3mGyEYCl7XYWbV9V6O'
};
```

### Error Handling

| Error Code | Action |
|------------|--------|
| 401 | Invalid API key - prompt user to update |
| 422 | Invalid voice ID or settings - check configuration |
| 429 | Rate limited - show retry countdown |
| 400 (text too long) | Split text and retry |
| 500+ | Server error - suggest trying again |
