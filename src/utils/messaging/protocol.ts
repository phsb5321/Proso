/**
 * VoxPage Messaging Protocol
 * Type-safe message protocol using @webext-core/messaging
 *
 * @module utils/messaging/protocol
 */

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
 * Export job status type (023-feature-roadmap)
 */
export type ExportJobStatus = 'pending' | 'generating' | 'encoding' | 'complete' | 'error';

/**
 * Export quality type (bitrate in kbps)
 */
export type ExportQualityType = '128' | '192' | '256';

/**
 * Queue item status type
 */
export type QueueItemStatus = 'pending' | 'reading' | 'completed' | 'archived';

/**
 * AI provider type
 */
export type AIProviderType = 'openai' | 'anthropic';

/**
 * Footer action type
 */
export type FooterAction = 'play' | 'pause' | 'stop' | 'next' | 'prev' | 'seek' | 'speed' | 'close' | 'minimize' | 'expand';

/**
 * VoxPage Protocol Map
 * Defines all message types with their request/response signatures
 * Compatible with @webext-core/messaging defineExtensionMessaging
 */
export interface VoxPageProtocol {
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

  // ========== MP3 Export Messages (023-feature-roadmap) ==========
  'export.start': {
    request: {
      jobId: string;
      paragraphs: Array<{ index: number; text: string }>;
      provider: ProviderId;
      voice?: string;
      speed: number;
      quality: ExportQualityType;
    };
    response: {
      success: boolean;
      jobId: string;
      error?: string;
    };
  };

  'export.cancel': {
    request: {
      jobId: string;
    };
    response: {
      success: boolean;
      wasCancelled: boolean;
    };
  };

  'export.getProgress': {
    request: {
      jobId: string;
    };
    response: {
      status: ExportJobStatus;
      currentParagraph: number;
      totalParagraphs: number;
      percentComplete: number;
      error?: string;
    };
  };

  'export.download': {
    request: {
      jobId: string;
      filename?: string;
    };
    response: {
      success: boolean;
      error?: string;
    };
  };

  // ========== AI Summarization Messages (023-feature-roadmap) ==========
  'summarize.article': {
    request: {
      text: string;
      title?: string;
      url?: string;
      provider: AIProviderType;
      bulletCount: number;
      outputLanguage: string;
    };
    response: {
      success: boolean;
      bullets: Array<{
        text: string;
        sourceOffset?: number;
        confidence?: number;
      }>;
      provider: AIProviderType;
      model: string;
      tokensUsed?: {
        input: number;
        output: number;
      };
      processingTimeMs: number;
      error?: string;
    };
  };

  'summarize.readSummary': {
    request: {
      bullets: Array<{ text: string }>;
      provider: ProviderId;
      voice?: string;
      speed?: number;
    };
    response: {
      success: boolean;
      error?: string;
    };
  };

  'summarize.getProviderStatus': {
    request: {
      provider: AIProviderType;
    };
    response: {
      available: boolean;
      hasApiKey: boolean;
      model?: string;
      error?: string;
    };
  };

  // ========== OCR Messages (023-feature-roadmap) ==========
  'ocr.captureAndRead': {
    request: {
      tabId?: number;
      region?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      languages: string[];
    };
    response: {
      success: boolean;
      text: string;
      confidence: number;
      lines: Array<{
        text: string;
        words: Array<{
          text: string;
          confidence: number;
          bbox: { x0: number; y0: number; x1: number; y1: number };
        }>;
      }>;
      processingTimeMs: number;
      detectedLanguage?: string;
      error?: string;
    };
  };

  'ocr.processImage': {
    request: {
      imageData: string;
      format: 'png' | 'jpeg' | 'webp';
      languages: string[];
    };
    response: {
      success: boolean;
      text: string;
      confidence: number;
      lines: Array<{
        text: string;
        words: Array<{
          text: string;
          confidence: number;
          bbox: { x0: number; y0: number; x1: number; y1: number };
        }>;
      }>;
      processingTimeMs: number;
      error?: string;
    };
  };

  'ocr.readExtractedText': {
    request: {
      text: string;
      provider: ProviderId;
      voice?: string;
      speed?: number;
    };
    response: {
      success: boolean;
      error?: string;
    };
  };

  'ocr.selectRegion': {
    request: {
      tabId: number;
    };
    response: {
      success: boolean;
      error?: string;
    };
  };

  // ========== Reading Queue Messages (023-feature-roadmap) ==========
  'queue.add': {
    request: {
      url: string;
      title: string;
      excerpt?: string;
      author?: string;
      faviconUrl?: string;
      language?: string;
      estimatedReadTime?: number;
    };
    response: {
      success: boolean;
      id: string;
      position: number;
      error?: string;
    };
  };

  'queue.remove': {
    request: {
      id: string;
    };
    response: {
      success: boolean;
      error?: string;
    };
  };

  'queue.reorder': {
    request: {
      id: string;
      newPosition: number;
    };
    response: {
      success: boolean;
      items: Array<{ id: string; position: number }>;
      error?: string;
    };
  };

  'queue.updateStatus': {
    request: {
      id: string;
      status: QueueItemStatus;
    };
    response: {
      success: boolean;
      error?: string;
    };
  };

  'queue.updateProgress': {
    request: {
      id: string;
      progress: number;
      lastParagraphIndex?: number;
    };
    response: {
      success: boolean;
      error?: string;
    };
  };

  'queue.clear': {
    request: {
      filter?: 'all' | 'completed' | 'archived';
    };
    response: {
      success: boolean;
      removedCount: number;
      error?: string;
    };
  };

  'queue.getState': {
    request: void;
    response: {
      metadata: {
        version: number;
        count: number;
        lastModified: number;
        totalSize: number;
      };
      items: Array<{
        id: string;
        url: string;
        title: string;
        domain: string;
        excerpt?: string;
        author?: string;
        faviconUrl?: string;
        language?: string;
        estimatedReadTime?: number;
        addedAt: number;
        position: number;
        status: QueueItemStatus;
        progress: number;
        lastParagraphIndex?: number;
      }>;
    };
  };

  'queue.getItem': {
    request: {
      id: string;
    };
    response: {
      success: boolean;
      item?: {
        id: string;
        url: string;
        title: string;
        domain: string;
        excerpt?: string;
        author?: string;
        faviconUrl?: string;
        language?: string;
        estimatedReadTime?: number;
        addedAt: number;
        position: number;
        status: QueueItemStatus;
        progress: number;
        lastParagraphIndex?: number;
      };
      error?: string;
    };
  };

  'queue.play': {
    request: {
      startFromId?: string;
    };
    response: {
      success: boolean;
      currentItem?: {
        id: string;
        url: string;
        title: string;
      };
      error?: string;
    };
  };

  'queue.playNext': {
    request: void;
    response: {
      success: boolean;
      currentItem?: {
        id: string;
        url: string;
        title: string;
      };
      hasMore: boolean;
      error?: string;
    };
  };

  'queue.playPrevious': {
    request: void;
    response: {
      success: boolean;
      currentItem?: {
        id: string;
        url: string;
        title: string;
      };
      error?: string;
    };
  };
}
