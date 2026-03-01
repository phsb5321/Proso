// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso Messaging Protocol
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
 * Post-045: Only ElevenLabs is supported
 */
export type ProviderId = 'elevenlabs' | 'browser';

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
 * Theme mode type (027-settings-ux-overhaul)
 */
export type ThemeModeType = 'light' | 'dark' | 'system';

/**
 * Settings section type for reset (027-settings-ux-overhaul)
 */
export type SettingsSectionType =
  | 'quick-settings'
  | 'appearance'
  | 'reading-queue'
  | 'developer'
  | 'all';

/**
 * API provider type for testing (027-settings-ux-overhaul)
 * Post-045: Only ElevenLabs for TTS, anthropic for AI summaries
 */
export type ApiProviderType = 'elevenlabs' | 'anthropic';

/**
 * Footer action type
 */
export type FooterAction =
  | 'play'
  | 'pause'
  | 'stop'
  | 'next'
  | 'prev'
  | 'seek'
  | 'speed'
  | 'close'
  | 'minimize'
  | 'expand';

/**
 * Proso Protocol Map
 * Defines all message types with their request/response signatures
 * Compatible with @webext-core/messaging defineExtensionMessaging
 */
export interface ProsoProtocol {
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

  // ========== Paragraph Selection Messages (028-smart-audio-cache) ==========
  /**
   * Notification when user clicks a paragraph to start playback from that point
   */
  'selection.paragraphClicked': {
    request: {
      paragraphIndex: number;
      text: string;
      characterCount: number;
      isCached: boolean;
    };
    response: {
      success: boolean;
      playbackStarted: boolean;
      error?: string;
    };
  };

  /**
   * Enable paragraph selection mode
   */
  'selection.enable': {
    request: {
      url: string;
      paragraphCount: number;
      cachedIndices: number[];
    };
    response: {
      success: boolean;
    };
  };

  /**
   * Disable paragraph selection mode
   */
  'selection.disable': {
    request: void;
    response: {
      success: boolean;
    };
  };

  /**
   * Get cached paragraph indices for current page
   */
  'selection.getCachedParagraphs': {
    request: {
      url: string;
      provider: ProviderId;
      voice: string;
    };
    response: {
      cachedIndices: number[];
      totalParagraphs: number;
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

  // ========== Highlight Persistence Messages (045-pdf-removal-page-reader) ==========

  /**
   * Create a new highlight from text selection
   */
  'highlight.create': {
    request: {
      url: string;
      exact: string;
      prefix?: string;
      suffix?: string;
      color?: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
      note?: string;
    };
    response: {
      success: boolean;
      id?: string;
      error?: string;
    };
  };

  /**
   * Get highlight by ID
   */
  'highlight.get': {
    request: {
      id: string;
    };
    response: {
      success: boolean;
      highlight?: {
        id: string;
        url: string;
        exact: string;
        prefix?: string;
        suffix?: string;
        color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
        note?: string;
        orphaned: boolean;
        created: string;
        modified?: string;
      };
      error?: string;
    };
  };

  /**
   * List highlights for a URL
   */
  'highlight.list': {
    request: {
      url: string;
    };
    response: {
      success: boolean;
      highlights: Array<{
        id: string;
        url: string;
        exact: string;
        color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
        orphaned: boolean;
        created: string;
      }>;
      error?: string;
    };
  };

  /**
   * Update highlight (color or note)
   */
  'highlight.update': {
    request: {
      id: string;
      color?: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
      note?: string;
    };
    response: {
      success: boolean;
      error?: string;
    };
  };

  /**
   * Delete a highlight
   */
  'highlight.delete': {
    request: {
      id: string;
    };
    response: {
      success: boolean;
      error?: string;
    };
  };

  /**
   * Delete all highlights for a URL
   */
  'highlight.deleteByUrl': {
    request: {
      url: string;
    };
    response: {
      success: boolean;
      deletedCount: number;
      error?: string;
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
      currentTime?: string;
      totalTime?: string;
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

  // ========== Prefetch Messages (028-smart-audio-cache) ==========

  /**
   * Start prefetching upcoming paragraphs
   */
  'prefetch.start': {
    request: {
      /** Current paragraph index to start from */
      currentIndex: number;
      /** Provider to use for audio generation */
      provider: ProviderId;
      /** Voice ID to use */
      voice?: string;
    };
    response: {
      success: boolean;
      /** Number of items queued for prefetch */
      queuedCount: number;
      error?: string;
    };
  };

  /**
   * Stop prefetching
   */
  'prefetch.stop': {
    request: void;
    response: {
      success: boolean;
    };
  };

  /**
   * Get current prefetch status
   */
  'prefetch.getStatus': {
    request: void;
    response: {
      /** Whether prefetching is active */
      isActive: boolean;
      /** Number of items in prefetch buffer */
      bufferSize: number;
      /** Indices currently in buffer */
      bufferedIndices: number[];
      /** Number of pending tasks */
      pendingTasks: number;
      /** Number of tasks in progress */
      inProgressTasks: number;
    };
  };

  /**
   * Clear prefetch buffer
   */
  'prefetch.clearBuffer': {
    request: {
      /** Optional indices to keep in buffer */
      keepIndices?: number[];
    };
    response: {
      success: boolean;
      /** Number of items cleared */
      clearedCount: number;
    };
  };

  // ========== Smart Audio Cache Messages (028-smart-audio-cache) ==========

  /**
   * Get cache statistics
   */
  'cache.getStats': {
    request: void;
    response: {
      entries: number;
      totalSize: number;
      maxSize: number;
      sizePercentage: number;
      hitCount: number;
      missCount: number;
      hitRate: number;
      oldestEntryAge?: number;
      newestEntryAge?: number;
    };
  };

  /**
   * Clear all cache entries
   */
  'cache.clear': {
    request: void;
    response: {
      success: boolean;
      entriesRemoved: number;
      bytesFreed: number;
    };
  };

  /**
   * Clear cache entries for specific URL
   */
  'cache.clearUrl': {
    request: {
      url: string;
    };
    response: {
      success: boolean;
      entriesRemoved: number;
    };
  };

  /**
   * Check if paragraph is cached
   */
  'cache.check': {
    request: {
      url: string;
      paragraphIndex: number;
      provider: string;
      voice: string;
      contentHash: string;
    };
    response: {
      isCached: boolean;
      cacheKey?: string;
      size?: number;
    };
  };

  /**
   * Get cached audio
   */
  'cache.get': {
    request: {
      cacheKey: string;
    };
    response: {
      success: boolean;
      audioUrl?: string;
      duration?: number;
      wordTimeline?: Array<{
        word: string;
        startTimeMs: number;
        endTimeMs: number;
      }>;
    };
  };

  /**
   * Store audio in cache
   */
  'cache.set': {
    request: {
      url: string;
      paragraphIndex: number;
      provider: string;
      voice: string;
      contentHash: string;
      audioData: ArrayBuffer;
      durationMs?: number;
      codec?: 'mp3' | 'opus';
      wordTimeline?: Array<{
        word: string;
        startMs: number;
        endMs: number;
        charOffset: number;
        charLength: number;
      }>;
    };
    response: {
      success: boolean;
      cacheKey: string;
      evictedCount: number;
    };
  };

  /**
   * Get cost estimate
   */
  'cost.estimate': {
    request: {
      url: string;
      startParagraph?: number;
      endParagraph?: number;
      provider: string;
      voice: string;
    };
    response: {
      totalCharacters: number;
      cachedCharacters: number;
      uncachedCharacters: number;
      provider: string;
      pricePerKiloChar: number;
      estimatedCost: number;
      actualCost: number;
      savingsFromCache: number;
      savingsPercentage: number;
      paragraphCosts: Array<{
        index: number;
        characters: number;
        isCached: boolean;
        cost: number;
      }>;
    };
  };

  /**
   * Get paragraph cache status
   */
  'paragraphs.getStatus': {
    request: {
      url: string;
      provider: string;
      voice: string;
    };
    response: {
      paragraphs: Array<{
        index: number;
        isCached: boolean;
        estimatedCost: number;
      }>;
      totalCachedCount: number;
      totalEstimatedCost: number;
      totalSavings: number;
    };
  };

  // ========== Settings UX Messages (027-settings-ux-overhaul) ==========

  /**
   * Test an API key validity by making a minimal API call
   */
  'settings.testApiKey': {
    request: {
      provider: ApiProviderType;
      apiKey: string;
    };
    response: {
      success: boolean;
      provider: string;
      error?: string;
      latencyMs?: number;
    };
  };

  /**
   * Get current theme preference
   */
  'settings.getTheme': {
    request: void;
    response: {
      mode: ThemeModeType;
      resolvedTheme: 'light' | 'dark';
    };
  };

  /**
   * Set theme preference
   */
  'settings.setTheme': {
    request: {
      mode: ThemeModeType;
    };
    response: {
      success: boolean;
      mode: ThemeModeType;
      resolvedTheme: 'light' | 'dark';
    };
  };

  /**
   * Reset settings for a specific section to defaults
   */
  'settings.resetSection': {
    request: {
      section: SettingsSectionType;
    };
    response: {
      success: boolean;
      section: string;
      resetKeys: string[];
    };
  };

  // ========== Reader Messages (045-pdf-removal-page-reader) ==========

  /**
   * Extract article from current page using Readability
   */
  'reader.extractArticle': {
    request: {
      url: string;
      includeImages?: boolean;
      minParagraphLength?: number;
    };
    response: {
      success: boolean;
      article?: {
        url: string;
        title: string;
        byline?: string;
        siteName?: string;
        content: string;
        paragraphs: Array<{
          index: number;
          text: string;
          startOffset: number;
          endOffset: number;
        }>;
        length: number;
        excerpt?: string;
        lang?: string;
        extractedAt: string;
      };
      error?: string;
    };
  };

  /**
   * Get paragraphs for current article
   */
  'reader.getParagraphs': {
    request: void;
    response: {
      success: boolean;
      paragraphs: Array<{
        index: number;
        text: string;
      }>;
      totalCount: number;
    };
  };

  /**
   * Check if current page is article-like
   */
  'reader.isArticlePage': {
    request: void;
    response: {
      isArticle: boolean;
      confidence: number;
    };
  };

  // ========== Audio Player Messages (045-pdf-removal-page-reader) ==========

  /**
   * Load audio for playback
   */
  'audioPlayer.load': {
    request: {
      audioData: ArrayBuffer;
      paragraphIndex: number;
    };
    response: {
      success: boolean;
      durationMs?: number;
      error?: string;
    };
  };

  /**
   * Start/resume playback
   */
  'audioPlayer.play': {
    request: void;
    response: {
      success: boolean;
      error?: string;
    };
  };

  /**
   * Pause playback
   */
  'audioPlayer.pause': {
    request: void;
    response: {
      success: boolean;
      positionMs: number;
      error?: string;
    };
  };

  /**
   * Stop playback and unload audio
   */
  'audioPlayer.stop': {
    request: void;
    response: {
      success: boolean;
      error?: string;
    };
  };

  /**
   * Seek to position
   */
  'audioPlayer.seek': {
    request: {
      positionMs: number;
    };
    response: {
      success: boolean;
      positionMs: number;
      error?: string;
    };
  };

  /**
   * Set playback speed
   */
  'audioPlayer.setSpeed': {
    request: {
      speed: number;
    };
    response: {
      success: boolean;
      speed: number;
      error?: string;
    };
  };

  /**
   * Get current playback state
   */
  'audioPlayer.getState': {
    request: void;
    response: {
      status: PlaybackStatus;
      positionMs: number;
      durationMs: number;
      speed: number;
      paragraphIndex: number;
    };
  };
}
