# Research: Robust Audio-Text Highlight Synchronization

**Feature**: 006-robust-audio-highlight-sync
**Date**: 2025-12-31

## Research Tasks

### 1. Groq Whisper API for Word Timestamps

**Decision**: Use Groq Whisper API with `whisper-large-v3-turbo` model for word-level timestamp extraction.

**Rationale**:
- Groq provides ultra-fast inference (claimed 140 char/sec for TTS, comparable speed for STT)
- Word-level timestamps available via `timestamp_granularities=["word"]`
- Already have Groq API host permission in manifest.json
- Consistent with existing Groq TTS provider integration

**Alternatives Considered**:
- ElevenLabs native timestamps: Deferred per clarification session; requires different API endpoint
- OpenAI Whisper: Slower inference, higher cost
- Local forced alignment (Aeneas): Requires Python backend, not suitable for browser extension

**API Details**:
- Endpoint: `POST https://api.groq.com/openai/v1/audio/transcriptions`
- Model: `whisper-large-v3-turbo` (faster) or `whisper-large-v3` (more accurate)
- Request: multipart/form-data with audio file
- Response format: `verbose_json` with `timestamp_granularities=["word"]`
- Response structure:
  ```json
  {
    "words": [
      { "word": "Hello", "start": 0.0, "end": 0.32 },
      { "word": "world", "start": 0.35, "end": 0.68 }
    ]
  }
  ```

### 2. Synchronization Architecture

**Decision**: Use `audio.currentTime` as authoritative clock with `requestAnimationFrame` sync loop.

**Rationale**:
- `audio.currentTime` is the only reliable source of actual playback position
- `requestAnimationFrame` provides ~60fps updates without blocking main thread
- Web Audio API clock is more precise than JavaScript timers
- This pattern is recommended by web.dev and Fender Engineering for audio-visual sync

**Alternatives Considered**:
- `setInterval` polling: Unreliable timing, affected by tab throttling
- `timeupdate` event only: Fires 4x/sec, too infrequent for word-level sync
- Web Audio API `AudioContext.currentTime`: More complex, unnecessary for simple playback

**Implementation Pattern**:
```javascript
function syncLoop() {
  if (!isPlaying) return;

  const currentTimeMs = audioElement.currentTime * 1000;
  updateHighlightForTime(currentTimeMs);

  requestAnimationFrame(syncLoop);
}
```

### 3. Word-to-Text Alignment

**Decision**: Match Groq transcription words to source text using normalized string comparison.

**Rationale**:
- TTS audio may have slight pronunciation variations from source text
- Groq transcription provides what was actually spoken
- Need to map transcribed words back to DOM positions for highlighting

**Algorithm**:
1. Normalize both source text and transcription (lowercase, remove punctuation)
2. Use sliding window alignment to handle minor word order differences
3. Map each transcribed word's timing to corresponding source word position
4. Track cumulative character offset for DOM Range creation

**Edge Cases**:
- Contractions: "don't" may transcribe as "do not" - handle via fuzzy matching
- Numbers: "42" may transcribe as "forty two" - normalize numbers to words
- Punctuation: Ignore in matching, preserve in highlighting

### 4. Drift Detection and Correction

**Decision**: Continuous correction on every frame rather than threshold-based jumps.

**Rationale**:
- Prevents jarring "jump" experiences when drift is corrected
- More robust against accumulated small errors
- Simpler implementation - always sync to `audio.currentTime`

**Implementation**:
- On each `requestAnimationFrame`, read `audio.currentTime` directly
- Compare to expected timeline position
- If drift > 200ms, log warning but still correct smoothly
- No need for explicit "resync" - the loop is always synced

### 5. Fallback Strategy

**Decision**: Graceful degradation to paragraph-only sync when word timing unavailable.

**Rationale**:
- Users without Groq API key should still get functional highlighting
- Network failures shouldn't break the extension
- Paragraph-level sync is already implemented and working

**Fallback Triggers**:
1. Groq API key not configured → paragraph-only
2. Groq API request fails (network/rate limit) → paragraph-only
3. Transcription returns empty/invalid → paragraph-only
4. Word alignment fails → paragraph-only

**User Feedback**:
- No error shown to user - silent fallback
- Optional: indicator in UI showing "Word sync available" vs "Paragraph sync only"

### 6. API Key Management

**Decision**: Separate storage key for Groq API (timestamp extraction) vs Groq TTS.

**Rationale**:
- User may have Groq API key for TTS but not want to use it for timestamps (cost concern)
- Allows independent configuration
- Follows existing pattern of per-provider API key storage

**Storage Keys**:
- `groqTtsApiKey`: For TTS audio generation (existing)
- `groqTimestampApiKey`: For Whisper timestamp extraction (new, defaults to groqTtsApiKey if set)

**Simplified Approach** (recommended):
- Single `groqApiKey` used for both TTS and timestamps
- Add checkbox in settings: "Enable word-level sync (uses Groq API)"

## Performance Considerations

### Latency Budget

| Operation | Target | Measured |
|-----------|--------|----------|
| Groq Whisper transcription | <2s for 30s audio | TBD |
| Word alignment algorithm | <50ms | TBD |
| Highlight update (per frame) | <5ms | TBD |
| Total time to first word highlight | <3s | TBD |

### Optimization Strategies

1. **Parallel processing**: Start Groq transcription immediately after TTS audio generated
2. **Caching**: Store word timings in audio cache alongside audio data
3. **Lazy alignment**: Only compute word ranges when highlight reaches that paragraph
4. **Debounced updates**: Skip highlight updates if <16ms since last update

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Should Groq timestamps use same API key as TTS? | Yes, single key for simplicity |
| What model for Whisper? | `whisper-large-v3-turbo` for speed |
| How to handle transcription mismatches? | Fuzzy word alignment with fallback |
