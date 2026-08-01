# Research: PDF Removal + Web Page Reading Pivot

**Feature**: 045-pdf-removal-page-reader
**Date**: 2026-01-13

## Research Questions Addressed

1. Chrome MV3 Offscreen Document for Audio Playback
2. W3C Web Annotation Data Model for Highlight Persistence
3. ElevenLabs API Streaming Best Practices
4. Text Re-anchoring Algorithms
5. Cross-browser Permission Request Patterns

---

## 1. Chrome MV3 Offscreen Document for Audio Playback

### Decision
Use Chrome's Offscreen Documents API with `audioPlayback` reason for TTS audio playback in Chrome MV3.

### Rationale
Chrome MV3 service workers cannot access the Audio API or DOM APIs. Offscreen documents provide a hidden document context with full web API access, specifically designed for audio playback.

### Implementation Pattern

```typescript
// src/adapters/audio/offscreen.adapter.ts

interface OffscreenAudioAdapter implements AudioPlayerPort {
  private documentCreated = false;

  async createOffscreenDocument(): Promise<void> {
    if (this.documentCreated) return;

    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL('offscreen.html')]
    });

    if (existingContexts.length > 0) {
      this.documentCreated = true;
      return;
    }

    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: 'Play TTS audio for article reading'
    });
    this.documentCreated = true;
  }

  async play(audioBlob: Blob): Promise<void> {
    await this.createOffscreenDocument();
    // Send message to offscreen document to play audio
    await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_PLAY_AUDIO',
      data: { audioUrl: URL.createObjectURL(audioBlob) }
    });
  }
}
```

### Offscreen Document HTML

```html
<!-- src/entrypoints/offscreen.html -->
<!DOCTYPE html>
<html>
<head>
  <script src="offscreen.js" type="module"></script>
</head>
<body></body>
</html>
```

### Alternatives Considered

| Alternative | Rejected Because |
|-------------|------------------|
| Background script Audio API | Not available in MV3 service workers |
| Content script audio | Requires content script injection, doesn't work on restricted pages |
| Web Audio API | Also unavailable in service workers |
| Browser TTS | Limited voice quality, no ElevenLabs integration |

### References
- [Chrome Offscreen Documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Audio playback in MV3](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security#audio)

---

## 2. W3C Web Annotation Data Model for Highlights

### Decision
Use W3C Web Annotation Data Model with TextQuoteSelector for highlight persistence and re-anchoring.

### Rationale
W3C Web Annotation is the industry standard for durable text annotations. TextQuoteSelector with prefix/exact/suffix provides robust re-anchoring even when DOM changes.

### Data Model

```typescript
// src/core/highlight/highlight.entity.ts

interface TextQuoteSelector {
  type: 'TextQuoteSelector';
  exact: string;         // The highlighted text
  prefix?: string;       // ~32 chars before
  suffix?: string;       // ~32 chars after
}

interface TextPositionSelector {
  type: 'TextPositionSelector';
  start: number;         // Character offset from document start
  end: number;
}

interface Highlight {
  id: string;                         // UUID
  url: string;                        // Canonical page URL
  target: {
    source: string;                   // Same as url
    selector: [TextQuoteSelector, TextPositionSelector?];
  };
  body?: {
    type: 'TextualBody';
    value: string;                    // User note
    format: 'text/plain';
  };
  created: string;                    // ISO 8601
  modified?: string;
  color: string;                      // Hex color
  orphaned: boolean;                  // True if re-anchoring failed
}
```

### Re-anchoring Algorithm

```typescript
// src/core/highlight/anchoring.service.ts

function anchorTextQuote(selector: TextQuoteSelector, document: Document): Range | null {
  const { exact, prefix, suffix } = selector;

  // 1. Get full text content
  const text = document.body.textContent || '';

  // 2. Find all occurrences of exact text
  const matches = findAllOccurrences(text, exact);

  // 3. Score each match by context similarity
  const scoredMatches = matches.map(pos => ({
    position: pos,
    score: scoreMatch(text, pos, exact, prefix, suffix)
  }));

  // 4. Select best match (score > 0.8 threshold)
  const best = scoredMatches.sort((a, b) => b.score - a.score)[0];
  if (!best || best.score < 0.8) return null;

  // 5. Convert text position to DOM Range
  return textPositionToRange(document.body, best.position, exact.length);
}

function scoreMatch(
  text: string,
  position: number,
  exact: string,
  prefix?: string,
  suffix?: string
): number {
  let score = 1.0; // Exact match baseline

  if (prefix) {
    const actualPrefix = text.slice(Math.max(0, position - prefix.length), position);
    score *= similarity(actualPrefix, prefix);
  }

  if (suffix) {
    const actualSuffix = text.slice(position + exact.length, position + exact.length + suffix.length);
    score *= similarity(actualSuffix, suffix);
  }

  return score;
}

function similarity(a: string, b: string): number {
  // Levenshtein-based similarity ratio
  const distance = levenshtein(a.toLowerCase(), b.toLowerCase());
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}
```

### Alternatives Considered

| Alternative | Rejected Because |
|-------------|------------------|
| XPath selectors | Fragile when DOM structure changes |
| CSS selectors | Cannot select text within elements |
| Character offsets only | Breaks when any text is added/removed |
| Hypothes.is anchoring lib | Heavy dependency, we can implement subset |

### References
- [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/)
- [W3C Selectors and States](https://www.w3.org/TR/selectors-states/)
- [Hypothes.is Anchoring](https://github.com/hypothesis/client/tree/main/src/annotator/anchoring)

---

## 3. ElevenLabs API Streaming Best Practices

### Decision
Use ElevenLabs HTTP streaming endpoint with chunked transfer encoding for real-time audio playback.

### Rationale
Streaming reduces time-to-first-byte from ~2s (full generation) to ~200ms (first chunk). Essential for good UX.

### Implementation Pattern

```typescript
// src/adapters/audio/elevenlabs.adapter.ts

async function streamTts(text: string, voiceId: string, apiKey: string): AsyncGenerator<Uint8Array> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs API error: ${response.status}`);
  }

  const reader = response.body!.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield value;
  }
}

// Usage with MediaSource for gapless playback
async function playStream(stream: AsyncGenerator<Uint8Array>): Promise<void> {
  const mediaSource = new MediaSource();
  const audio = new Audio();
  audio.src = URL.createObjectURL(mediaSource);

  await new Promise(resolve => mediaSource.addEventListener('sourceopen', resolve, { once: true }));

  const sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');

  for await (const chunk of stream) {
    await new Promise(resolve => {
      if (sourceBuffer.updating) {
        sourceBuffer.addEventListener('updateend', resolve, { once: true });
      } else {
        resolve(undefined);
      }
    });
    sourceBuffer.appendBuffer(chunk);
  }

  mediaSource.endOfStream();
  await audio.play();
}
```

### Error Handling

```typescript
const ELEVENLABS_ERRORS = {
  401: 'Invalid API key',
  429: 'Rate limit exceeded - wait and retry',
  400: 'Text too long or invalid voice',
  500: 'ElevenLabs server error',
};

function handleElevenLabsError(status: number): string {
  return ELEVENLABS_ERRORS[status] || `Unknown error: ${status}`;
}
```

### Alternatives Considered

| Alternative | Rejected Because |
|-------------|------------------|
| WebSocket streaming | More complex, HTTP streaming sufficient |
| Full audio download | 2+ second delay before playback |
| Browser TTS fallback | Lower quality, no streaming |

### References
- [ElevenLabs Streaming API](https://docs.elevenlabs.io/api-reference/text-to-speech-stream)
- [MediaSource Extensions](https://developer.mozilla.org/en-US/docs/Web/API/MediaSource)

---

## 4. Cross-browser Permission Request Patterns

### Decision
Use `permissions.request()` API for on-demand host permissions with graceful UI feedback.

### Rationale
MV3 discourages `<all_urls>` permission. On-demand permissions improve user trust and store approval chances.

### Implementation Pattern

```typescript
// src/utils/permissions.ts

async function ensureHostPermission(url: string): Promise<boolean> {
  const origin = new URL(url).origin + '/*';

  // Check if already granted
  const hasPermission = await browser.permissions.contains({
    origins: [origin]
  });

  if (hasPermission) return true;

  // Request permission (triggers browser UI)
  const granted = await browser.permissions.request({
    origins: [origin]
  });

  return granted;
}

// Usage in popup
async function handleReadClick(tabUrl: string): Promise<void> {
  const hasPermission = await ensureHostPermission(tabUrl);

  if (!hasPermission) {
    showMessage('Permission required to read this page');
    return;
  }

  // Proceed with content script injection
  await browser.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
}
```

### Cross-browser Differences

| Aspect | Chrome | Firefox |
|--------|--------|---------|
| `permissions.request()` | Must be called from user gesture | Must be called from user gesture |
| `scripting.executeScript()` | Requires `scripting` permission | Requires `scripting` permission |
| Host permissions | Prompts user | Prompts user |
| Service workers | Required in MV3 | Optional in MV3 |

### Alternatives Considered

| Alternative | Rejected Because |
|-------------|------------------|
| `<all_urls>` at install | Scary permission, store rejection risk |
| `activeTab` only | Doesn't persist, re-requests on each click |
| Content scripts in manifest | No granular control |

### References
- [Chrome Permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Firefox Permissions API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions)

---

## 5. Bundle Size Impact Analysis

### Current State

```
pdfjs-dist: ~2.5 MB (minified)
tesseract-wasm: ~3.0 MB (WASM + worker)
Total PDF-related: ~5.5 MB
```

### After Removal

```
ElevenLabs adapter: ~5 KB
Highlight anchoring: ~10 KB
Offscreen document: ~2 KB
Total new code: ~17 KB
```

### Net Impact
**Reduction: ~5.4 MB** (exceeds FR-004 requirement of 2MB reduction)

---

## Summary of Decisions

| Topic | Decision | Key Benefit |
|-------|----------|-------------|
| Chrome MV3 Audio | Offscreen Documents API | Full Audio API access in MV3 |
| Highlight Storage | W3C Web Annotation / TextQuoteSelector | Industry standard, robust re-anchoring |
| TTS Streaming | ElevenLabs HTTP streaming | ~200ms time-to-first-byte |
| Permissions | On-demand `permissions.request()` | Better user trust, store compliance |
| Cross-browser | Adapter pattern with browser detection | Single codebase, browser-specific optimizations |

All NEEDS CLARIFICATION items from Technical Context have been resolved.
