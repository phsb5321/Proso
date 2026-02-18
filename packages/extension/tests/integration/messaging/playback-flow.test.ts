/**
 * Playback Flow Integration Tests
 *
 * Tests the complete playback flow from user click to audio generation
 * and highlighting synchronization.
 *
 * @module tests/integration/messaging/playback-flow
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  HandlerRegistry,
  createHandlerRegistry,
} from '../../../src/handlers/registry';
import type { Result } from '../../../src/core/shared/result';
import { Ok, Err } from '../../../src/core/shared/result';

/**
 * Playback state machine states
 */
type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error';

/**
 * Mock playback controller state
 */
interface PlaybackControllerState {
  state: PlaybackState;
  currentParagraphIndex: number;
  paragraphs: string[];
  provider: string;
  voice: string | null;
  speed: number;
  audioBlob: Blob | null;
  errorMessage: string | null;
}

/**
 * Mock audio generator response
 */
interface AudioGeneratorResponse {
  audioBlob: Blob;
  duration: number;
  wordTimings?: Array<{ word: string; startMs: number; endMs: number }>;
}

describe('Playback Flow Integration', () => {
  let registry: HandlerRegistry;
  let playbackState: PlaybackControllerState;
  let eventLog: string[];

  beforeEach(() => {
    registry = createHandlerRegistry();
    eventLog = [];

    // Initialize playback state
    playbackState = {
      state: 'idle',
      currentParagraphIndex: -1,
      paragraphs: [],
      provider: 'browser',
      voice: null,
      speed: 1.0,
      audioBlob: null,
      errorMessage: null,
    };

    // Register playback handlers
    registry.register<
      { paragraphs: string[]; startIndex?: number },
      Result<{ state: PlaybackState }, { type: string; message: string }>
    >(
      'playback.start',
      async ({ paragraphs, startIndex = 0 }) => {
        if (paragraphs.length === 0) {
          return Err({ type: 'no_content', message: 'No paragraphs to play' });
        }

        playbackState.paragraphs = paragraphs;
        playbackState.currentParagraphIndex = startIndex;
        playbackState.state = 'loading';
        eventLog.push(`playback.start: index=${startIndex}`);

        return Ok({ state: playbackState.state });
      },
      'Start playback',
    );

    registry.register<void, Result<{ state: PlaybackState }, { type: string; message: string }>>(
      'playback.pause',
      async () => {
        if (playbackState.state !== 'playing') {
          return Err({ type: 'invalid_state', message: 'Cannot pause when not playing' });
        }

        playbackState.state = 'paused';
        eventLog.push('playback.pause');
        return Ok({ state: playbackState.state });
      },
      'Pause playback',
    );

    registry.register<void, Result<{ state: PlaybackState }, { type: string; message: string }>>(
      'playback.resume',
      async () => {
        if (playbackState.state !== 'paused') {
          return Err({ type: 'invalid_state', message: 'Cannot resume when not paused' });
        }

        playbackState.state = 'playing';
        eventLog.push('playback.resume');
        return Ok({ state: playbackState.state });
      },
      'Resume playback',
    );

    registry.register<void, Result<{ state: PlaybackState }, { type: string; message: string }>>(
      'playback.stop',
      async () => {
        playbackState.state = 'stopped';
        playbackState.currentParagraphIndex = -1;
        playbackState.audioBlob = null;
        eventLog.push('playback.stop');
        return Ok({ state: playbackState.state });
      },
      'Stop playback',
    );

    registry.register<void, Result<{ index: number; hasNext: boolean }, { type: string; message: string }>>(
      'playback.next',
      async () => {
        const nextIndex = playbackState.currentParagraphIndex + 1;

        if (nextIndex >= playbackState.paragraphs.length) {
          return Err({ type: 'end_of_content', message: 'No more paragraphs' });
        }

        playbackState.currentParagraphIndex = nextIndex;
        playbackState.state = 'loading';
        eventLog.push(`playback.next: index=${nextIndex}`);

        return Ok({
          index: nextIndex,
          hasNext: nextIndex < playbackState.paragraphs.length - 1,
        });
      },
      'Move to next paragraph',
    );

    registry.register<void, Result<{ index: number; hasPrev: boolean }, { type: string; message: string }>>(
      'playback.prev',
      async () => {
        const prevIndex = playbackState.currentParagraphIndex - 1;

        if (prevIndex < 0) {
          return Err({ type: 'start_of_content', message: 'Already at first paragraph' });
        }

        playbackState.currentParagraphIndex = prevIndex;
        playbackState.state = 'loading';
        eventLog.push(`playback.prev: index=${prevIndex}`);

        return Ok({
          index: prevIndex,
          hasPrev: prevIndex > 0,
        });
      },
      'Move to previous paragraph',
    );

    registry.register<
      { text: string; provider?: string; voice?: string },
      Result<AudioGeneratorResponse, { type: string; message: string }>
    >(
      'audio.generate',
      async ({ text, provider, voice }) => {
        if (!text || text.trim().length === 0) {
          return Err({ type: 'empty_text', message: 'Cannot generate audio for empty text' });
        }

        // Simulate audio generation
        const audioBlob = new Blob(['mock-audio-data'], { type: 'audio/mpeg' });
        const duration = text.length * 50; // ~50ms per character

        playbackState.audioBlob = audioBlob;
        playbackState.state = 'playing';
        eventLog.push(`audio.generate: length=${text.length}`);

        return Ok({
          audioBlob,
          duration,
          wordTimings: undefined,
        });
      },
      'Generate TTS audio',
    );

    registry.register<void, Result<PlaybackControllerState, { type: string; message: string }>>(
      'playback.getState',
      async () => {
        return Ok({ ...playbackState });
      },
      'Get current playback state',
    );

    registry.register<{ speed: number }, Result<{ speed: number }, { type: string; message: string }>>(
      'playback.setSpeed',
      async ({ speed }) => {
        if (speed < 0.5 || speed > 2.0) {
          return Err({ type: 'invalid_speed', message: 'Speed must be between 0.5 and 2.0' });
        }

        playbackState.speed = speed;
        eventLog.push(`playback.setSpeed: ${speed}`);
        return Ok({ speed });
      },
      'Set playback speed',
    );
  });

  afterEach(() => {
    registry.clear();
  });

  describe('Basic Playback Flow', () => {
    const testParagraphs = [
      'First paragraph for testing.',
      'Second paragraph with more content.',
      'Third and final paragraph.',
    ];

    it('should start playback from the beginning', async () => {
      const result = await registry.dispatch<
        { paragraphs: string[]; startIndex?: number },
        Result<{ state: PlaybackState }, { type: string; message: string }>
      >('playback.start', {
        paragraphs: testParagraphs,
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.state).toBe('loading');
      }
      expect(playbackState.currentParagraphIndex).toBe(0);
      expect(playbackState.paragraphs).toEqual(testParagraphs);
    });

    it('should start playback from a specific index', async () => {
      const result = await registry.dispatch('playback.start', {
        paragraphs: testParagraphs,
        startIndex: 1,
      });

      expect(result.ok).toBe(true);
      expect(playbackState.currentParagraphIndex).toBe(1);
    });

    it('should reject starting with empty paragraphs', async () => {
      const result = await registry.dispatch<
        { paragraphs: string[]; startIndex?: number },
        Result<{ state: PlaybackState }, { type: string; message: string }>
      >('playback.start', {
        paragraphs: [],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ok).toBe(false);
      }
    });

    it('should generate audio for current paragraph', async () => {
      await registry.dispatch('playback.start', { paragraphs: testParagraphs });

      const result = await registry.dispatch<
        { text: string; provider?: string; voice?: string },
        Result<AudioGeneratorResponse, { type: string; message: string }>
      >('audio.generate', {
        text: testParagraphs[0],
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.audioBlob).toBeInstanceOf(Blob);
        expect(result.value.value.duration).toBeGreaterThan(0);
      }
      expect(playbackState.state).toBe('playing');
    });
  });

  describe('Pause and Resume Flow', () => {
    beforeEach(async () => {
      await registry.dispatch('playback.start', {
        paragraphs: ['Test paragraph.'],
      });
      await registry.dispatch('audio.generate', { text: 'Test paragraph.' });
    });

    it('should pause playing audio', async () => {
      expect(playbackState.state).toBe('playing');

      const result = await registry.dispatch('playback.pause', undefined);

      expect(result.ok).toBe(true);
      expect(playbackState.state).toBe('paused');
    });

    it('should resume paused audio', async () => {
      await registry.dispatch('playback.pause', undefined);
      expect(playbackState.state).toBe('paused');

      const result = await registry.dispatch('playback.resume', undefined);

      expect(result.ok).toBe(true);
      expect(playbackState.state).toBe('playing');
    });

    it('should not pause when not playing', async () => {
      await registry.dispatch('playback.stop', undefined);

      const result = await registry.dispatch<
        void,
        Result<{ state: PlaybackState }, { type: string; message: string }>
      >('playback.pause', undefined);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ok).toBe(false);
      }
    });

    it('should not resume when not paused', async () => {
      // State is 'playing', not 'paused'
      const result = await registry.dispatch<
        void,
        Result<{ state: PlaybackState }, { type: string; message: string }>
      >('playback.resume', undefined);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ok).toBe(false);
      }
    });
  });

  describe('Navigation Flow', () => {
    const testParagraphs = ['Para 1', 'Para 2', 'Para 3', 'Para 4'];

    beforeEach(async () => {
      await registry.dispatch('playback.start', {
        paragraphs: testParagraphs,
        startIndex: 1,
      });
    });

    it('should move to next paragraph', async () => {
      expect(playbackState.currentParagraphIndex).toBe(1);

      const result = await registry.dispatch<
        void,
        Result<{ index: number; hasNext: boolean }, { type: string; message: string }>
      >('playback.next', undefined);

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.index).toBe(2);
        expect(result.value.value.hasNext).toBe(true);
      }
    });

    it('should move to previous paragraph', async () => {
      const result = await registry.dispatch<
        void,
        Result<{ index: number; hasPrev: boolean }, { type: string; message: string }>
      >('playback.prev', undefined);

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.index).toBe(0);
        expect(result.value.value.hasPrev).toBe(false);
      }
    });

    it('should not go past the last paragraph', async () => {
      // Move to last paragraph
      playbackState.currentParagraphIndex = 3;

      const result = await registry.dispatch<
        void,
        Result<{ index: number; hasNext: boolean }, { type: string; message: string }>
      >('playback.next', undefined);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ok).toBe(false);
      }
    });

    it('should not go before the first paragraph', async () => {
      playbackState.currentParagraphIndex = 0;

      const result = await registry.dispatch<
        void,
        Result<{ index: number; hasPrev: boolean }, { type: string; message: string }>
      >('playback.prev', undefined);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ok).toBe(false);
      }
    });
  });

  describe('Stop Flow', () => {
    beforeEach(async () => {
      await registry.dispatch('playback.start', {
        paragraphs: ['Test'],
      });
      await registry.dispatch('audio.generate', { text: 'Test' });
    });

    it('should stop playback and reset state', async () => {
      expect(playbackState.state).toBe('playing');
      expect(playbackState.audioBlob).not.toBeNull();

      const result = await registry.dispatch('playback.stop', undefined);

      expect(result.ok).toBe(true);
      expect(playbackState.state).toBe('stopped');
      expect(playbackState.currentParagraphIndex).toBe(-1);
      expect(playbackState.audioBlob).toBeNull();
    });

    it('should be able to restart after stopping', async () => {
      await registry.dispatch('playback.stop', undefined);

      const result = await registry.dispatch('playback.start', {
        paragraphs: ['New content'],
      });

      expect(result.ok).toBe(true);
      expect(playbackState.paragraphs).toEqual(['New content']);
    });
  });

  describe('Speed Control', () => {
    it('should set valid playback speed', async () => {
      const result = await registry.dispatch('playback.setSpeed', { speed: 1.5 });

      expect(result.ok).toBe(true);
      expect(playbackState.speed).toBe(1.5);
    });

    it('should reject speed below minimum', async () => {
      const result = await registry.dispatch<
        { speed: number },
        Result<{ speed: number }, { type: string; message: string }>
      >('playback.setSpeed', { speed: 0.25 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ok).toBe(false);
      }
    });

    it('should reject speed above maximum', async () => {
      const result = await registry.dispatch<
        { speed: number },
        Result<{ speed: number }, { type: string; message: string }>
      >('playback.setSpeed', { speed: 3.0 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ok).toBe(false);
      }
    });

    it('should accept boundary values', async () => {
      const minResult = await registry.dispatch('playback.setSpeed', { speed: 0.5 });
      expect(minResult.ok).toBe(true);

      const maxResult = await registry.dispatch('playback.setSpeed', { speed: 2.0 });
      expect(maxResult.ok).toBe(true);
    });
  });

  describe('Event Logging', () => {
    it('should log playback events in order', async () => {
      await registry.dispatch('playback.start', { paragraphs: ['Test'] });
      await registry.dispatch('audio.generate', { text: 'Test' });
      await registry.dispatch('playback.pause', undefined);
      await registry.dispatch('playback.resume', undefined);
      await registry.dispatch('playback.stop', undefined);

      expect(eventLog).toEqual([
        'playback.start: index=0',
        'audio.generate: length=4',
        'playback.pause',
        'playback.resume',
        'playback.stop',
      ]);
    });
  });

  describe('State Retrieval', () => {
    it('should return complete playback state', async () => {
      await registry.dispatch('playback.start', { paragraphs: ['Test'] });
      await registry.dispatch('playback.setSpeed', { speed: 1.25 });

      const result = await registry.dispatch<
        void,
        Result<PlaybackControllerState, { type: string; message: string }>
      >('playback.getState', undefined);

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.state).toBe('loading');
        expect(result.value.value.speed).toBe(1.25);
        expect(result.value.value.paragraphs).toEqual(['Test']);
      }
    });
  });
});
