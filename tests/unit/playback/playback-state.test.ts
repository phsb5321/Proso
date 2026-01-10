/**
 * Unit tests for Playback State Entity
 * Feature: 041-firefox-first-pivot (T3.3)
 *
 * Tests the immutable state model and state transitions for playback orchestration.
 */

import { describe, it, expect } from '@jest/globals';
import {
  initialPlaybackState,
  updatePlaybackState,
  playbackStateTransitions,
  playbackStateValidation,
  type PlaybackState,
  type PlaybackStatus,
} from '../../../src/core/playback/playback-state';
import { playbackError } from '../../../src/core/shared/errors';

describe('PlaybackState', () => {
  describe('initialPlaybackState', () => {
    it('should have correct initial values', () => {
      expect(initialPlaybackState.status).toBe('idle');
      expect(initialPlaybackState.currentParagraphIndex).toBe(0);
      expect(initialPlaybackState.totalParagraphs).toBe(0);
      expect(initialPlaybackState.paragraphs).toEqual([]);
      expect(initialPlaybackState.progress).toBe(0);
      expect(initialPlaybackState.speed).toBe(1.0);
      expect(initialPlaybackState.provider).toBe('browser');
      expect(initialPlaybackState.voice).toBeNull();
      expect(initialPlaybackState.mode).toBe('article');
      expect(initialPlaybackState.activeTabId).toBeNull();
      expect(initialPlaybackState.currentPageUrl).toBeNull();
      expect(initialPlaybackState.error).toBeNull();
    });

    it('should be immutable (readonly arrays)', () => {
      // TypeScript enforces readonly at compile time
      // We verify the shape exists
      expect(Object.isFrozen(initialPlaybackState.paragraphs)).toBe(false);
      // But the type system prevents mutation
      expect(Array.isArray(initialPlaybackState.paragraphs)).toBe(true);
    });
  });

  describe('updatePlaybackState', () => {
    it('should create new state with updated fields', () => {
      const newState = updatePlaybackState(initialPlaybackState, {
        status: 'loading',
        speed: 1.5,
      });

      expect(newState.status).toBe('loading');
      expect(newState.speed).toBe(1.5);
      // Original unchanged
      expect(initialPlaybackState.status).toBe('idle');
      expect(initialPlaybackState.speed).toBe(1.0);
    });

    it('should preserve unmodified fields', () => {
      const modifiedState = updatePlaybackState(initialPlaybackState, {
        provider: 'openai',
      });

      expect(modifiedState.status).toBe('idle');
      expect(modifiedState.progress).toBe(0);
      expect(modifiedState.mode).toBe('article');
      expect(modifiedState.provider).toBe('openai');
    });

    it('should handle empty updates', () => {
      const sameState = updatePlaybackState(initialPlaybackState, {});

      expect(sameState).toEqual(initialPlaybackState);
    });
  });

  describe('playbackStateTransitions', () => {
    describe('startLoading', () => {
      it('should transition from idle to loading', () => {
        const paragraphs = ['Para 1', 'Para 2', 'Para 3'];
        const tabId = 123;
        const pageUrl = 'https://example.com/article';

        const newState = playbackStateTransitions.startLoading(
          initialPlaybackState,
          paragraphs,
          tabId,
          pageUrl,
        );

        expect(newState.status).toBe('loading');
        expect(newState.paragraphs).toEqual(paragraphs);
        expect(newState.totalParagraphs).toBe(3);
        expect(newState.currentParagraphIndex).toBe(0);
        expect(newState.progress).toBe(0);
        expect(newState.activeTabId).toBe(tabId);
        expect(newState.currentPageUrl).toBe(pageUrl);
        expect(newState.error).toBeNull();
      });

      it('should reset current index when loading new content', () => {
        const existingState: PlaybackState = {
          ...initialPlaybackState,
          status: 'stopped',
          currentParagraphIndex: 5,
          progress: 0.7,
        };

        const newState = playbackStateTransitions.startLoading(
          existingState,
          ['New paragraph'],
          1,
          'https://new.url',
        );

        expect(newState.currentParagraphIndex).toBe(0);
        expect(newState.progress).toBe(0);
      });

      it('should clear previous error', () => {
        const errorState: PlaybackState = {
          ...initialPlaybackState,
          status: 'error',
          error: playbackError.playbackFailed('Test error'),
        };

        const newState = playbackStateTransitions.startLoading(
          errorState,
          ['Para 1'],
          1,
          'https://example.com',
        );

        expect(newState.error).toBeNull();
        expect(newState.status).toBe('loading');
      });
    });

    describe('startPlaying', () => {
      it('should transition from loading to playing', () => {
        const loadingState: PlaybackState = {
          ...initialPlaybackState,
          status: 'loading',
          paragraphs: ['Para 1'],
          totalParagraphs: 1,
        };

        const newState = playbackStateTransitions.startPlaying(loadingState);

        expect(newState.status).toBe('playing');
        expect(newState.error).toBeNull();
      });

      it('should preserve all other state', () => {
        const loadingState: PlaybackState = {
          ...initialPlaybackState,
          status: 'loading',
          paragraphs: ['Para 1', 'Para 2'],
          totalParagraphs: 2,
          currentParagraphIndex: 1,
          speed: 1.5,
          provider: 'openai',
        };

        const newState = playbackStateTransitions.startPlaying(loadingState);

        expect(newState.paragraphs).toEqual(['Para 1', 'Para 2']);
        expect(newState.currentParagraphIndex).toBe(1);
        expect(newState.speed).toBe(1.5);
        expect(newState.provider).toBe('openai');
      });
    });

    describe('pause', () => {
      it('should transition from playing to paused', () => {
        const playingState: PlaybackState = {
          ...initialPlaybackState,
          status: 'playing',
          progress: 0.5,
        };

        const newState = playbackStateTransitions.pause(playingState);

        expect(newState.status).toBe('paused');
        expect(newState.progress).toBe(0.5); // Progress preserved
      });

      it('should preserve current paragraph index', () => {
        const playingState: PlaybackState = {
          ...initialPlaybackState,
          status: 'playing',
          currentParagraphIndex: 3,
        };

        const newState = playbackStateTransitions.pause(playingState);

        expect(newState.currentParagraphIndex).toBe(3);
      });
    });

    describe('resume', () => {
      it('should transition from paused to playing', () => {
        const pausedState: PlaybackState = {
          ...initialPlaybackState,
          status: 'paused',
          progress: 0.75,
          currentParagraphIndex: 2,
        };

        const newState = playbackStateTransitions.resume(pausedState);

        expect(newState.status).toBe('playing');
        expect(newState.progress).toBe(0.75);
        expect(newState.currentParagraphIndex).toBe(2);
      });
    });

    describe('pause/resume cycle', () => {
      it('should preserve state through pause/resume cycle', () => {
        const playingState: PlaybackState = {
          ...initialPlaybackState,
          status: 'playing',
          paragraphs: ['Para 1', 'Para 2', 'Para 3'],
          totalParagraphs: 3,
          currentParagraphIndex: 1,
          progress: 0.6,
          speed: 1.25,
          activeTabId: 42,
        };

        const paused = playbackStateTransitions.pause(playingState);
        const resumed = playbackStateTransitions.resume(paused);

        expect(resumed.status).toBe('playing');
        expect(resumed.currentParagraphIndex).toBe(1);
        expect(resumed.progress).toBe(0.6);
        expect(resumed.speed).toBe(1.25);
        expect(resumed.activeTabId).toBe(42);
      });
    });

    describe('stop', () => {
      it('should transition to stopped and reset progress', () => {
        const playingState: PlaybackState = {
          ...initialPlaybackState,
          status: 'playing',
          progress: 0.8,
          currentParagraphIndex: 5,
        };

        const newState = playbackStateTransitions.stop(playingState);

        expect(newState.status).toBe('stopped');
        expect(newState.progress).toBe(0);
        // Current paragraph index is preserved
        expect(newState.currentParagraphIndex).toBe(5);
      });

      it('should work from any playing-like state', () => {
        const pausedState: PlaybackState = {
          ...initialPlaybackState,
          status: 'paused',
          progress: 0.5,
        };

        const newState = playbackStateTransitions.stop(pausedState);

        expect(newState.status).toBe('stopped');
        expect(newState.progress).toBe(0);
      });

      it('should preserve paragraphs and tab info', () => {
        const playingState: PlaybackState = {
          ...initialPlaybackState,
          status: 'playing',
          paragraphs: ['Para 1', 'Para 2'],
          totalParagraphs: 2,
          activeTabId: 100,
          currentPageUrl: 'https://example.com',
        };

        const newState = playbackStateTransitions.stop(playingState);

        expect(newState.paragraphs).toEqual(['Para 1', 'Para 2']);
        expect(newState.totalParagraphs).toBe(2);
        expect(newState.activeTabId).toBe(100);
        expect(newState.currentPageUrl).toBe('https://example.com');
      });
    });

    describe('nextParagraph', () => {
      it('should advance to next paragraph and set loading status', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          status: 'playing',
          paragraphs: ['Para 1', 'Para 2', 'Para 3'],
          totalParagraphs: 3,
          currentParagraphIndex: 0,
          progress: 0.9,
        };

        const newState = playbackStateTransitions.nextParagraph(state);

        expect(newState.currentParagraphIndex).toBe(1);
        expect(newState.status).toBe('loading');
        expect(newState.progress).toBe(0);
      });

      it('should stop playback when reaching end', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          status: 'playing',
          paragraphs: ['Para 1', 'Para 2', 'Para 3'],
          totalParagraphs: 3,
          currentParagraphIndex: 2, // Last paragraph
        };

        const newState = playbackStateTransitions.nextParagraph(state);

        expect(newState.status).toBe('stopped');
        expect(newState.progress).toBe(1);
        expect(newState.currentParagraphIndex).toBe(2); // Stays at last
      });

      it('should handle single paragraph content', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          status: 'playing',
          paragraphs: ['Only paragraph'],
          totalParagraphs: 1,
          currentParagraphIndex: 0,
        };

        const newState = playbackStateTransitions.nextParagraph(state);

        expect(newState.status).toBe('stopped');
        expect(newState.currentParagraphIndex).toBe(0);
      });
    });

    describe('previousParagraph', () => {
      it('should go to previous paragraph and set loading status', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          status: 'playing',
          paragraphs: ['Para 1', 'Para 2', 'Para 3'],
          totalParagraphs: 3,
          currentParagraphIndex: 2,
          progress: 0.5,
        };

        const newState = playbackStateTransitions.previousParagraph(state);

        expect(newState.currentParagraphIndex).toBe(1);
        expect(newState.status).toBe('loading');
        expect(newState.progress).toBe(0);
      });

      it('should stay at first paragraph when already at beginning', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          status: 'playing',
          paragraphs: ['Para 1', 'Para 2'],
          totalParagraphs: 2,
          currentParagraphIndex: 0,
        };

        const newState = playbackStateTransitions.previousParagraph(state);

        expect(newState.currentParagraphIndex).toBe(0);
        expect(newState.status).toBe('loading');
      });
    });

    describe('seekToParagraph', () => {
      it('should seek to specific paragraph', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          status: 'playing',
          paragraphs: ['Para 1', 'Para 2', 'Para 3', 'Para 4', 'Para 5'],
          totalParagraphs: 5,
          currentParagraphIndex: 0,
        };

        const newState = playbackStateTransitions.seekToParagraph(state, 3);

        expect(newState.currentParagraphIndex).toBe(3);
        expect(newState.status).toBe('loading');
        expect(newState.progress).toBe(0);
      });

      it('should clamp index to valid range (too high)', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          paragraphs: ['Para 1', 'Para 2', 'Para 3'],
          totalParagraphs: 3,
          currentParagraphIndex: 0,
        };

        const newState = playbackStateTransitions.seekToParagraph(state, 100);

        expect(newState.currentParagraphIndex).toBe(2); // Clamped to max valid index
      });

      it('should clamp index to valid range (negative)', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          paragraphs: ['Para 1', 'Para 2'],
          totalParagraphs: 2,
          currentParagraphIndex: 1,
        };

        const newState = playbackStateTransitions.seekToParagraph(state, -5);

        expect(newState.currentParagraphIndex).toBe(0);
      });

      it('should handle empty paragraphs (edge case)', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          paragraphs: [],
          totalParagraphs: 0,
        };

        const newState = playbackStateTransitions.seekToParagraph(state, 0);

        // Clamped to -1, but Math.max(0, -1) = 0
        expect(newState.currentParagraphIndex).toBe(0);
        expect(newState.status).toBe('loading');
      });
    });

    describe('updateProgress', () => {
      it('should update progress value', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          status: 'playing',
          progress: 0,
        };

        const newState = playbackStateTransitions.updateProgress(state, 0.5);

        expect(newState.progress).toBe(0.5);
      });

      it('should clamp progress to 0-1 range (too high)', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          progress: 0.5,
        };

        const newState = playbackStateTransitions.updateProgress(state, 1.5);

        expect(newState.progress).toBe(1);
      });

      it('should clamp progress to 0-1 range (negative)', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          progress: 0.5,
        };

        const newState = playbackStateTransitions.updateProgress(state, -0.3);

        expect(newState.progress).toBe(0);
      });

      it('should preserve all other state', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          status: 'playing',
          currentParagraphIndex: 2,
          speed: 1.5,
        };

        const newState = playbackStateTransitions.updateProgress(state, 0.8);

        expect(newState.status).toBe('playing');
        expect(newState.currentParagraphIndex).toBe(2);
        expect(newState.speed).toBe(1.5);
      });
    });

    describe('setError', () => {
      it('should set error state', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          status: 'playing',
        };
        const error = playbackError.audioGeneration('openai', 'API timeout');

        const newState = playbackStateTransitions.setError(state, error);

        expect(newState.status).toBe('error');
        expect(newState.error).toEqual({
          type: 'audio_generation',
          provider: 'openai',
          message: 'API timeout',
        });
      });

      it('should preserve current state info', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          status: 'playing',
          currentParagraphIndex: 3,
          paragraphs: ['A', 'B', 'C', 'D'],
          totalParagraphs: 4,
        };

        const newState = playbackStateTransitions.setError(
          state,
          playbackError.playbackFailed('Network error'),
        );

        expect(newState.currentParagraphIndex).toBe(3);
        expect(newState.paragraphs).toEqual(['A', 'B', 'C', 'D']);
      });

      it('should handle different error types', () => {
        const state = initialPlaybackState;

        const noContentError = playbackStateTransitions.setError(
          state,
          playbackError.noContent('article'),
        );
        expect(noContentError.error).toEqual({ type: 'no_content', mode: 'article' });

        const indexError = playbackStateTransitions.setError(
          state,
          playbackError.invalidParagraphIndex(10, 5),
        );
        expect(indexError.error).toEqual({ type: 'invalid_paragraph_index', index: 10, max: 5 });

        const tabError = playbackStateTransitions.setError(
          state,
          playbackError.tabNotFound(999),
        );
        expect(tabError.error).toEqual({ type: 'tab_not_found', tabId: 999 });
      });
    });

    describe('reset', () => {
      it('should reset to initial state', () => {
        // Note: reset() doesn't take state - it's a factory that returns initial state
        const resetState = playbackStateTransitions.reset();

        expect(resetState).toEqual(initialPlaybackState);
        // Verify specific fields
        expect(resetState.status).toBe('idle');
        expect(resetState.paragraphs).toEqual([]);
        expect(resetState.provider).toBe('browser');
      });

      it('should always return same initial state shape', () => {
        const reset1 = playbackStateTransitions.reset();
        const reset2 = playbackStateTransitions.reset();

        expect(reset1).toEqual(reset2);
        expect(reset1).toEqual(initialPlaybackState);
      });

      it('should ignore current state (reset is independent)', () => {
        const modifiedState: PlaybackState = {
          status: 'playing',
          currentParagraphIndex: 5,
        totalParagraphs: 10,
        paragraphs: ['A', 'B', 'C'],
        progress: 0.8,
        speed: 2.0,
        provider: 'elevenlabs',
        voice: 'alloy',
        mode: 'full',
        activeTabId: 123,
        currentPageUrl: 'https://example.com',
        error: null,
      };

      // reset() doesn't take state as parameter, verifying it's truly a reset factory
      void modifiedState; // Referenced to avoid unused warning
      const resetState = playbackStateTransitions.reset();

      expect(resetState.status).toBe('idle');
      expect(resetState.provider).toBe('browser');
    });
    });

    describe('updateSettings', () => {
      it('should update speed', () => {
        const state = initialPlaybackState;

        const newState = playbackStateTransitions.updateSettings(state, {
          speed: 1.5,
        });

        expect(newState.speed).toBe(1.5);
      });

      it('should update provider', () => {
        const state = initialPlaybackState;

        const newState = playbackStateTransitions.updateSettings(state, {
          provider: 'openai',
        });

        expect(newState.provider).toBe('openai');
      });

      it('should update voice', () => {
        const state = initialPlaybackState;

        const newState = playbackStateTransitions.updateSettings(state, {
          voice: 'nova',
        });

        expect(newState.voice).toBe('nova');
      });

      it('should update mode', () => {
        const state = initialPlaybackState;

        const newState = playbackStateTransitions.updateSettings(state, {
          mode: 'selection',
        });

        expect(newState.mode).toBe('selection');
      });

      it('should update multiple settings at once', () => {
        const state = initialPlaybackState;

        const newState = playbackStateTransitions.updateSettings(state, {
          speed: 0.75,
          provider: 'elevenlabs',
          voice: 'bella',
          mode: 'full',
        });

        expect(newState.speed).toBe(0.75);
        expect(newState.provider).toBe('elevenlabs');
        expect(newState.voice).toBe('bella');
        expect(newState.mode).toBe('full');
      });

      it('should preserve unspecified settings', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          speed: 1.5,
          provider: 'openai',
          voice: 'alloy',
        };

        const newState = playbackStateTransitions.updateSettings(state, {
          speed: 2.0,
        });

        expect(newState.speed).toBe(2.0);
        expect(newState.provider).toBe('openai'); // Preserved
        expect(newState.voice).toBe('alloy'); // Preserved
      });

      it('should handle null voice', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          voice: 'alloy',
        };

        const newState = playbackStateTransitions.updateSettings(state, {
          voice: null,
        });

        expect(newState.voice).toBeNull();
      });

      it('should not change state with empty settings', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          speed: 1.5,
          provider: 'openai',
        };

        const newState = playbackStateTransitions.updateSettings(state, {});

        expect(newState.speed).toBe(1.5);
        expect(newState.provider).toBe('openai');
      });
    });
  });

  describe('playbackStateValidation', () => {
    describe('canStart', () => {
      it('should return true for idle state', () => {
        const state: PlaybackState = { ...initialPlaybackState, status: 'idle' };
        expect(playbackStateValidation.canStart(state)).toBe(true);
      });

      it('should return true for stopped state', () => {
        const state: PlaybackState = { ...initialPlaybackState, status: 'stopped' };
        expect(playbackStateValidation.canStart(state)).toBe(true);
      });

      it('should return true for error state', () => {
        const state: PlaybackState = { ...initialPlaybackState, status: 'error' };
        expect(playbackStateValidation.canStart(state)).toBe(true);
      });

      it('should return false for loading state', () => {
        const state: PlaybackState = { ...initialPlaybackState, status: 'loading' };
        expect(playbackStateValidation.canStart(state)).toBe(false);
      });

      it('should return false for playing state', () => {
        const state: PlaybackState = { ...initialPlaybackState, status: 'playing' };
        expect(playbackStateValidation.canStart(state)).toBe(false);
      });

      it('should return false for paused state', () => {
        const state: PlaybackState = { ...initialPlaybackState, status: 'paused' };
        expect(playbackStateValidation.canStart(state)).toBe(false);
      });
    });

    describe('canPause', () => {
      it('should return true only for playing state', () => {
        const statuses: PlaybackStatus[] = ['idle', 'loading', 'playing', 'paused', 'stopped', 'error'];

        for (const status of statuses) {
          const state: PlaybackState = { ...initialPlaybackState, status };
          const expected = status === 'playing';
          expect(playbackStateValidation.canPause(state)).toBe(expected);
        }
      });
    });

    describe('canResume', () => {
      it('should return true only for paused state', () => {
        const statuses: PlaybackStatus[] = ['idle', 'loading', 'playing', 'paused', 'stopped', 'error'];

        for (const status of statuses) {
          const state: PlaybackState = { ...initialPlaybackState, status };
          const expected = status === 'paused';
          expect(playbackStateValidation.canResume(state)).toBe(expected);
        }
      });
    });

    describe('hasNext', () => {
      it('should return true when not at last paragraph', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          paragraphs: ['A', 'B', 'C'],
          totalParagraphs: 3,
          currentParagraphIndex: 0,
        };

        expect(playbackStateValidation.hasNext(state)).toBe(true);
      });

      it('should return true for middle paragraph', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          paragraphs: ['A', 'B', 'C'],
          totalParagraphs: 3,
          currentParagraphIndex: 1,
        };

        expect(playbackStateValidation.hasNext(state)).toBe(true);
      });

      it('should return false at last paragraph', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          paragraphs: ['A', 'B', 'C'],
          totalParagraphs: 3,
          currentParagraphIndex: 2,
        };

        expect(playbackStateValidation.hasNext(state)).toBe(false);
      });

      it('should return false for single paragraph', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          paragraphs: ['Only one'],
          totalParagraphs: 1,
          currentParagraphIndex: 0,
        };

        expect(playbackStateValidation.hasNext(state)).toBe(false);
      });

      it('should return false for empty paragraphs', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          paragraphs: [],
          totalParagraphs: 0,
          currentParagraphIndex: 0,
        };

        expect(playbackStateValidation.hasNext(state)).toBe(false);
      });
    });

    describe('hasPrevious', () => {
      it('should return false at first paragraph', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          paragraphs: ['A', 'B', 'C'],
          totalParagraphs: 3,
          currentParagraphIndex: 0,
        };

        expect(playbackStateValidation.hasPrevious(state)).toBe(false);
      });

      it('should return true for middle paragraph', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          paragraphs: ['A', 'B', 'C'],
          totalParagraphs: 3,
          currentParagraphIndex: 1,
        };

        expect(playbackStateValidation.hasPrevious(state)).toBe(true);
      });

      it('should return true at last paragraph', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          paragraphs: ['A', 'B', 'C'],
          totalParagraphs: 3,
          currentParagraphIndex: 2,
        };

        expect(playbackStateValidation.hasPrevious(state)).toBe(true);
      });

      it('should return false for single paragraph', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          paragraphs: ['Only one'],
          totalParagraphs: 1,
          currentParagraphIndex: 0,
        };

        expect(playbackStateValidation.hasPrevious(state)).toBe(false);
      });
    });

    describe('isValidParagraphIndex', () => {
      it('should return true for valid indices', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          paragraphs: ['A', 'B', 'C', 'D', 'E'],
          totalParagraphs: 5,
        };

        expect(playbackStateValidation.isValidParagraphIndex(state, 0)).toBe(true);
        expect(playbackStateValidation.isValidParagraphIndex(state, 2)).toBe(true);
        expect(playbackStateValidation.isValidParagraphIndex(state, 4)).toBe(true);
      });

      it('should return false for negative index', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          paragraphs: ['A', 'B', 'C'],
          totalParagraphs: 3,
        };

        expect(playbackStateValidation.isValidParagraphIndex(state, -1)).toBe(false);
      });

      it('should return false for index >= totalParagraphs', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          paragraphs: ['A', 'B', 'C'],
          totalParagraphs: 3,
        };

        expect(playbackStateValidation.isValidParagraphIndex(state, 3)).toBe(false);
        expect(playbackStateValidation.isValidParagraphIndex(state, 100)).toBe(false);
      });

      it('should return false for empty paragraphs', () => {
        const state: PlaybackState = {
          ...initialPlaybackState,
          paragraphs: [],
          totalParagraphs: 0,
        };

        expect(playbackStateValidation.isValidParagraphIndex(state, 0)).toBe(false);
      });
    });
  });

  describe('complex state transition scenarios', () => {
    it('should handle full playback lifecycle', () => {
      // Start from idle
      let state = initialPlaybackState;
      expect(playbackStateValidation.canStart(state)).toBe(true);

      // Load content
      state = playbackStateTransitions.startLoading(
        state,
        ['Para 1', 'Para 2', 'Para 3'],
        1,
        'https://example.com',
      );
      expect(state.status).toBe('loading');
      expect(playbackStateValidation.canStart(state)).toBe(false);

      // Start playing
      state = playbackStateTransitions.startPlaying(state);
      expect(state.status).toBe('playing');
      expect(playbackStateValidation.canPause(state)).toBe(true);

      // Update progress
      state = playbackStateTransitions.updateProgress(state, 0.5);
      expect(state.progress).toBe(0.5);

      // Pause
      state = playbackStateTransitions.pause(state);
      expect(state.status).toBe('paused');
      expect(playbackStateValidation.canResume(state)).toBe(true);

      // Resume
      state = playbackStateTransitions.resume(state);
      expect(state.status).toBe('playing');

      // Next paragraph
      state = playbackStateTransitions.nextParagraph(state);
      expect(state.status).toBe('loading');
      expect(state.currentParagraphIndex).toBe(1);

      // Play again
      state = playbackStateTransitions.startPlaying(state);
      expect(state.status).toBe('playing');

      // Stop
      state = playbackStateTransitions.stop(state);
      expect(state.status).toBe('stopped');
      expect(playbackStateValidation.canStart(state)).toBe(true);
    });

    it('should handle error recovery', () => {
      let state = initialPlaybackState;

      // Start loading
      state = playbackStateTransitions.startLoading(
        state,
        ['Para 1'],
        1,
        'https://example.com',
      );

      // Error occurs
      state = playbackStateTransitions.setError(
        state,
        playbackError.audioGeneration('openai', 'Rate limited'),
      );
      expect(state.status).toBe('error');
      expect(state.error?.type).toBe('audio_generation');

      // Can restart
      expect(playbackStateValidation.canStart(state)).toBe(true);

      // Retry
      state = playbackStateTransitions.startLoading(
        state,
        ['Para 1'],
        1,
        'https://example.com',
      );
      expect(state.status).toBe('loading');
      expect(state.error).toBeNull();
    });

    it('should handle queue navigation through all paragraphs', () => {
      let state = playbackStateTransitions.startLoading(
        initialPlaybackState,
        ['P1', 'P2', 'P3', 'P4'],
        1,
        'https://example.com',
      );

      // Verify initial state
      expect(state.currentParagraphIndex).toBe(0);
      expect(playbackStateValidation.hasNext(state)).toBe(true);
      expect(playbackStateValidation.hasPrevious(state)).toBe(false);

      // Navigate forward
      state = playbackStateTransitions.nextParagraph(state);
      expect(state.currentParagraphIndex).toBe(1);
      expect(playbackStateValidation.hasNext(state)).toBe(true);
      expect(playbackStateValidation.hasPrevious(state)).toBe(true);

      // Seek to end
      state = playbackStateTransitions.seekToParagraph(state, 3);
      expect(state.currentParagraphIndex).toBe(3);
      expect(playbackStateValidation.hasNext(state)).toBe(false);
      expect(playbackStateValidation.hasPrevious(state)).toBe(true);

      // Try to go past end
      state = playbackStateTransitions.nextParagraph(state);
      expect(state.status).toBe('stopped');
      expect(state.currentParagraphIndex).toBe(3);

      // Navigate backwards
      state = playbackStateTransitions.previousParagraph(state);
      expect(state.currentParagraphIndex).toBe(2);

      // Seek to beginning
      state = playbackStateTransitions.seekToParagraph(state, 0);
      expect(state.currentParagraphIndex).toBe(0);
      expect(playbackStateValidation.hasPrevious(state)).toBe(false);

      // Try to go before beginning
      state = playbackStateTransitions.previousParagraph(state);
      expect(state.currentParagraphIndex).toBe(0); // Stays at 0
    });
  });
});
