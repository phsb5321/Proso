# Cartesia TTS API Contract

**Provider ID**: `cartesia`
**Base URL**: `https://api.cartesia.ai`
**Documentation**: https://docs.cartesia.ai/api-reference/tts/bytes

---

## Authentication

| Header | Format | Required |
|--------|--------|----------|
| Authorization | `Bearer {API_KEY}` | Yes |
| Cartesia-Version | `2025-04-16` | Yes |

---

## Endpoints

### POST /tts/bytes

Generate speech audio from text input (lowest latency).

#### Request

**Headers**:
```
Authorization: Bearer {API_KEY}
Cartesia-Version: 2025-04-16
Content-Type: application/json
```

**Body**:
```json
{
  "model_id": "sonic-2024-12-12",
  "transcript": "Hello, world!",
  "voice": {
    "mode": "id",
    "id": "a0e99841-438c-4a64-b679-ae501e7d6091"
  },
  "output_format": {
    "container": "mp3",
    "encoding": "mp3",
    "sample_rate": 24000
  },
  "generation_config": {
    "speed": 1.0
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| model_id | string | Yes | `sonic-2024-12-12` (latest stable) |
| transcript | string | Yes | Text to synthesize |
| voice | object | Yes | Voice configuration |
| output_format | object | Yes | Audio output settings |
| language | string | No | BCP-47 language code |
| generation_config | object | No | Speed, volume, emotion settings |

**Voice Object**:
```json
{
  "mode": "id",
  "id": "{voice_uuid}"
}
```

**Output Format Options**:
| Container | Encoding | Sample Rates |
|-----------|----------|--------------|
| mp3 | mp3 | 24000, 44100 |
| wav | pcm_s16le | 8000-48000 |
| raw | pcm_s16le, pcm_f32le | 8000-48000 |

**Generation Config**:
| Field | Type | Range | Default |
|-------|------|-------|---------|
| speed | number | 0.6 - 1.5 | 1.0 |
| volume | number | 0.5 - 2.0 | 1.0 |

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
  "error": "invalid_api_key",
  "message": "The provided API key is invalid"
}
```

---

## Voices

Cartesia provides a library of pre-trained voices. Example voices:

| ID | Name | Language | Description |
|----|------|----------|-------------|
| a0e99841-438c-4a64-b679-ae501e7d6091 | Barbershop Man | en | American male, conversational |
| 156fb8d2-335b-4950-9cb3-a2d33befec77 | Friendly Sidekick | en | Animated, enthusiastic |
| 5619d38c-cf51-4d8e-9575-48f61a280413 | Sweet Lady | en | Warm, nurturing |
| 79a125e8-cd45-4c13-8a67-188112f4dd22 | Sportsman | en | Energetic, confident |
| c45bc5ec-dc68-4feb-8829-6e6b2748095d | Storyteller | en | Engaging narrator |

*Note: Voice IDs are UUIDs, not human-readable names. Fetch available voices from `/voices` endpoint.*

---

## Pricing

| Rate | Unit | Notes |
|------|------|-------|
| 1 credit | per character | ~$0.05 per 1,000 chars at standard rates |

---

## Rate Limits

- Standard: 100 requests per minute
- Enterprise: Higher limits available

---

## VoxPage Implementation

### Provider Configuration

```javascript
{
  id: 'cartesia',
  name: 'Cartesia',
  endpoint: 'https://api.cartesia.ai/tts/bytes',
  requiresApiKey: true,
  supportsStreaming: true,
  authHeaderName: 'Authorization',
  authHeaderFormat: 'Bearer {key}',
  pricingModel: {
    type: 'per_character',
    rate: 0.05,
    unit: 1000,
    currency: 'USD'
  }
}
```

### Request Builder

```javascript
function buildCartesiaRequest(text, voiceId, options = {}) {
  return {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Cartesia-Version': '2025-04-16',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model_id: 'sonic-2024-12-12',
      transcript: text,
      voice: {
        mode: 'id',
        id: voiceId
      },
      output_format: {
        container: 'mp3',
        encoding: 'mp3',
        sample_rate: 24000
      },
      generation_config: {
        speed: options.speed || 1.0
      }
    })
  };
}
```

### Voice ID Mapping

```javascript
const cartesiaVoices = {
  'barbershop-man': 'a0e99841-438c-4a64-b679-ae501e7d6091',
  'friendly-sidekick': '156fb8d2-335b-4950-9cb3-a2d33befec77',
  'sweet-lady': '5619d38c-cf51-4d8e-9575-48f61a280413',
  'sportsman': '79a125e8-cd45-4c13-8a67-188112f4dd22',
  'storyteller': 'c45bc5ec-dc68-4feb-8829-6e6b2748095d'
};
```

### Error Handling

| Error Code | Action |
|------------|--------|
| 401 | Invalid API key - prompt user to update |
| 400 | Invalid request - check voice ID and parameters |
| 429 | Rate limited - show retry countdown |
| 500+ | Server error - suggest trying again |

### Manifest Permission

Add to `manifest.json`:
```json
{
  "host_permissions": [
    "https://api.cartesia.ai/*"
  ]
}
```
