# API Contract: Groq Whisper Transcription with Word Timestamps

**Feature**: 006-robust-audio-highlight-sync
**Date**: 2025-12-31

## Endpoint

```
POST https://api.groq.com/openai/v1/audio/transcriptions
```

## Authentication

```
Authorization: Bearer {GROQ_API_KEY}
```

## Request

### Content-Type

```
multipart/form-data
```

### Form Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | binary | Yes | Audio file (mp3, wav, mp4, m4a, ogg, webm, flac) |
| model | string | Yes | `whisper-large-v3-turbo` or `whisper-large-v3` |
| response_format | string | Yes | Must be `verbose_json` for timestamps |
| timestamp_granularities[] | string[] | Yes | Include `word` for word-level timestamps |
| language | string | No | ISO-639-1 code (e.g., `en`). Auto-detected if omitted. |

### Example Request (JavaScript)

```javascript
const formData = new FormData();
formData.append('file', audioBlob, 'audio.mp3');
formData.append('model', 'whisper-large-v3-turbo');
formData.append('response_format', 'verbose_json');
formData.append('timestamp_granularities[]', 'word');
formData.append('timestamp_granularities[]', 'segment');

const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`
  },
  body: formData
});
```

## Response

### Success (200 OK)

```json
{
  "task": "transcribe",
  "language": "en",
  "duration": 5.42,
  "text": "Hello world, this is a test.",
  "words": [
    {
      "word": "Hello",
      "start": 0.0,
      "end": 0.32
    },
    {
      "word": "world,",
      "start": 0.35,
      "end": 0.68
    },
    {
      "word": "this",
      "start": 0.72,
      "end": 0.88
    },
    {
      "word": "is",
      "start": 0.90,
      "end": 0.98
    },
    {
      "word": "a",
      "start": 1.0,
      "end": 1.05
    },
    {
      "word": "test.",
      "start": 1.08,
      "end": 1.42
    }
  ],
  "segments": [
    {
      "id": 0,
      "seek": 0,
      "start": 0.0,
      "end": 1.42,
      "text": "Hello world, this is a test.",
      "tokens": [50364, 2425, 1002, 11, 341, 307, 257, 1500, 13, 50436],
      "temperature": 0.0,
      "avg_logprob": -0.18,
      "compression_ratio": 0.95,
      "no_speech_prob": 0.01
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| task | string | Always "transcribe" |
| language | string | Detected language code |
| duration | number | Audio duration in seconds |
| text | string | Full transcription text |
| words | array | Word-level timing data (when requested) |
| words[].word | string | Transcribed word (may include punctuation) |
| words[].start | number | Start time in seconds |
| words[].end | number | End time in seconds |
| segments | array | Segment-level data |

### Error Responses

#### 400 Bad Request

```json
{
  "error": {
    "message": "response_format must be set verbose_json to use timestamp granularities",
    "type": "invalid_request_error",
    "code": "invalid_request"
  }
}
```

#### 401 Unauthorized

```json
{
  "error": {
    "message": "Invalid API key",
    "type": "authentication_error",
    "code": "invalid_api_key"
  }
}
```

#### 429 Rate Limited

```json
{
  "error": {
    "message": "Rate limit exceeded. Please retry after X seconds.",
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded"
  }
}
```

#### 413 Payload Too Large

```json
{
  "error": {
    "message": "File size exceeds maximum allowed (25MB)",
    "type": "invalid_request_error",
    "code": "file_too_large"
  }
}
```

## Constraints

| Constraint | Value |
|------------|-------|
| Max file size | 25 MB |
| Max audio duration | ~10 hours (practical limit) |
| Supported formats | mp3, mp4, mpeg, mpga, m4a, wav, webm, flac, ogg |
| Rate limits | Varies by plan (typically 100 req/min) |

## VoxPage Implementation Notes

### Conversion to Internal Format

```javascript
function convertGroqWordsToWordTimeline(groqResponse, sourceText) {
  const words = groqResponse.words.map(w => ({
    word: w.word.replace(/[.,!?;:]+$/, ''), // Strip trailing punctuation
    startMs: Math.round(w.start * 1000),
    endMs: Math.round(w.end * 1000),
    charOffset: -1,  // Computed during alignment
    charLength: -1   // Computed during alignment
  }));

  return alignWordsToSource(words, sourceText);
}
```

### Error Handling

```javascript
async function extractWordTimings(audioBlob) {
  try {
    const response = await callGroqWhisper(audioBlob);
    if (!response.words || response.words.length === 0) {
      return null; // Fallback to paragraph sync
    }
    return response;
  } catch (error) {
    if (error.code === 'rate_limit_exceeded') {
      console.warn('Groq rate limited, falling back to paragraph sync');
    }
    return null; // Fallback to paragraph sync
  }
}
```
