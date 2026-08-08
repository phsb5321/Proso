// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso Playback State Zod Schemas
 *
 * Schemas for TTS playback state management.
 *
 * @module utils/schemas/playback.schema
 */

import { z } from 'zod';

/**
 * Playback status states
 */
export const PlaybackStatusSchema = z.enum(['idle', 'loading', 'playing', 'paused', 'error']);

export type PlaybackStatus = z.infer<typeof PlaybackStatusSchema>;

/**
 * PlaybackState schema - Current reading state (in-memory only)
 *
 * Managed by background script for cross-tab coordination.
 */
export const PlaybackStateSchema = z.object({
  // Identity
  /** Current page URL */
  url: z.string().url(),

  /** Browser tab ID */
  tabId: z.number().int().positive(),

  // Position
  /** Current paragraph index (0-based) */
  currentParagraph: z.number().int().nonnegative(),

  /** Position within current paragraph in milliseconds */
  positionMs: z.number().nonnegative(),

  /** Total paragraphs in article */
  totalParagraphs: z.number().int().positive(),

  // Status
  /** Current playback status */
  status: PlaybackStatusSchema,

  /** Playback speed (0.5 - 2.0) */
  speed: z.number().min(0.5).max(2.0),

  // Error info (when status === 'error')
  /** Error message if playback failed */
  errorMessage: z.string().optional(),
});

export type PlaybackState = z.infer<typeof PlaybackStateSchema>;

/**
 * Initial playback state factory
 */
function createInitialPlaybackState(params: {
  url: string;
  tabId: number;
  totalParagraphs: number;
  speed?: number;
}): PlaybackState {
  return {
    url: params.url,
    tabId: params.tabId,
    currentParagraph: 0,
    positionMs: 0,
    totalParagraphs: params.totalParagraphs,
    status: 'idle',
    speed: params.speed ?? 1.0,
  };
}

/**
 * State transition helpers
 */
const PlaybackTransitions = {
  /** Transition to loading state */
  toLoading(state: PlaybackState): PlaybackState {
    return { ...state, status: 'loading', errorMessage: undefined };
  },

  /** Transition to playing state */
  toPlaying(state: PlaybackState): PlaybackState {
    return { ...state, status: 'playing', errorMessage: undefined };
  },

  /** Transition to paused state */
  toPaused(state: PlaybackState): PlaybackState {
    return { ...state, status: 'paused' };
  },

  /** Transition to idle state (stopped) */
  toIdle(state: PlaybackState): PlaybackState {
    return {
      ...state,
      status: 'idle',
      currentParagraph: 0,
      positionMs: 0,
      errorMessage: undefined,
    };
  },

  /** Transition to error state */
  toError(state: PlaybackState, errorMessage: string): PlaybackState {
    return { ...state, status: 'error', errorMessage };
  },

  /** Update position */
  updatePosition(state: PlaybackState, positionMs: number): PlaybackState {
    return { ...state, positionMs };
  },

  /** Move to next paragraph */
  nextParagraph(state: PlaybackState): PlaybackState {
    const next = state.currentParagraph + 1;
    if (next >= state.totalParagraphs) {
      // End of article
      return { ...state, status: 'idle', currentParagraph: 0, positionMs: 0 };
    }
    return { ...state, currentParagraph: next, positionMs: 0, status: 'loading' };
  },

  /** Move to previous paragraph */
  previousParagraph(state: PlaybackState): PlaybackState {
    const prev = Math.max(0, state.currentParagraph - 1);
    return { ...state, currentParagraph: prev, positionMs: 0, status: 'loading' };
  },

  /** Jump to specific paragraph */
  seekToParagraph(state: PlaybackState, index: number): PlaybackState {
    const clamped = Math.max(0, Math.min(index, state.totalParagraphs - 1));
    return { ...state, currentParagraph: clamped, positionMs: 0, status: 'loading' };
  },

  /** Update playback speed */
  setSpeed(state: PlaybackState, speed: number): PlaybackState {
    const clamped = Math.max(0.5, Math.min(2.0, speed));
    return { ...state, speed: clamped };
  },
} as const;

/**
 * Calculate progress percentage
 */
function calculateProgress(state: PlaybackState): number {
  if (state.totalParagraphs === 0) return 0;
  return Math.round((state.currentParagraph / state.totalParagraphs) * 100);
}
