/**
 * VoxPage Messaging Protocol
 * Type-safe message protocol using @webext-core/messaging ProtocolMap
 *
 * @module utils/messaging/protocol
 */

import type { ProtocolMap } from '@webext-core/messaging';

/**
 * Playback status enum
 */
export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error';

/**
 * Text extraction mode
 */
export type ExtractionMode = 'selection' | 'article' | 'full';

/**
 * Provider ID type
 */
export type ProviderId = 'openai' | 'elevenlabs' | 'cartesia' | 'groq' | 'browser';

/**
 * Log level type
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Footer action type
 */
export type FooterAction = 'play' | 'pause' | 'stop' | 'next' | 'prev' | 'seek' | 'speed' | 'close' | 'minimize' | 'expand';

/**
 * VoxPage Protocol Map
 * Defines all message types with their request/response signatures
 */
export interface VoxPageProtocol extends ProtocolMap {
  // ========== Playback Control Messages ==========
  'playback.start': {
    request: {
      mode: ExtractionMode;
      provider?: ProviderId;
      voice?: string;
      speed?: number;
    };
    response: {
      success: boolean;
      status: PlaybackStatus;
      currentIndex: number;
      totalParagraphs: number;
    };
  };

  'playback.pause': {
    request: void;
    response: {
      success: boolean;
      status: PlaybackStatus;
      currentIndex: number;
    };
  };

  'playback.stop': {
    request: void;
    response: {
      success: boolean;
      status: PlaybackStatus;
    };
  };

  'playback.next': {
    request: void;
    response: {
      success: boolean;
      currentIndex: number;
      totalParagraphs: number;
    };
  };

  'playback.prev': {
    request: void;
    response: {
      success: boolean;
      currentIndex: number;
      totalParagraphs: number;
    };
  };

  'playback.seek': {
    request: {
      index: number;
    };
    response: {
      success: boolean;
      currentIndex: number;
    };
  };

  'playback.getState': {
    request: void;
    response: {
      status: PlaybackStatus;
      currentIndex: number;
      totalParagraphs: number;
      progress: number;
      currentText: string;
      provider: ProviderId;
      voice: string | null;
      speed: number;
      mode: ExtractionMode;
      error?: string;
    };
  };

  'playback.setSpeed': {
    request: {
      speed: number;
    };
    response: {
      success: boolean;
      speed: number;
    };
  };

  // ========== Audio Generation & Caching Messages ==========
  'audio.generate': {
    request: {
      text: string;
      provider: ProviderId;
      voice?: string;
      speed?: number;
    };
    response: {
      success: boolean;
      audioUrl?: string;
      wordTimeline?: Array<{ word: string; startMs: number; endMs: number }>;
      error?: string;
    };
  };

  'audio.cache': {
    request: {
      key: string;
      audioUrl: string;
      wordTimeline?: Array<{ word: string; startMs: number; endMs: number }>;
    };
    response: {
      success: boolean;
      cacheSize: number;
    };
  };

  'audio.clearCache': {
    request: void;
    response: {
      success: boolean;
      clearedCount: number;
    };
  };

  'audio.getCacheState': {
    request: void;
    response: {
      size: number;
      maxSize: number;
      entries: number;
    };
  };

  // ========== Provider Management Messages ==========
  'provider.select': {
    request: {
      providerId: ProviderId;
    };
    response: {
      success: boolean;
      providerId: ProviderId;
    };
  };

  'provider.getList': {
    request: void;
    response: {
      providers: Array<{
        id: ProviderId;
        name: string;
        requiresApiKey: boolean;
        supportsWordTiming: boolean;
      }>;
    };
  };

  'provider.validateLanguageSupport': {
    request: {
      providerId: ProviderId;
      languageCode: string;
    };
    response: {
      supported: boolean;
      alternativeProviders?: ProviderId[];
    };
  };

  // ========== Content Extraction Messages ==========
  'content.extract': {
    request: {
      mode: ExtractionMode;
    };
    response: {
      success: boolean;
      paragraphs: Array<{
        text: string;
        index: number;
        type: 'paragraph' | 'heading' | 'list';
      }>;
      totalCharacters: number;
      extractionTimeMs: number;
    };
  };

  'content.score': {
    request: {
      html: string;
    };
    response: {
      score: number;
      paragraphCount: number;
      linkDensity: number;
      headingCount: number;
    };
  };

  'content.findDOMElements': {
    request: {
      paragraphs: Array<{ text: string; index: number }>;
    };
    response: {
      elements: Array<{
        index: number;
        xpath?: string;
        found: boolean;
      }>;
    };
  };

  // ========== Highlight Management Messages ==========
  'highlight.paragraph': {
    request: {
      paragraphIndex: number;
      scroll?: boolean;
    };
    response: {
      success: boolean;
      paragraphIndex: number;
    };
  };

  'highlight.word': {
    request: {
      wordIndex: number;
      paragraphIndex: number;
    };
    response: {
      success: boolean;
      wordIndex: number;
    };
  };

  'highlight.clear': {
    request: void;
    response: {
      success: boolean;
    };
  };

  'highlight.getState': {
    request: void;
    response: {
      currentParagraphIndex: number | null;
      currentWordIndex: number | null;
      highlightEnabled: boolean;
    };
  };

  // ========== Language Detection Messages ==========
  'language.detect': {
    request: {
      metadata?: string;
      textSample?: string;
      url: string;
    };
    response: {
      code: string;
      confidence: number;
      source: 'metadata' | 'text' | 'fallback';
      isReliable: boolean;
    };
  };

  'language.getState': {
    request: {
      tabId: number;
    };
    response: {
      detected: {
        code: string;
        confidence: number;
        source: 'metadata' | 'text' | 'fallback';
      } | null;
      override: string | null;
      effective: string;
      autoDetect: boolean;
    };
  };

  'language.setOverride': {
    request: {
      languageCode: string;
    };
    response: {
      success: boolean;
      languageCode: string;
    };
  };

  'language.clearOverride': {
    request: void;
    response: {
      success: boolean;
    };
  };

  // ========== Settings Management Messages ==========
  'settings.get': {
    request: void;
    response: {
      mode: ExtractionMode;
      provider: ProviderId;
      voice: string | null;
      speed: number;
      showCostEstimate: boolean;
      cacheEnabled: boolean;
      maxCacheSize: number;
      wordSyncEnabled: boolean;
    };
  };

  'settings.update': {
    request: {
      mode?: ExtractionMode;
      provider?: ProviderId;
      voice?: string | null;
      speed?: number;
      showCostEstimate?: boolean;
      cacheEnabled?: boolean;
      maxCacheSize?: number;
      wordSyncEnabled?: boolean;
    };
    response: {
      success: boolean;
      settings: {
        mode: ExtractionMode;
        provider: ProviderId;
        voice: string | null;
        speed: number;
        showCostEstimate: boolean;
        cacheEnabled: boolean;
        maxCacheSize: number;
        wordSyncEnabled: boolean;
      };
    };
  };

  'settings.migrate': {
    request: {
      fromVersion: string;
      toVersion: string;
    };
    response: {
      success: boolean;
      migratedKeys: string[];
    };
  };

  // ========== Footer (Sticky Player) Messages ==========
  'footer.show': {
    request: void;
    response: {
      success: boolean;
      isVisible: boolean;
    };
  };

  'footer.hide': {
    request: void;
    response: {
      success: boolean;
      isVisible: boolean;
    };
  };

  'footer.updateState': {
    request: {
      status?: PlaybackStatus;
      currentIndex?: number;
      totalParagraphs?: number;
      progress?: number;
      currentText?: string;
      speed?: number;
    };
    response: {
      success: boolean;
    };
  };

  'footer.getState': {
    request: void;
    response: {
      isVisible: boolean;
      isMinimized: boolean;
      position: {
        x: 'left' | 'center' | 'right' | number;
        yOffset: number;
      };
    };
  };

  'footer.action': {
    request: {
      action: FooterAction;
      value?: number; // For seek and speed actions
    };
    response: {
      success: boolean;
    };
  };

  // ========== Remote Logging Messages ==========
  'logging.logRemote': {
    request: {
      level: LogLevel;
      message: string;
      component: 'background' | 'content' | 'popup' | 'options';
      metadata?: Record<string, unknown>;
    };
    response: {
      success: boolean;
      buffered: boolean;
    };
  };

  'logging.flushBuffer': {
    request: void;
    response: {
      success: boolean;
      flushedCount: number;
    };
  };

  'logging.getState': {
    request: void;
    response: {
      enabled: boolean;
      bufferSize: number;
      lastFlushAttempt: number;
      consecutiveFailures: number;
      circuitBreakerOpen: boolean;
    };
  };
}
