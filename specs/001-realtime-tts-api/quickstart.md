# Quickstart: Real-Time TTS API Integration

**Feature**: 001-realtime-tts-api
**Date**: 2025-12-30

This guide walks through the core flows for the Real-Time TTS feature.

---

## Prerequisites

1. VoxPage extension installed in Firefox 109+
2. At least one TTS provider API key (OpenAI, ElevenLabs, or Cartesia) OR browser TTS

---

## User Flow 1: First-Time Setup

### 1.1 Open Settings

1. Click the VoxPage icon in the toolbar
2. Click the gear icon (⚙️) to open Settings

### 1.2 Add API Key

1. Expand the provider section (OpenAI, ElevenLabs, or Cartesia)
2. Paste your API key
3. Click "Validate" to test the key
4. See ✓ confirmation or error message

### 1.3 Select Default Provider

1. Choose your preferred provider from the dropdown
2. Select a voice from the available options
3. Settings auto-save

---

## User Flow 2: Basic Playback with Highlighting

### 2.1 Navigate to Content

1. Open any webpage with article content
2. Click the VoxPage icon

### 2.2 Start Playback

1. Select reading mode:
   - **Article** (default): Smart extraction of main content
   - **Full Page**: All visible text
   - **Selection**: Highlight text first, then click play
2. Review the estimated cost (for paid providers)
3. Click the Play button (▶)

### 2.3 During Playback

- **Highlighting**: Current paragraph is highlighted and scrolled into view
- **Progress**: Progress bar shows position
- **Controls**:
  - Pause/Resume: Click ⏸/▶
  - Skip: Click ⏮/⏭ for previous/next paragraph
  - Stop: Click ⏹ to end session
  - Speed: Adjust 0.5x - 2.0x slider

### 2.4 Jump to Paragraph

1. Click any paragraph on the page
2. Playback jumps to that paragraph
3. Highlighting updates immediately

---

## User Flow 3: Provider Switching

### 3.1 Change Provider Mid-Session

1. During playback, click the provider dropdown in popup
2. Select a different provider
3. Current paragraph re-generates with new provider
4. Cached audio from previous provider is cleared

### 3.2 Compare Voices

1. Pause playback
2. Switch provider
3. Click play on same paragraph
4. Compare audio quality/latency

---

## User Flow 4: Long Article Streaming

### 4.1 Start Long Article

1. Open article with 10+ paragraphs
2. Click Play
3. Audio begins within 1 second (first paragraph)

### 4.2 Background Generation

- While paragraph 1 plays, paragraphs 2-3 are pre-generated
- No audible gap between paragraphs
- Progress indicator shows generation status

### 4.3 Handle Interruption

If network fails mid-article:
1. Current paragraph completes (if already loaded)
2. Error message appears with:
   - "Retry" button for failed paragraph
   - "Skip" button to continue
   - "Switch Provider" option

---

## User Flow 5: Rewind with Cache

### 5.1 Navigate Back

1. During playback, click ⏮ or click a previous paragraph
2. Cached audio plays instantly (no regeneration)
3. No additional API cost for cached content

### 5.2 Cache Limits

- Max 50 paragraphs cached per session
- Oldest entries evicted when limit reached
- Cache clears on page navigation or provider change

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Alt + P | Play/Pause toggle |
| Alt + S | Stop playback |
| Alt + . | Next paragraph |
| Alt + , | Previous paragraph |

---

## Troubleshooting

### "API key not configured"

1. Open Settings
2. Add API key for selected provider
3. Click Validate

### "Rate limited"

1. Wait for countdown timer
2. OR switch to a different provider
3. OR use browser TTS (free, unlimited)

### "No text found"

1. Try different reading mode (Article → Full Page)
2. Ensure page has loaded completely
3. Check if page uses unusual rendering (some SPAs)

### Highlighting not working

1. Some pages block content script injection
2. Try refreshing the page
3. Check browser console for errors

### Audio quality poor

1. Switch from `tts-1` to `tts-1-hd` (OpenAI)
2. Try ElevenLabs for most natural voices
3. Try Cartesia for lowest latency

---

## Cost Estimation

Before playback starts, VoxPage shows estimated cost:

```
Estimated cost: $0.02 (OpenAI tts-1)
[Play] [Cancel]
```

Cost calculated as: `(character count / 1000) × provider rate`

| Provider | Rate/1K chars |
|----------|---------------|
| OpenAI tts-1 | $0.015 |
| OpenAI tts-1-hd | $0.030 |
| ElevenLabs | ~$0.30 |
| Cartesia | ~$0.05 |
| Browser | Free |

---

## Validation Checklist

After implementation, verify these scenarios:

- [ ] First paragraph audio plays within 1 second of clicking Play
- [ ] Highlight moves in sync with audio (within 300ms)
- [ ] Switching providers works without losing position
- [ ] Rewinding uses cached audio (instant, no API call)
- [ ] Long articles stream without blocking
- [ ] Cost estimate displays before playback
- [ ] All three providers (+ browser) are selectable
- [ ] API key validation shows clear success/error
- [ ] Rate limit errors display retry countdown
- [ ] Page navigation clears session and cache
