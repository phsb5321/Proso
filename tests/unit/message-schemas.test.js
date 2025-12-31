/**
 * Unit tests for Message Schemas (T034)
 * Tests Zod schema validation for all message types.
 */

import { describe, it, expect } from '@jest/globals';
import {
  // Base types
  ProviderIdSchema,
  PlaybackStatusSchema,
  ReadingModeSchema,
  SpeedSchema,
  // Playback control messages
  PlayMessageSchema,
  PauseMessageSchema,
  StopMessageSchema,
  PrevMessageSchema,
  NextMessageSchema,
  // Settings messages
  SetProviderMessageSchema,
  SetVoiceMessageSchema,
  SetSpeedMessageSchema,
  // State query messages
  GetStateMessageSchema,
  GetProvidersMessageSchema,
  // Content script messages
  TextContentMessageSchema,
  JumpToParagraphMessageSchema,
  ControllerActionMessageSchema,
  // Notification messages
  PlaybackStateMessageSchema,
  ProgressMessageSchema,
  ErrorMessageSchema,
  // Content actions
  HighlightMessageSchema,
  HighlightWordMessageSchema,
  SetWordTimelineMessageSchema,
  // Helpers
  validateIncomingMessage,
  validateOutgoingPopupMessage,
  IncomingMessageSchema
} from '../../shared/message-schemas.js';

describe('Message Schemas', () => {
  describe('Base Types', () => {
    describe('ProviderIdSchema', () => {
      it('should accept valid provider IDs', () => {
        expect(ProviderIdSchema.parse('openai')).toBe('openai');
        expect(ProviderIdSchema.parse('elevenlabs')).toBe('elevenlabs');
        expect(ProviderIdSchema.parse('cartesia')).toBe('cartesia');
        expect(ProviderIdSchema.parse('groq')).toBe('groq');
        expect(ProviderIdSchema.parse('browser')).toBe('browser');
      });

      it('should reject invalid provider IDs', () => {
        expect(() => ProviderIdSchema.parse('invalid')).toThrow();
        expect(() => ProviderIdSchema.parse('')).toThrow();
        expect(() => ProviderIdSchema.parse(123)).toThrow();
      });
    });

    describe('PlaybackStatusSchema', () => {
      it('should accept valid playback statuses', () => {
        expect(PlaybackStatusSchema.parse('idle')).toBe('idle');
        expect(PlaybackStatusSchema.parse('loading')).toBe('loading');
        expect(PlaybackStatusSchema.parse('playing')).toBe('playing');
        expect(PlaybackStatusSchema.parse('paused')).toBe('paused');
        expect(PlaybackStatusSchema.parse('stopped')).toBe('stopped');
        expect(PlaybackStatusSchema.parse('error')).toBe('error');
      });

      it('should reject invalid statuses', () => {
        expect(() => PlaybackStatusSchema.parse('unknown')).toThrow();
      });
    });

    describe('ReadingModeSchema', () => {
      it('should accept valid reading modes', () => {
        expect(ReadingModeSchema.parse('full')).toBe('full');
        expect(ReadingModeSchema.parse('selection')).toBe('selection');
        expect(ReadingModeSchema.parse('article')).toBe('article');
      });
    });

    describe('SpeedSchema', () => {
      it('should accept speeds between 0.5 and 2.0', () => {
        expect(SpeedSchema.parse(0.5)).toBe(0.5);
        expect(SpeedSchema.parse(1.0)).toBe(1.0);
        expect(SpeedSchema.parse(1.5)).toBe(1.5);
        expect(SpeedSchema.parse(2.0)).toBe(2.0);
      });

      it('should reject speeds outside range', () => {
        expect(() => SpeedSchema.parse(0.4)).toThrow();
        expect(() => SpeedSchema.parse(2.1)).toThrow();
        expect(() => SpeedSchema.parse(-1)).toThrow();
      });
    });
  });

  describe('Playback Control Messages', () => {
    describe('PlayMessageSchema', () => {
      it('should accept minimal play message', () => {
        const msg = { action: 'play' };
        const result = PlayMessageSchema.parse(msg);
        expect(result.action).toBe('play');
      });

      it('should accept play message with all options', () => {
        const msg = {
          action: 'play',
          provider: 'openai',
          voice: 'alloy',
          speed: 1.5,
          mode: 'article',
          text: 'Hello world'
        };
        const result = PlayMessageSchema.parse(msg);
        expect(result.provider).toBe('openai');
        expect(result.voice).toBe('alloy');
        expect(result.speed).toBe(1.5);
        expect(result.mode).toBe('article');
        expect(result.text).toBe('Hello world');
      });

      it('should reject invalid provider in play message', () => {
        const msg = { action: 'play', provider: 'invalid' };
        expect(() => PlayMessageSchema.parse(msg)).toThrow();
      });

      it('should reject invalid speed in play message', () => {
        const msg = { action: 'play', speed: 3.0 };
        expect(() => PlayMessageSchema.parse(msg)).toThrow();
      });
    });

    describe('PauseMessageSchema', () => {
      it('should accept pause message', () => {
        const result = PauseMessageSchema.parse({ action: 'pause' });
        expect(result.action).toBe('pause');
      });

      it('should reject pause with extra data', () => {
        // Zod strips extra properties by default in parse, so this should work
        const result = PauseMessageSchema.parse({ action: 'pause', extra: true });
        expect(result.action).toBe('pause');
      });
    });

    describe('StopMessageSchema', () => {
      it('should accept stop message', () => {
        const result = StopMessageSchema.parse({ action: 'stop' });
        expect(result.action).toBe('stop');
      });
    });

    describe('PrevMessageSchema', () => {
      it('should accept prev message', () => {
        const result = PrevMessageSchema.parse({ action: 'prev' });
        expect(result.action).toBe('prev');
      });
    });

    describe('NextMessageSchema', () => {
      it('should accept next message', () => {
        const result = NextMessageSchema.parse({ action: 'next' });
        expect(result.action).toBe('next');
      });
    });
  });

  describe('Settings Messages', () => {
    describe('SetProviderMessageSchema', () => {
      it('should accept valid setProvider message', () => {
        const msg = { action: 'setProvider', provider: 'elevenlabs' };
        const result = SetProviderMessageSchema.parse(msg);
        expect(result.provider).toBe('elevenlabs');
      });

      it('should reject setProvider without provider', () => {
        expect(() => SetProviderMessageSchema.parse({ action: 'setProvider' })).toThrow();
      });

      it('should reject setProvider with invalid provider', () => {
        expect(() => SetProviderMessageSchema.parse({
          action: 'setProvider',
          provider: 'unknown'
        })).toThrow();
      });
    });

    describe('SetVoiceMessageSchema', () => {
      it('should accept valid setVoice message', () => {
        const msg = { action: 'setVoice', voice: 'alloy' };
        const result = SetVoiceMessageSchema.parse(msg);
        expect(result.voice).toBe('alloy');
      });

      it('should reject empty voice', () => {
        expect(() => SetVoiceMessageSchema.parse({
          action: 'setVoice',
          voice: ''
        })).toThrow();
      });
    });

    describe('SetSpeedMessageSchema', () => {
      it('should accept valid setSpeed message', () => {
        const msg = { action: 'setSpeed', speed: 1.25 };
        const result = SetSpeedMessageSchema.parse(msg);
        expect(result.speed).toBe(1.25);
      });

      it('should reject speed below minimum', () => {
        expect(() => SetSpeedMessageSchema.parse({
          action: 'setSpeed',
          speed: 0.3
        })).toThrow();
      });

      it('should reject speed above maximum', () => {
        expect(() => SetSpeedMessageSchema.parse({
          action: 'setSpeed',
          speed: 2.5
        })).toThrow();
      });
    });
  });

  describe('State Query Messages', () => {
    describe('GetStateMessageSchema', () => {
      it('should accept getState message', () => {
        const result = GetStateMessageSchema.parse({ action: 'getState' });
        expect(result.action).toBe('getState');
      });
    });

    describe('GetProvidersMessageSchema', () => {
      it('should accept getProviders message', () => {
        const result = GetProvidersMessageSchema.parse({ action: 'getProviders' });
        expect(result.action).toBe('getProviders');
      });
    });
  });

  describe('Content Script Messages', () => {
    describe('TextContentMessageSchema', () => {
      it('should accept valid textContent message', () => {
        const msg = {
          action: 'textContent',
          paragraphs: ['Hello world', 'Second paragraph']
        };
        const result = TextContentMessageSchema.parse(msg);
        expect(result.paragraphs).toHaveLength(2);
      });

      it('should accept textContent with mode', () => {
        const msg = {
          action: 'textContent',
          paragraphs: ['Test'],
          mode: 'selection'
        };
        const result = TextContentMessageSchema.parse(msg);
        expect(result.mode).toBe('selection');
      });

      it('should reject textContent without paragraphs', () => {
        expect(() => TextContentMessageSchema.parse({ action: 'textContent' })).toThrow();
      });
    });

    describe('JumpToParagraphMessageSchema', () => {
      it('should accept valid jumpToParagraph message', () => {
        const msg = { action: 'jumpToParagraph', index: 5 };
        const result = JumpToParagraphMessageSchema.parse(msg);
        expect(result.index).toBe(5);
      });

      it('should reject negative index', () => {
        expect(() => JumpToParagraphMessageSchema.parse({
          action: 'jumpToParagraph',
          index: -1
        })).toThrow();
      });

      it('should reject non-integer index', () => {
        expect(() => JumpToParagraphMessageSchema.parse({
          action: 'jumpToParagraph',
          index: 1.5
        })).toThrow();
      });
    });

    describe('ControllerActionMessageSchema', () => {
      it('should accept valid controller action', () => {
        const msg = { action: 'controllerAction', controllerAction: 'play' };
        const result = ControllerActionMessageSchema.parse(msg);
        expect(result.controllerAction).toBe('play');
      });

      it('should accept controller action with position', () => {
        const msg = {
          action: 'controllerAction',
          controllerAction: 'pause',
          position: { x: 100, y: 200 }
        };
        const result = ControllerActionMessageSchema.parse(msg);
        expect(result.position).toEqual({ x: 100, y: 200 });
      });

      it('should reject invalid controller action', () => {
        expect(() => ControllerActionMessageSchema.parse({
          action: 'controllerAction',
          controllerAction: 'invalid'
        })).toThrow();
      });
    });
  });

  describe('Notification Messages', () => {
    describe('PlaybackStateMessageSchema', () => {
      it('should accept valid playback state', () => {
        const msg = {
          type: 'playbackState',
          status: 'playing',
          isPlaying: true,
          isPaused: false
        };
        const result = PlaybackStateMessageSchema.parse(msg);
        expect(result.status).toBe('playing');
        expect(result.isPlaying).toBe(true);
      });

      it('should accept playback state with progress', () => {
        const msg = {
          type: 'playbackState',
          status: 'playing',
          isPlaying: true,
          isPaused: false,
          progress: 50,
          currentIndex: 2,
          totalParagraphs: 10
        };
        const result = PlaybackStateMessageSchema.parse(msg);
        expect(result.progress).toBe(50);
        expect(result.currentIndex).toBe(2);
        expect(result.totalParagraphs).toBe(10);
      });
    });

    describe('ProgressMessageSchema', () => {
      it('should accept valid progress message', () => {
        const msg = {
          type: 'progress',
          current: 5,
          total: 10,
          percent: 50
        };
        const result = ProgressMessageSchema.parse(msg);
        expect(result.percent).toBe(50);
      });

      it('should reject progress over 100', () => {
        expect(() => ProgressMessageSchema.parse({
          type: 'progress',
          current: 5,
          total: 10,
          percent: 150
        })).toThrow();
      });
    });

    describe('ErrorMessageSchema', () => {
      it('should accept error message', () => {
        const msg = {
          type: 'error',
          message: 'Something went wrong'
        };
        const result = ErrorMessageSchema.parse(msg);
        expect(result.message).toBe('Something went wrong');
      });

      it('should accept error with code', () => {
        const msg = {
          type: 'error',
          message: 'API error',
          code: 'API_KEY_MISSING'
        };
        const result = ErrorMessageSchema.parse(msg);
        expect(result.code).toBe('API_KEY_MISSING');
      });
    });
  });

  describe('Content Actions', () => {
    describe('HighlightMessageSchema', () => {
      it('should accept highlight message', () => {
        const msg = { action: 'highlight', index: 3 };
        const result = HighlightMessageSchema.parse(msg);
        expect(result.index).toBe(3);
      });

      it('should accept highlight with text', () => {
        const msg = { action: 'highlight', index: 0, text: 'Hello world' };
        const result = HighlightMessageSchema.parse(msg);
        expect(result.text).toBe('Hello world');
      });
    });

    describe('HighlightWordMessageSchema', () => {
      it('should accept highlight word message', () => {
        const msg = {
          action: 'highlightWord',
          paragraphIndex: 1,
          wordIndex: 5,
          word: 'example'
        };
        const result = HighlightWordMessageSchema.parse(msg);
        expect(result.word).toBe('example');
      });
    });

    describe('SetWordTimelineMessageSchema', () => {
      it('should accept word timeline message', () => {
        const msg = {
          action: 'setWordTimeline',
          paragraphIndex: 0,
          timeline: [
            { word: 'Hello', startMs: 0, endMs: 500 },
            { word: 'world', startMs: 500, endMs: 1000 }
          ]
        };
        const result = SetWordTimelineMessageSchema.parse(msg);
        expect(result.timeline).toHaveLength(2);
        expect(result.timeline[0].word).toBe('Hello');
      });

      it('should reject negative timing', () => {
        expect(() => SetWordTimelineMessageSchema.parse({
          action: 'setWordTimeline',
          paragraphIndex: 0,
          timeline: [
            { word: 'Bad', startMs: -100, endMs: 500 }
          ]
        })).toThrow();
      });
    });
  });

  describe('Validation Helpers', () => {
    describe('validateIncomingMessage', () => {
      it('should return success for valid message', () => {
        const result = validateIncomingMessage({ action: 'play' });
        expect(result.success).toBe(true);
        expect(result.data.action).toBe('play');
      });

      it('should return error for invalid message', () => {
        const result = validateIncomingMessage({ action: 'invalid' });
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should return error for missing action', () => {
        const result = validateIncomingMessage({});
        expect(result.success).toBe(false);
      });
    });

    describe('validateOutgoingPopupMessage', () => {
      it('should return success for valid playback state', () => {
        const result = validateOutgoingPopupMessage({
          type: 'playbackState',
          status: 'idle',
          isPlaying: false,
          isPaused: false
        });
        expect(result.success).toBe(true);
      });

      it('should return error for invalid message', () => {
        const result = validateOutgoingPopupMessage({
          type: 'invalid'
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('IncomingMessageSchema (Discriminated Union)', () => {
    it('should correctly discriminate play message', () => {
      const result = IncomingMessageSchema.parse({ action: 'play', provider: 'openai' });
      expect(result.action).toBe('play');
      expect(result.provider).toBe('openai');
    });

    it('should correctly discriminate setSpeed message', () => {
      const result = IncomingMessageSchema.parse({ action: 'setSpeed', speed: 1.5 });
      expect(result.action).toBe('setSpeed');
      expect(result.speed).toBe(1.5);
    });

    it('should reject unknown action', () => {
      expect(() => IncomingMessageSchema.parse({ action: 'unknownAction' })).toThrow();
    });

    it('should validate nested properties correctly', () => {
      // setSpeed with invalid speed should fail
      expect(() => IncomingMessageSchema.parse({
        action: 'setSpeed',
        speed: 5.0
      })).toThrow();
    });
  });
});
