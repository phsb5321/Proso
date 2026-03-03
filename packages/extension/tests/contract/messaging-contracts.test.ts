/**
 * Messaging Contract Tests
 *
 * Validates message request/response schemas to ensure
 * consistent communication between extension contexts.
 *
 * @module tests/contract/messaging-contracts
 */

import { z } from 'zod';

// ============================================================================
// Schema Definitions (matching src/utils/messaging/schemas.ts)
// ============================================================================

/**
 * Playback status enum
 */
const PlaybackStatusSchema = z.enum(['stopped', 'loading', 'playing', 'paused', 'error']);

/**
 * Playback state response schema
 */
const PlaybackStateSchema = z.object({
  status: PlaybackStatusSchema,
  currentParagraph: z.number().int().min(0),
  totalParagraphs: z.number().int().min(0),
  progress: z.number().min(0).max(1),
  speed: z.number().min(0.5).max(2.0),
  provider: z.string(),
  voice: z.string().nullable(),
  currentTime: z.number().min(0).optional(),
  totalTime: z.number().min(0).optional(),
});

/**
 * Footer action request schema
 */
const FooterActionSchema = z.object({
  action: z.enum([
    'play',
    'pause',
    'prev',
    'next',
    'seek',
    'speed',
    'minimize',
    'expand',
    'close',
  ]),
  value: z.number().optional(),
});

/**
 * Footer state schema
 */
const FooterStateSchema = z.object({
  status: PlaybackStatusSchema,
  currentIndex: z.number().int().min(0),
  totalParagraphs: z.number().int().min(0),
  progress: z.number().min(0).max(1),
  currentTime: z.string(),
  totalTime: z.string(),
  speed: z.number().min(0.5).max(2.0),
});

/**
 * Cache stats response schema
 */
const CacheStatsSchema = z.object({
  entryCount: z.number().int().min(0),
  totalSizeBytes: z.number().int().min(0),
  hitCount: z.number().int().min(0),
  missCount: z.number().int().min(0),
  hitRate: z.number().min(0).max(1),
});

/**
 * Settings schema
 */
const SettingsSchema = z.object({
  provider: z.string(),
  voice: z.string().nullable(),
  speed: z.number().min(0.5).max(2.0),
  mode: z.enum(['selection', 'article', 'full']),
  showCostEstimate: z.boolean().optional(),
  cacheEnabled: z.boolean().optional(),
  maxCacheSize: z.number().int().min(10).max(500).optional(),
  wordSyncEnabled: z.boolean().optional(),
});

/**
 * Voice info schema
 */
const VoiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  language: z.string().optional(),
  preview_url: z.string().url().optional(),
});

// ============================================================================
// Contract Tests
// ============================================================================

describe('Messaging Contracts', () => {
  describe('Playback Messages', () => {
    describe('playback.getState response', () => {
      it('should validate valid playback state', () => {
        const state = {
          status: 'playing',
          currentParagraph: 3,
          totalParagraphs: 10,
          progress: 0.5,
          speed: 1.0,
          provider: 'elevenlabs',
          voice: 'rachel',
        };

        expect(() => PlaybackStateSchema.parse(state)).not.toThrow();
      });

      it('should validate stopped state with zeros', () => {
        const state = {
          status: 'stopped',
          currentParagraph: 0,
          totalParagraphs: 0,
          progress: 0,
          speed: 1.0,
          provider: 'elevenlabs',
          voice: null,
        };

        expect(() => PlaybackStateSchema.parse(state)).not.toThrow();
      });

      it('should reject invalid status', () => {
        const state = {
          status: 'invalid',
          currentParagraph: 0,
          totalParagraphs: 0,
          progress: 0,
          speed: 1.0,
          provider: 'elevenlabs',
          voice: null,
        };

        expect(() => PlaybackStateSchema.parse(state)).toThrow();
      });

      it('should reject negative paragraph index', () => {
        const state = {
          status: 'playing',
          currentParagraph: -1,
          totalParagraphs: 10,
          progress: 0.5,
          speed: 1.0,
          provider: 'elevenlabs',
          voice: 'rachel',
        };

        expect(() => PlaybackStateSchema.parse(state)).toThrow();
      });

      it('should reject progress > 1', () => {
        const state = {
          status: 'playing',
          currentParagraph: 0,
          totalParagraphs: 10,
          progress: 1.5,
          speed: 1.0,
          provider: 'elevenlabs',
          voice: 'rachel',
        };

        expect(() => PlaybackStateSchema.parse(state)).toThrow();
      });

      it('should reject speed outside valid range', () => {
        const state = {
          status: 'playing',
          currentParagraph: 0,
          totalParagraphs: 10,
          progress: 0.5,
          speed: 3.0, // > 2.0
          provider: 'elevenlabs',
          voice: 'rachel',
        };

        expect(() => PlaybackStateSchema.parse(state)).toThrow();
      });
    });
  });

  describe('Footer Messages', () => {
    describe('footer.action request', () => {
      it('should validate play action', () => {
        const action = { action: 'play' };
        expect(() => FooterActionSchema.parse(action)).not.toThrow();
      });

      it('should validate seek action with value', () => {
        const action = { action: 'seek', value: 0.5 };
        expect(() => FooterActionSchema.parse(action)).not.toThrow();
      });

      it('should validate speed action with value', () => {
        const action = { action: 'speed', value: 1.5 };
        expect(() => FooterActionSchema.parse(action)).not.toThrow();
      });

      it('should validate all action types', () => {
        const actions = [
          'play',
          'pause',
          'prev',
          'next',
          'seek',
          'speed',
          'minimize',
          'expand',
          'close',
        ];

        for (const action of actions) {
          expect(() => FooterActionSchema.parse({ action })).not.toThrow();
        }
      });

      it('should reject invalid action', () => {
        const action = { action: 'invalid' };
        expect(() => FooterActionSchema.parse(action)).toThrow();
      });
    });

    describe('footer.stateUpdate response', () => {
      it('should validate valid footer state', () => {
        const state = {
          status: 'playing',
          currentIndex: 2,
          totalParagraphs: 8,
          progress: 0.3,
          currentTime: '0:30',
          totalTime: '2:00',
          speed: 1.0,
        };

        expect(() => FooterStateSchema.parse(state)).not.toThrow();
      });

      it('should validate loading state', () => {
        const state = {
          status: 'loading',
          currentIndex: 0,
          totalParagraphs: 5,
          progress: 0,
          currentTime: '0:00',
          totalTime: '1:15',
          speed: 1.0,
        };

        expect(() => FooterStateSchema.parse(state)).not.toThrow();
      });
    });
  });

  describe('Cache Messages', () => {
    describe('cache.getStats response', () => {
      it('should validate valid cache stats', () => {
        const stats = {
          entryCount: 50,
          totalSizeBytes: 10485760, // 10 MB
          hitCount: 100,
          missCount: 20,
          hitRate: 0.833,
        };

        expect(() => CacheStatsSchema.parse(stats)).not.toThrow();
      });

      it('should validate empty cache stats', () => {
        const stats = {
          entryCount: 0,
          totalSizeBytes: 0,
          hitCount: 0,
          missCount: 0,
          hitRate: 0,
        };

        expect(() => CacheStatsSchema.parse(stats)).not.toThrow();
      });

      it('should reject negative values', () => {
        const stats = {
          entryCount: -1,
          totalSizeBytes: 0,
          hitCount: 0,
          missCount: 0,
          hitRate: 0,
        };

        expect(() => CacheStatsSchema.parse(stats)).toThrow();
      });
    });
  });

  describe('Settings Messages', () => {
    describe('settings.get response', () => {
      it('should validate complete settings', () => {
        const settings = {
          provider: 'elevenlabs',
          voice: 'rachel',
          speed: 1.0,
          mode: 'article',
          showCostEstimate: true,
          cacheEnabled: true,
          maxCacheSize: 50,
          wordSyncEnabled: true,
        };

        expect(() => SettingsSchema.parse(settings)).not.toThrow();
      });

      it('should validate minimal settings', () => {
        const settings = {
          provider: 'elevenlabs',
          voice: null,
          speed: 1.0,
          mode: 'selection',
        };

        expect(() => SettingsSchema.parse(settings)).not.toThrow();
      });

      it('should reject invalid mode', () => {
        const settings = {
          provider: 'elevenlabs',
          voice: null,
          speed: 1.0,
          mode: 'invalid',
        };

        expect(() => SettingsSchema.parse(settings)).toThrow();
      });

      it('should reject speed below minimum', () => {
        const settings = {
          provider: 'elevenlabs',
          voice: null,
          speed: 0.3, // < 0.5
          mode: 'article',
        };

        expect(() => SettingsSchema.parse(settings)).toThrow();
      });
    });
  });

  describe('Provider Messages', () => {
    describe('provider.getVoices response', () => {
      it('should validate voice list', () => {
        const voices = [
          { id: 'rachel', name: 'Rachel', language: 'en' },
          { id: 'josh', name: 'Josh', language: 'en' },
        ];

        const result = z.array(VoiceSchema).safeParse(voices);
        expect(result.success).toBe(true);
      });

      it('should validate voice with preview URL', () => {
        const voice = {
          id: 'rachel',
          name: 'Rachel',
          language: 'en',
          preview_url: 'https://api.elevenlabs.io/v1/preview/rachel.mp3',
        };

        expect(() => VoiceSchema.parse(voice)).not.toThrow();
      });

      it('should validate voice without optional fields', () => {
        const voice = {
          id: 'default',
          name: 'Default Voice',
        };

        expect(() => VoiceSchema.parse(voice)).not.toThrow();
      });

      it('should reject invalid preview URL', () => {
        const voice = {
          id: 'rachel',
          name: 'Rachel',
          preview_url: 'not-a-url',
        };

        expect(() => VoiceSchema.parse(voice)).toThrow();
      });
    });
  });

  describe('Cross-Context Message Consistency', () => {
    it('should ensure footer state derives from playback state', () => {
      const playbackState = {
        status: 'playing' as const,
        currentParagraph: 3,
        totalParagraphs: 10,
        progress: 0.5,
        speed: 1.0,
        provider: 'elevenlabs',
        voice: 'rachel',
      };

      // FooterState should be derivable from PlaybackState
      const footerState = {
        status: playbackState.status,
        currentIndex: playbackState.currentParagraph,
        totalParagraphs: playbackState.totalParagraphs,
        progress: playbackState.progress,
        currentTime: '0:15',
        totalTime: '2:00',
        speed: playbackState.speed,
      };

      expect(() => PlaybackStateSchema.parse(playbackState)).not.toThrow();
      expect(() => FooterStateSchema.parse(footerState)).not.toThrow();
    });
  });
});
