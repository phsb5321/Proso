# Word Timing API Contract: Groq Whisper

**Feature**: 007-audio-sync-extraction-overhaul
**Created**: 2025-12-31
**API**: Groq Whisper API (audio transcription with timestamps)

## Endpoint

```
POST https://api.groq.com/openai/v1/audio/transcriptions
```

## Request

### Headers

```http
Authorization: Bearer ${GROQ_API_KEY}
Content-Type: multipart/form-data
```

### Body

```typescript
interface TranscriptionRequest {
  /** Audio file (MP3, WAV, WEBM, etc.) */
  file: Blob;
  /** Model identifier */
  model: 'whisper-large-v3' | 'whisper-large-v3-turbo';
  /** Response format for word-level timestamps */
  response_format: 'verbose_json';
  /** Request word-level timing */
  timestamp_granularities: ['word'];
  /** Optional: language hint */
  language?: string;
}
```

### Example cURL

```bash
curl -X POST "https://api.groq.com/openai/v1/audio/transcriptions" \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -F file=@audio.mp3 \
  -F model=whisper-large-v3-turbo \
  -F response_format=verbose_json \
  -F "timestamp_granularities[]=word"
```

## Response

### Success (200 OK)

```typescript
interface TranscriptionResponse {
  /** Full transcription text */
  text: string;
  /** Task type */
  task: 'transcribe';
  /** Detected or specified language */
  language: string;
  /** Audio duration in seconds */
  duration: number;
  /** Word-level timing data */
  words: WordTimestamp[];
}

interface WordTimestamp {
  /** The word text */
  word: string;
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
}
```

### Example Response

```json
{
  "text": "Hello world, this is a test.",
  "task": "transcribe",
  "language": "english",
  "duration": 2.5,
  "words": [
    { "word": "Hello", "start": 0.0, "end": 0.4 },
    { "word": "world,", "start": 0.4, "end": 0.8 },
    { "word": "this", "start": 0.9, "end": 1.1 },
    { "word": "is", "start": 1.1, "end": 1.3 },
    { "word": "a", "start": 1.3, "end": 1.4 },
    { "word": "test.", "start": 1.4, "end": 1.8 }
  ]
}
```

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | invalid_request | Missing required parameter |
| 401 | invalid_api_key | Invalid or missing API key |
| 413 | file_too_large | Audio file exceeds 25MB limit |
| 429 | rate_limit_exceeded | Too many requests |
| 500 | internal_error | Server error |

### Error Response Format

```typescript
interface ErrorResponse {
  error: {
    message: string;
    type: string;
    code: string;
  };
}
```

---

## VoxPage Transformation

### Input: Groq Response

```typescript
// Groq uses seconds with decimal precision
{ "word": "Hello", "start": 0.0, "end": 0.4 }
```

### Output: VoxPage WordTiming

```typescript
// VoxPage uses milliseconds
interface WordTiming {
  word: string;
  startTimeMs: number;  // Groq start * 1000
  endTimeMs: number;    // Groq end * 1000
  charOffset: number;   // Calculated during alignment
  charLength: number;   // word.length
}
```

### Transformation Logic

```typescript
function transformGroqTimings(
  groqWords: WordTimestamp[],
  sourceText: string
): WordTiming[] {
  const result: WordTiming[] = [];
  let charOffset = 0;

  for (const groqWord of groqWords) {
    // Find word in source text (fuzzy match for contractions, etc.)
    const matchResult = fuzzyFindWord(sourceText, groqWord.word, charOffset);

    result.push({
      word: groqWord.word,
      startTimeMs: Math.round(groqWord.start * 1000),
      endTimeMs: Math.round(groqWord.end * 1000),
      charOffset: matchResult.offset,
      charLength: matchResult.length,
    });

    charOffset = matchResult.offset + matchResult.length;
  }

  return result;
}
```

---

## Backward Compatibility

### Legacy Format (ElevenLabs)

Some providers may return different property names:

```typescript
// ElevenLabs style
{ "word": "Hello", "startMs": 0, "endMs": 400 }
```

### Normalization

```typescript
function normalizeWordTiming(raw: unknown): WordTiming {
  const word = raw as Record<string, unknown>;

  return {
    word: String(word.word ?? ''),
    startTimeMs: Number(word.startTimeMs ?? word.startMs ?? word.start * 1000 ?? 0),
    endTimeMs: Number(word.endTimeMs ?? word.endMs ?? word.end * 1000 ?? 0),
    charOffset: Number(word.charOffset ?? 0),
    charLength: Number(word.charLength ?? word.word?.length ?? 0),
  };
}
```

---

## Rate Limits

| Tier | Requests/min | Audio/min |
|------|--------------|-----------|
| Free | 20 | 60 min |
| Pro | 100 | 300 min |

VoxPage should:
1. Cache word timings by paragraph hash
2. Rate-limit requests to stay under tier limits
3. Gracefully degrade to paragraph-only sync on rate limit

---

## Test Fixtures

### Fixture: Simple Sentence

```json
{
  "input_text": "Hello world",
  "input_audio_duration_ms": 1000,
  "expected_output": [
    { "word": "Hello", "startTimeMs": 0, "endTimeMs": 500, "charOffset": 0, "charLength": 5 },
    { "word": "world", "startTimeMs": 500, "endTimeMs": 1000, "charOffset": 6, "charLength": 5 }
  ]
}
```

### Fixture: Contraction Handling

```json
{
  "input_text": "I don't know",
  "groq_response": [
    { "word": "I", "start": 0.0, "end": 0.2 },
    { "word": "don't", "start": 0.2, "end": 0.5 },
    { "word": "know", "start": 0.5, "end": 0.8 }
  ],
  "expected_alignment": [
    { "word": "I", "charOffset": 0, "charLength": 1 },
    { "word": "don't", "charOffset": 2, "charLength": 5 },
    { "word": "know", "charOffset": 8, "charLength": 4 }
  ]
}
```

### Fixture: Number Expansion

```json
{
  "input_text": "The year is 2024",
  "groq_response": [
    { "word": "The", "start": 0.0, "end": 0.2 },
    { "word": "year", "start": 0.2, "end": 0.5 },
    { "word": "is", "start": 0.5, "end": 0.7 },
    { "word": "twenty", "start": 0.7, "end": 1.0 },
    { "word": "twenty-four", "start": 1.0, "end": 1.5 }
  ],
  "note": "TTS may expand '2024' to 'twenty twenty-four', requiring fuzzy alignment"
}
```
