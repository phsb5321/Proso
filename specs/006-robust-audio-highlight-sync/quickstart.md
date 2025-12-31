# Quickstart: Robust Audio-Text Highlight Synchronization

**Feature**: 006-robust-audio-highlight-sync
**Date**: 2025-12-31

## Overview

This feature fixes the disconnected audio-text highlighting by:
1. Using `audio.currentTime` as the authoritative sync source
2. Running a `requestAnimationFrame` loop for continuous sync
3. Extracting word timestamps via Groq Whisper API
4. Maintaining highlights until audio sections complete

## Prerequisites

- Groq API key (for word-level sync)
- Firefox 119+ (for CSS Custom Highlight API)

## Key Files to Modify

### 1. PlaybackSyncState (`background/playback-sync.js`)

**Current Issue**: Uses estimated timings based on word counts, causes drift.

**Changes**:
- Always read `audio.currentTime` on each frame (already doing this)
- Add drift detection logging
- Improve `syncToParagraph()` to handle edge cases
- Add word alignment integration

### 2. GroqTimestampProvider (`background/providers/groq-timestamp-provider.js`) [NEW]

**Purpose**: Extract word timestamps from audio using Groq Whisper API.

```javascript
export class GroqTimestampProvider {
  async extractWordTimings(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.mp3');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');

    const response = await fetch(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this._apiKey}` },
        body: formData
      }
    );

    const data = await response.json();
    return this.alignWordsToSource(data.words, sourceText);
  }
}
```

### 3. Background Script (`background/background.js`)

**Changes**:
- After TTS generates audio, call Groq Whisper for timestamps
- Pass word timeline to content script
- Store in cache alongside audio data

```javascript
// In playCurrentParagraph()
const audioData = await generateAudio(text);

// Extract word timings (parallel or after)
let wordTimeline = null;
if (groqTimestampProvider.hasApiKey()) {
  wordTimeline = await groqTimestampProvider.extractWordTimings(audioData, text);
}

// Cache both
audioCache.set(cacheKey, audioData, { wordTiming: wordTimeline });

// Set in sync state
playbackSyncState.setWordTimeline(wordTimeline);
```

### 4. Options Page (`options/options.html`, `options/options.js`)

**Changes**:
- Add Groq API key input field (or reuse existing if configured)
- Add "Enable word-level sync" checkbox

### 5. Content Script (`content/content.js`)

**Changes**:
- Handle `SET_WORD_TIMELINE` message
- Handle `HIGHLIGHT_WORD` message
- Use CSS Custom Highlight API for word highlighting

## Sync Loop Flow

```
┌─────────────────────────────────────────────────────────┐
│                   requestAnimationFrame                  │
│                                                          │
│  1. Read audio.currentTime                              │
│  2. Convert to milliseconds                             │
│  3. Find current paragraph from timeline                │
│  4. If word timeline available:                         │
│     - Find current word from word timeline              │
│     - Send HIGHLIGHT_WORD to content script             │
│  5. If paragraph changed:                               │
│     - Send HIGHLIGHT to content script                  │
│  6. Schedule next frame                                 │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Testing Approach

### Unit Tests

1. `playback-sync.test.js`:
   - Test `syncToParagraph()` with various time positions
   - Test boundary conditions (exact start/end times)
   - Test drift detection and correction

2. `groq-timestamp.test.js`:
   - Test word alignment algorithm
   - Test handling of punctuation, contractions
   - Test fallback behavior

### Contract Tests

1. `test-groq-whisper.js`:
   - Verify API request format
   - Verify response parsing
   - Test error handling (401, 429, etc.)

### Manual Testing

1. Play long article (10+ paragraphs)
2. Verify highlight tracks audio without drift
3. Test with different speech speeds (0.5x, 1x, 2x)
4. Test pause/resume maintains sync
5. Test seek to different positions
6. Test without Groq API key (fallback)

## Metrics to Track

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Paragraph sync latency | <200ms | Timestamp in highlight message vs audio.currentTime |
| Word sync latency | <100ms | Same as above |
| Drift after 10 min | <200ms | Log accumulated drift |
| Fallback rate | <5% | Count Groq API failures |

## Rollback Plan

If issues arise:
1. Disable word-level sync (set `wordSyncEnabled: false` in storage)
2. Revert to previous `playback-sync.js` if paragraph sync broken

## Dependencies

- Groq Whisper API (`https://api.groq.com/openai/v1/audio/transcriptions`)
- CSS Custom Highlight API (Firefox 119+)
- Existing audio cache infrastructure
