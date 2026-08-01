# Contract: IAudioGenerator Port

**Feature**: 061-complete-architecture-migration

## Purpose

Define the contract for audio generation adapters, with special handling for Browser TTS which cannot produce audio blobs.

## Current Contract (broken for Browser TTS)

```typescript
interface IAudioGenerator {
  generateAudio(request: AudioRequest): Promise<Result<AudioResponse, AudioError>>;
}

interface AudioResponse {
  audioBlob: Blob;           // Browser TTS returns empty blob — VIOLATION
  durationMs: number;
  wordTimings: WordTiming[] | null;
}
```

## Revised Contract

```typescript
interface IAudioGenerator {
  generateAudio(request: AudioRequest): Promise<Result<AudioResponse, AudioError>>;
  readonly playbackMode: 'blob' | 'direct';  // NEW: indicates playback strategy
}

interface AudioResponse {
  audioBlob: Blob;           // For 'blob' mode: valid audio data
                             // For 'direct' mode: empty sentinel (audio already playing)
  durationMs: number;
  wordTimings: WordTiming[] | null;
  playedDirectly?: boolean;  // NEW: true if audio was already played by the adapter
}
```

## Adapter Implementations

### ElevenLabsAudioAdapter
- `playbackMode: 'blob'`
- Returns real MP3 blob from API
- `PlaybackService` plays via `HTMLAudioElement`

### BrowserTtsAudioAdapter
- `playbackMode: 'direct'`
- Plays audio via `speechSynthesis.speak()` directly
- Returns `playedDirectly: true` with estimated duration
- `PlaybackService` tracks progress/timing without using `HTMLAudioElement`

## PlaybackService Changes

```typescript
// In generateAndPlayParagraph():
const response = await this.deps.audioGenerator.generateAudio(request);

if (response.playedDirectly) {
  // Browser TTS: audio already playing via speechSynthesis
  // Track progress using estimated duration, skip HTMLAudioElement
  this.trackDirectPlayback(response.durationMs);
} else {
  // API providers: play blob through HTMLAudioElement
  await this.playAudio(response.audioBlob);
}
```

## Verification

1. Browser TTS: Play a page → audio audible, no "Invalid URI" errors
2. ElevenLabs: Play a page → audio audible from API-generated MP3
3. Switching providers mid-session → next paragraph uses new provider correctly
