/**
 * Unit tests for domain error factories
 * @module tests/unit/core/shared/errors
 */

import { describe, it, expect } from '@jest/globals';
import {
  playbackError,
  contentError,
  cacheError,
  audioError,
  highlightError,
} from '../../../../src/core/shared/errors';

describe('Domain Error Factories', () => {
  describe('playbackError', () => {
    it('creates audioGeneration error', () => {
      const err = playbackError.audioGeneration('openai', 'API timeout');
      expect(err).toEqual({ type: 'audio_generation', provider: 'openai', message: 'API timeout' });
    });

    it('creates noContent error', () => {
      const err = playbackError.noContent('article');
      expect(err).toEqual({ type: 'no_content', mode: 'article' });
    });

    it('creates noContent for selection mode', () => {
      const err = playbackError.noContent('selection');
      expect(err.mode).toBe('selection');
    });

    it('creates invalidParagraphIndex error', () => {
      const err = playbackError.invalidParagraphIndex(5, 3);
      expect(err).toEqual({ type: 'invalid_paragraph_index', index: 5, max: 3 });
    });

    it('creates tabNotFound error', () => {
      const err = playbackError.tabNotFound(42);
      expect(err).toEqual({ type: 'tab_not_found', tabId: 42 });
    });

    it('creates providerUnavailable error', () => {
      const err = playbackError.providerUnavailable('elevenlabs');
      expect(err).toEqual({ type: 'provider_unavailable', provider: 'elevenlabs' });
    });

    it('creates playbackFailed error', () => {
      const err = playbackError.playbackFailed('Audio element error');
      expect(err).toEqual({ type: 'playback_failed', reason: 'Audio element error' });
    });
  });

  describe('contentError', () => {
    it('creates noReadableContent error', () => {
      expect(contentError.noReadableContent()).toEqual({ type: 'no_readable_content' });
    });

    it('creates extractionFailed error', () => {
      const err = contentError.extractionFailed('DOM error');
      expect(err).toEqual({ type: 'extraction_failed', message: 'DOM error' });
    });

    it('creates invalidSelection error', () => {
      expect(contentError.invalidSelection()).toEqual({ type: 'invalid_selection' });
    });

    it('creates domAccessDenied error', () => {
      expect(contentError.domAccessDenied()).toEqual({ type: 'dom_access_denied' });
    });
  });

  describe('cacheError', () => {
    it('creates storageFull error', () => {
      const err = cacheError.storageFull(500_000_000, 500_000_000);
      expect(err).toEqual({ type: 'storage_full', currentSize: 500_000_000, maxSize: 500_000_000 });
    });

    it('creates entryNotFound error', () => {
      const err = cacheError.entryNotFound('abc:1:openai:alloy:xyz');
      expect(err).toEqual({ type: 'entry_not_found', key: 'abc:1:openai:alloy:xyz' });
    });

    it('creates serializationFailed error', () => {
      const err = cacheError.serializationFailed('Invalid blob');
      expect(err).toEqual({ type: 'serialization_failed', message: 'Invalid blob' });
    });

    it('creates databaseError error', () => {
      const err = cacheError.databaseError('IndexedDB quota exceeded');
      expect(err).toEqual({ type: 'database_error', message: 'IndexedDB quota exceeded' });
    });
  });

  describe('audioError', () => {
    it('creates network error', () => {
      const err = audioError.network('Connection refused');
      expect(err).toEqual({ type: 'network', message: 'Connection refused' });
    });

    it('creates rateLimit error', () => {
      const err = audioError.rateLimit(60000);
      expect(err).toEqual({ type: 'rate_limit', retryAfterMs: 60000 });
    });

    it('creates invalidCredentials error', () => {
      expect(audioError.invalidCredentials()).toEqual({ type: 'invalid_credentials' });
    });

    it('creates unsupportedLanguage error', () => {
      const err = audioError.unsupportedLanguage('ja');
      expect(err).toEqual({ type: 'unsupported_language', language: 'ja' });
    });

    it('creates textTooLong error', () => {
      const err = audioError.textTooLong(5000);
      expect(err).toEqual({ type: 'text_too_long', maxLength: 5000 });
    });

    it('creates providerError error', () => {
      const err = audioError.providerError('500', 'Internal server error');
      expect(err).toEqual({ type: 'provider_error', code: '500', message: 'Internal server error' });
    });
  });

  describe('highlightError', () => {
    it('creates tabNotFound error', () => {
      const err = highlightError.tabNotFound(99);
      expect(err).toEqual({ type: 'tab_not_found', tabId: 99 });
    });

    it('creates contentScriptNotLoaded error', () => {
      expect(highlightError.contentScriptNotLoaded()).toEqual({ type: 'content_script_not_loaded' });
    });

    it('creates messageFailed error', () => {
      const err = highlightError.messageFailed('Timeout');
      expect(err).toEqual({ type: 'message_failed', message: 'Timeout' });
    });
  });

  describe('error discriminated unions', () => {
    it('all playback errors have unique type discriminator', () => {
      const types = [
        playbackError.audioGeneration('openai', 'msg').type,
        playbackError.noContent('article').type,
        playbackError.invalidParagraphIndex(0, 0).type,
        playbackError.tabNotFound(0).type,
        playbackError.providerUnavailable('browser').type,
        playbackError.playbackFailed('').type,
      ];
      expect(new Set(types).size).toBe(types.length);
    });

    it('all audio errors have unique type discriminator', () => {
      const types = [
        audioError.network('').type,
        audioError.rateLimit(0).type,
        audioError.invalidCredentials().type,
        audioError.unsupportedLanguage('').type,
        audioError.textTooLong(0).type,
        audioError.providerError('', '').type,
      ];
      expect(new Set(types).size).toBe(types.length);
    });
  });
});
