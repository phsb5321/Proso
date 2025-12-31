# Message Contracts: Premium UI Overhaul

**Feature Branch**: `002-ui-overhaul`
**Created**: 2025-12-30

## Overview

This document defines the message-passing contracts between the popup UI and background service worker for the UI overhaul features. These contracts extend the existing messaging system.

---

## Popup → Background Messages

### 1. getVisualizerData

Request real-time audio frequency data for visualization.

**Request**:
```json
{
  "action": "getVisualizerData"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "frequencyData": [128, 140, 155, ...],
    "binCount": 64,
    "isPlaying": true
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Audio context not initialized"
}
```

**Notes**:
- Called at 60fps via `requestAnimationFrame` when popup is open and audio is playing
- `frequencyData` is an array of integers 0-255 representing frequency magnitudes
- `binCount` is typically 64 (half of fftSize 128)

---

### 2. getPlaybackState (Extended)

Existing action, extended response.

**Request**:
```json
{
  "action": "getState"
}
```

**Response** (extended):
```json
{
  "isPlaying": true,
  "isPaused": false,
  "status": "playing",
  "progress": {
    "current": 45.5,
    "total": 120.0,
    "percent": 37.9
  },
  "currentIndex": 3,
  "totalParagraphs": 12,
  "hasAudioContext": true
}
```

**New Fields**:
- `status`: One of `"idle"`, `"loading"`, `"playing"`, `"paused"`, `"error"`
- `progress.percent`: Pre-calculated percentage
- `hasAudioContext`: Whether audio visualization is available

---

### 3. setOnboardingComplete

Mark onboarding as complete (dismiss first-time tooltip).

**Request**:
```json
{
  "action": "setOnboardingComplete"
}
```

**Response**:
```json
{
  "success": true
}
```

---

## Background → Popup Messages

### 1. playbackState (Extended)

Pushed when playback state changes.

**Message**:
```json
{
  "type": "playbackState",
  "status": "playing",
  "isPlaying": true,
  "isPaused": false,
  "currentIndex": 0,
  "totalParagraphs": 12
}
```

**New Fields**:
- `status`: Enum value for UI state machine
- `isPaused`: Explicit pause state (separate from !isPlaying for loading state)

---

### 2. progress (Enhanced)

Pushed periodically during playback.

**Message**:
```json
{
  "type": "progress",
  "current": 45.5,
  "total": 120.0,
  "percent": 37.9,
  "currentIndex": 3,
  "totalParagraphs": 12,
  "paragraphProgress": {
    "current": 8.2,
    "total": 15.0
  }
}
```

**New Fields**:
- `percent`: Pre-calculated percentage
- `paragraphProgress`: Progress within current paragraph (optional)

---

### 3. visualizerData

Pushed continuously during playback for visualization.

**Message**:
```json
{
  "type": "visualizerData",
  "frequencyData": [128, 140, 155, 132, ...],
  "timestamp": 1703956800000
}
```

**Notes**:
- Pushed at animation frame rate (~60fps) when audio is playing
- `timestamp` for sync debugging

---

### 4. error (Enhanced)

Pushed when an error occurs.

**Message**:
```json
{
  "type": "error",
  "error": "Failed to connect to OpenAI API",
  "code": "API_CONNECTION_ERROR",
  "recoverable": true,
  "action": {
    "label": "Check API Key",
    "type": "openSettings"
  }
}
```

**New Fields**:
- `code`: Machine-readable error code
- `recoverable`: Whether user can retry
- `action`: Suggested action for user (optional)

**Error Codes**:
| Code | Description |
|------|-------------|
| `API_CONNECTION_ERROR` | Failed to reach TTS API |
| `API_AUTH_ERROR` | Invalid or missing API key |
| `API_QUOTA_ERROR` | Rate limit or quota exceeded |
| `NO_TEXT_CONTENT` | No readable content found |
| `NO_SELECTION` | Selection mode but no text selected |
| `AUDIO_DECODE_ERROR` | Failed to decode audio response |
| `AUDIO_CONTEXT_ERROR` | Web Audio API unavailable |

---

### 5. status (Enhanced)

Generic status messages for user feedback.

**Message**:
```json
{
  "type": "status",
  "text": "Loading page content...",
  "level": "info",
  "duration": 3000,
  "dismissible": true
}
```

**Levels**:
- `info`: Neutral information (default blue)
- `success`: Positive confirmation (green)
- `warning`: Caution notice (yellow/orange)
- `error`: Error message (red)

**New Fields**:
- `duration`: Auto-dismiss after ms (0 = no auto-dismiss)
- `dismissible`: Whether user can manually dismiss

---

## ARIA Announcement Contract

For screen reader announcements, the popup maintains a hidden live region.

**Announcement Types**:

| Event | Announcement Text | Politeness |
|-------|-------------------|------------|
| Playback started | "Playing" | polite |
| Playback paused | "Paused" | polite |
| Playback stopped | "Stopped" | polite |
| Paragraph changed | "Paragraph {n} of {total}" | polite |
| Error occurred | "{error message}" | assertive |
| Loading started | "Loading..." | polite |
| Loading complete | "Ready" | polite |

---

## Backward Compatibility

All new fields are additive. Existing popup code will continue to work:

- New `status` field alongside existing `isPlaying`
- New `percent` field alongside existing `current`/`total`
- New message types (`visualizerData`) can be ignored if not handled

The background script checks if the popup supports visualizer before sending high-frequency visualizer data:

```javascript
// In popup init
browser.runtime.sendMessage({
  action: 'registerCapabilities',
  capabilities: ['visualizer', 'enhancedErrors']
});
```
