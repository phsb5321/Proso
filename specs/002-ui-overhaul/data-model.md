# Data Model: Premium UI Overhaul

**Feature Branch**: `002-ui-overhaul`
**Created**: 2025-12-30

## Overview

This document defines the data structures and state management for the UI overhaul. Since this is a UI-focused feature, the data model focuses on UI state, theme configuration, and message contracts between popup and background.

## Entities

### 1. ThemeConfig

Represents the color theme configuration.

```typescript
interface ThemeConfig {
  mode: 'light' | 'dark' | 'system';  // User preference, 'system' follows OS
  // All colors defined as CSS custom properties
}
```

**Storage**: CSS custom properties (no runtime storage needed - CSS handles system detection)

**Validation Rules**:
- Mode must be one of: 'light', 'dark', 'system'
- Default: 'system'

---

### 2. AudioVisualizerState

Represents the current state of the audio visualizer.

```typescript
interface AudioVisualizerState {
  isActive: boolean;           // Whether visualizer should render
  frequencyData: Uint8Array;   // FFT frequency bin values (0-255)
  binCount: number;            // Number of frequency bins (e.g., 64)
  animationFrameId: number | null;  // For cleanup
}
```

**State Transitions**:
- `idle` → `active`: When playback starts
- `active` → `paused`: When playback pauses (freeze visualization)
- `active` → `idle`: When playback stops (reset visualization)
- `paused` → `active`: When playback resumes

**Validation Rules**:
- `frequencyData` array length must equal `binCount`
- Values in range 0-255 (Uint8Array constraint)

---

### 3. PlaybackState (Extended)

Extends existing playback state with UI-specific fields.

```typescript
interface PlaybackState {
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  progress: {
    current: number;    // Seconds elapsed
    total: number;      // Total duration
    percent: number;    // 0-100
  };
  currentParagraph: {
    index: number;      // 0-based
    total: number;      // Total paragraphs
  };
  error?: {
    message: string;    // User-friendly error message
    code?: string;      // Error code for debugging
  };
}
```

**State Transitions**:
```
idle → loading → playing ⟷ paused → idle
         ↓                    ↓
       error              error
```

---

### 4. AccessibilityPreferences

User preferences for accessibility features.

```typescript
interface AccessibilityPreferences {
  reduceMotion: boolean;      // Follows system 'prefers-reduced-motion'
  highContrast: boolean;      // Follows system 'prefers-contrast'
  announceStateChanges: boolean;  // Use ARIA live regions
}
```

**Storage**: Not stored - derived from CSS media queries at runtime

---

### 5. UIState

Composite state for the popup UI.

```typescript
interface UIState {
  playback: PlaybackState;
  visualizer: AudioVisualizerState;
  onboarding: {
    isFirstVisit: boolean;
    hasSeenTooltip: boolean;
  };
  statusBanner: {
    visible: boolean;
    message: string;
    level: 'info' | 'success' | 'warning' | 'error';
  };
}
```

**Storage**:
- `onboarding.isFirstVisit`: `browser.storage.local` (persisted)
- `onboarding.hasSeenTooltip`: `browser.storage.local` (persisted)
- Others: In-memory only (not persisted)

---

## Message Contracts

### Popup → Background Messages

#### GetVisualizerData

Request current frequency data for visualization.

```typescript
interface GetVisualizerDataRequest {
  action: 'getVisualizerData';
}

interface GetVisualizerDataResponse {
  frequencyData: number[];  // Array of 0-255 values
  isPlaying: boolean;
}
```

**Frequency**: Called via `requestAnimationFrame` (~60fps when playing)

---

#### GetPlaybackState

Request current playback state.

```typescript
interface GetPlaybackStateRequest {
  action: 'getState';
}

interface GetPlaybackStateResponse {
  isPlaying: boolean;
  progress: {
    current: number;
    total: number;
  };
  currentIndex: number;
  totalParagraphs: number;
}
```

---

### Background → Popup Messages

#### PlaybackStateUpdate

Pushed when playback state changes.

```typescript
interface PlaybackStateUpdate {
  type: 'playbackState';
  isPlaying: boolean;
  currentIndex?: number;
  totalParagraphs?: number;
}
```

---

#### ProgressUpdate

Pushed periodically during playback.

```typescript
interface ProgressUpdate {
  type: 'progress';
  current: number;
  total: number;
  currentIndex?: number;
  totalParagraphs?: number;
}
```

---

#### ErrorNotification

Pushed when an error occurs.

```typescript
interface ErrorNotification {
  type: 'error';
  error: string;
  code?: string;
}
```

---

## Storage Schema

### Extension Storage (`browser.storage.local`)

```typescript
interface StorageSchema {
  // Existing (unchanged)
  provider: string;
  voice: string;
  speed: number;
  mode: string;
  openaiApiKey: string;
  elevenlabsApiKey: string;
  cartesiaApiKey: string;
  groqApiKey: string;

  // New for UI overhaul
  ui: {
    onboardingComplete: boolean;
    themeOverride?: 'light' | 'dark';  // undefined = follow system
  };
}
```

**Migration**: No migration needed - new `ui` key added alongside existing keys.

---

## CSS Custom Properties (Design Tokens)

### Color Tokens

```css
/* Base colors - defined per theme */
--color-background-primary
--color-background-secondary
--color-background-tertiary
--color-text-primary
--color-text-secondary
--color-text-muted
--color-accent-primary
--color-accent-secondary
--color-border
--color-success
--color-warning
--color-error

/* Semantic tokens */
--color-button-bg
--color-button-text
--color-button-hover
--color-input-bg
--color-input-border
--color-focus-ring
```

### Spacing Tokens

```css
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 12px;
--spacing-lg: 16px;
--spacing-xl: 24px;
--spacing-2xl: 32px;
```

### Typography Tokens

```css
--font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
--font-size-xs: 10px;
--font-size-sm: 12px;
--font-size-md: 14px;
--font-size-lg: 16px;
--font-size-xl: 20px;
--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-bold: 700;
```

### Animation Tokens

```css
--transition-fast: 100ms ease;
--transition-normal: 200ms ease;
--transition-slow: 300ms ease;

@media (prefers-reduced-motion: reduce) {
  --transition-fast: 0ms;
  --transition-normal: 0ms;
  --transition-slow: 0ms;
}
```

### Size Tokens

```css
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-full: 9999px;

--min-touch-target: 44px;
--popup-width: 360px;
--popup-min-height: 480px;
```

---

## Relationships

```
┌─────────────────┐
│    UIState      │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌──────────┐ ┌───────────────────┐
│Playback  │ │AudioVisualizerState│
│State     │ │                   │
└────┬─────┘ └─────────┬─────────┘
     │                 │
     │    ┌────────────┘
     │    │
     ▼    ▼
┌─────────────────────────────────┐
│     Background Service          │
│  (Audio Context + Analyser)     │
└─────────────────────────────────┘
```

The popup's UIState depends on messages from the background service. The AudioVisualizerState is synchronized with actual audio playback in the background.
