/**
 * Playback State Entity
 *
 * Immutable state model for playback orchestration.
 * Contains all state needed to manage TTS playback.
 *
 * @module core/playback/playback-state
 */

import type { ExtractionMode, PlaybackError, ProviderId } from '../shared/errors';

/**
 * Playback status.
 */
export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error';

/**
 * Immutable playback state.
 */
export interface PlaybackState {
  readonly status: PlaybackStatus;
  readonly currentParagraphIndex: number;
  readonly totalParagraphs: number;
  readonly paragraphs: readonly string[];
  readonly progress: number; // 0-1 within current paragraph
  readonly speed: number;
  readonly provider: ProviderId;
  readonly voice: string | null;
  readonly mode: ExtractionMode;
  readonly activeTabId: number | null;
  readonly currentPageUrl: string | null;
  readonly error: PlaybackError | null;
}

/**
 * Initial/default playback state.
 */
export const initialPlaybackState: PlaybackState = {
  status: 'idle',
  currentParagraphIndex: 0,
  totalParagraphs: 0,
  paragraphs: [],
  progress: 0,
  speed: 1.0,
  provider: 'elevenlabs',
  voice: null,
  mode: 'article',
  activeTabId: null,
  currentPageUrl: null,
  error: null,
};

/**
 * Create a new state with updated fields.
 */
export function updatePlaybackState(
  state: PlaybackState,
  updates: Partial<PlaybackState>,
): PlaybackState {
  return { ...state, ...updates };
}

/**
 * State transitions - returns new state with updated status.
 */
export const playbackStateTransitions = {
  /**
   * Start loading audio for playback.
   */
  startLoading: (
    state: PlaybackState,
    paragraphs: readonly string[],
    tabId: number,
    pageUrl: string,
  ): PlaybackState => ({
    ...state,
    status: 'loading',
    paragraphs,
    totalParagraphs: paragraphs.length,
    currentParagraphIndex: 0,
    progress: 0,
    activeTabId: tabId,
    currentPageUrl: pageUrl,
    error: null,
  }),

  /**
   * Audio is ready, start playing.
   */
  startPlaying: (state: PlaybackState): PlaybackState => ({
    ...state,
    status: 'playing',
    error: null,
  }),

  /**
   * Pause playback.
   */
  pause: (state: PlaybackState): PlaybackState => ({
    ...state,
    status: 'paused',
  }),

  /**
   * Resume playback.
   */
  resume: (state: PlaybackState): PlaybackState => ({
    ...state,
    status: 'playing',
  }),

  /**
   * Stop playback and reset.
   */
  stop: (state: PlaybackState): PlaybackState => ({
    ...state,
    status: 'stopped',
    progress: 0,
  }),

  /**
   * Move to next paragraph.
   */
  nextParagraph: (state: PlaybackState): PlaybackState => {
    const nextIndex = state.currentParagraphIndex + 1;
    if (nextIndex >= state.totalParagraphs) {
      return { ...state, status: 'stopped', progress: 1 };
    }
    return {
      ...state,
      status: 'loading',
      currentParagraphIndex: nextIndex,
      progress: 0,
    };
  },

  /**
   * Move to previous paragraph.
   */
  previousParagraph: (state: PlaybackState): PlaybackState => {
    const prevIndex = Math.max(0, state.currentParagraphIndex - 1);
    return {
      ...state,
      status: 'loading',
      currentParagraphIndex: prevIndex,
      progress: 0,
    };
  },

  /**
   * Seek to specific paragraph.
   */
  seekToParagraph: (state: PlaybackState, index: number): PlaybackState => {
    const clampedIndex = Math.max(0, Math.min(index, state.totalParagraphs - 1));
    return {
      ...state,
      status: 'loading',
      currentParagraphIndex: clampedIndex,
      progress: 0,
    };
  },

  /**
   * Update progress within current paragraph.
   */
  updateProgress: (state: PlaybackState, progress: number): PlaybackState => ({
    ...state,
    progress: Math.max(0, Math.min(1, progress)),
  }),

  /**
   * Set error state.
   */
  setError: (state: PlaybackState, error: PlaybackError): PlaybackState => ({
    ...state,
    status: 'error',
    error,
  }),

  /**
   * Reset to idle state.
   */
  reset: (): PlaybackState => initialPlaybackState,

  /**
   * Update settings (speed, provider, voice).
   */
  updateSettings: (
    state: PlaybackState,
    settings: {
      speed?: number;
      provider?: ProviderId;
      voice?: string | null;
      mode?: ExtractionMode;
    },
  ): PlaybackState => ({
    ...state,
    ...(settings.speed !== undefined && { speed: settings.speed }),
    ...(settings.provider !== undefined && { provider: settings.provider }),
    ...(settings.voice !== undefined && { voice: settings.voice }),
    ...(settings.mode !== undefined && { mode: settings.mode }),
  }),
};

/**
 * Validation helpers.
 */
export const playbackStateValidation = {
  /**
   * Check if playback can be started.
   */
  canStart: (state: PlaybackState): boolean =>
    state.status === 'idle' || state.status === 'stopped' || state.status === 'error',

  /**
   * Check if playback can be paused.
   */
  canPause: (state: PlaybackState): boolean => state.status === 'playing',

  /**
   * Check if playback can be resumed.
   */
  canResume: (state: PlaybackState): boolean => state.status === 'paused',

  /**
   * Check if there is a next paragraph.
   */
  hasNext: (state: PlaybackState): boolean =>
    state.currentParagraphIndex < state.totalParagraphs - 1,

  /**
   * Check if there is a previous paragraph.
   */
  hasPrevious: (state: PlaybackState): boolean => state.currentParagraphIndex > 0,

  /**
   * Check if paragraph index is valid.
   */
  isValidParagraphIndex: (state: PlaybackState, index: number): boolean =>
    index >= 0 && index < state.totalParagraphs,
};
