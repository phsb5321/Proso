/**
 * Port Interface Contracts for Hexagonal Architecture
 *
 * This file defines the TypeScript interfaces that form the contracts
 * between the domain layer and infrastructure adapters.
 *
 * Feature: 034-hexagonal-architecture
 * Date: 2026-01-06
 *
 * IMPORTANT: These interfaces must NOT import from infrastructure layer.
 * Adapters import these interfaces; these interfaces import nothing external.
 */

// ============================================================================
// SHARED TYPES
// ============================================================================

/**
 * Result type for explicit error handling
 */
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/**
 * Playback status enum
 */
export type PlaybackStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'stopped'
  | 'error';

/**
 * Text extraction mode
 */
export type ExtractionMode = 'selection' | 'article' | 'full';

/**
 * TTS provider identifier
 */
export type ProviderId =
  | 'openai'
  | 'elevenlabs'
  | 'cartesia'
  | 'groq'
  | 'browser';

// ============================================================================
// AUDIO GENERATOR PORT
// ============================================================================

/**
 * Port interface for TTS audio generation
 *
 * Implementations:
 * - OpenAIAudioAdapter
 * - ElevenLabsAudioAdapter
 * - GroqAudioAdapter
 * - CartesiaAudioAdapter
 * - BrowserAudioAdapter
 */
// `IAudioGenerator` used to be copied out in full here. It was removed on
// 25/08/2026 because the copy had DRIFTED from the shipped interface and was
// therefore misleading rather than informative: it lacked `signal` (T015
// cancellation), `supportsChunkedSynthesis` and `generateAudioChunks` (spec 100
// FR-7), and `ChunkedSynthesisOptions` (PROSO-209 cross-paragraph priming).
//
// A design-time contract that contradicts the code is a liability, and keeping
// two copies in step by hand is the maintenance cost that produced the drift.
// The live interface is the single source of truth:
//
//   packages/extension/src/ports/audio-generator.port.ts
//
// Spec 034's actual record — what was decided and why — is unchanged in its
// spec.md and plan.md. Only this stale duplicate is gone.


// The audio-domain types (AudioRequest, AudioResponse, WordTiming, Voice,
// AudioError) were hand-copied here and have been removed for the same reason
// as IAudioGenerator above: the copies had drifted, and jscpd confirmed them as
// verbatim duplicates of the live definitions. Two copies of a type kept in
// step by hand is how the drift happened in the first place.
//
// Live source of truth:  packages/extension/src/ports/audio-generator.port.ts


// ============================================================================
// CACHE STORE PORT
// ============================================================================

/**
 * Port interface for audio cache storage
 *
 * Implementations:
 * - IndexedDBCacheAdapter (production)
 * - InMemoryCacheAdapter (testing)
 */
export interface ICacheStore {
  /**
   * Get cached audio entry
   * @param key - Cache key
   * @returns Result with entry (or null if not found) or error
   */
  get(key: CacheKey): Promise<Result<CacheEntry | null, CacheError>>;

  /**
   * Store audio entry
   * @param key - Cache key
   * @param entry - Entry to store
   * @returns Result indicating success or error
   */
  set(key: CacheKey, entry: CacheEntry): Promise<Result<void, CacheError>>;

  /**
   * Delete specific entry
   * @param key - Cache key
   * @returns Result with true if deleted, false if not found
   */
  delete(key: CacheKey): Promise<Result<boolean, CacheError>>;

  /**
   * Clear all entries (optionally filtered by URL)
   * @param urlFilter - Optional URL hash to filter by
   * @returns Result with count of deleted entries
   */
  clear(urlFilter?: string): Promise<Result<number, CacheError>>;

  /**
   * Check if entry exists without retrieving it
   * @param key - Cache key
   * @returns True if entry exists
   */
  has(key: CacheKey): Promise<boolean>;

  /**
   * Get cache statistics
   * @returns Cache stats
   */
  getStats(): Promise<CacheStats>;

  /**
   * Run eviction if cache exceeds threshold
   * @returns Result with count of evicted entries
   */
  evictIfNeeded(): Promise<Result<number, CacheError>>;
}

export interface CacheKey {
  readonly urlHash: string;
  readonly paragraphIndex: number;
  readonly provider: string;
  readonly voice: string;
  readonly contentHash: string;
}

export interface CacheEntry {
  readonly audioBlob: Blob;
  readonly durationMs: number;
  readonly wordTimings: readonly WordTiming[] | null;
  readonly createdAt: number;
  readonly lastAccessedAt: number;
  readonly accessCount: number;
  readonly sizeBytes: number;
}

export interface CacheStats {
  readonly entries: number;
  readonly totalSizeBytes: number;
  readonly maxSizeBytes: number;
  readonly hitCount: number;
  readonly missCount: number;
  readonly oldestEntryAgeMs: number | null;
}

export type CacheError =
  | { type: 'storage_full'; currentSize: number; maxSize: number }
  | { type: 'entry_not_found'; key: string }
  | { type: 'serialization_failed'; message: string }
  | { type: 'database_error'; message: string };

// ============================================================================
// HIGHLIGHT SYNCHRONIZER PORT
// ============================================================================

/**
 * Port interface for content script highlight coordination
 *
 * Implementations:
 * - HighlightSyncAdapter (uses browser.tabs.sendMessage)
 */
export interface IHighlightSynchronizer {
  /**
   * Highlight a paragraph in the content script
   * @param tabId - Tab to highlight in
   * @param paragraphIndex - Paragraph index to highlight
   * @param scroll - Whether to scroll to the paragraph
   */
  highlightParagraph(
    tabId: number,
    paragraphIndex: number,
    scroll: boolean
  ): Promise<Result<void, HighlightError>>;

  /**
   * Highlight a word within the current paragraph
   * @param tabId - Tab to highlight in
   * @param paragraphIndex - Paragraph index
   * @param wordIndex - Word index within paragraph
   */
  highlightWord(
    tabId: number,
    paragraphIndex: number,
    wordIndex: number
  ): Promise<Result<void, HighlightError>>;

  /**
   * Clear all highlights
   * @param tabId - Tab to clear highlights in
   */
  clearHighlights(tabId: number): Promise<Result<void, HighlightError>>;

  /**
   * Show the sticky footer player
   * @param tabId - Tab to show footer in
   */
  showFooter(tabId: number): Promise<Result<void, HighlightError>>;

  /**
   * Hide the sticky footer player
   * @param tabId - Tab to hide footer in
   */
  hideFooter(tabId: number): Promise<Result<void, HighlightError>>;

  /**
   * Update footer state
   * @param tabId - Tab to update
   * @param state - New footer state
   */
  updateFooterState(
    tabId: number,
    state: FooterState
  ): Promise<Result<void, HighlightError>>;
}

export interface FooterState {
  readonly status: PlaybackStatus;
  readonly currentIndex: number;
  readonly totalParagraphs: number;
  readonly progress: number;
  readonly currentText: string;
  readonly speed: number;
}

export type HighlightError =
  | { type: 'tab_not_found'; tabId: number }
  | { type: 'content_script_not_loaded' }
  | { type: 'message_failed'; message: string };

// ============================================================================
// TEXT EXTRACTOR PORT
// ============================================================================

/**
 * Port interface for text extraction strategies
 *
 * Implementations:
 * - ReadabilityExtractorAdapter (Mozilla Readability)
 * - PDFExtractorAdapter (pdfjs-dist)
 */
export interface ITextExtractor {
  /**
   * Extract readable text from document/selection
   * @param mode - Extraction mode
   * @param document - Document object or HTML string
   * @returns Result with extracted content or error
   */
  extract(
    mode: ExtractionMode,
    document: Document | string
  ): Promise<Result<ExtractedContent, ContentExtractionError>>;

  /**
   * Check if this extractor can handle the content type
   * @param contentType - MIME type
   * @param url - Optional URL for additional detection
   */
  canHandle(contentType: string, url?: string): boolean;

  /**
   * Extractor identifier
   */
  readonly extractorId: string;
}

export interface ExtractedContent {
  readonly paragraphs: readonly Paragraph[];
  readonly totalCharacters: number;
  readonly extractionTimeMs: number;
  readonly sourceUrl: string;
  readonly title: string | null;
}

export interface Paragraph {
  readonly text: string;
  readonly index: number;
  readonly type: 'paragraph' | 'heading' | 'list';
  readonly characterCount: number;
}

export type ContentExtractionError =
  | { type: 'no_readable_content' }
  | { type: 'extraction_failed'; message: string }
  | { type: 'invalid_selection' }
  | { type: 'dom_access_denied' };

// ============================================================================
// CONTENT SCORER PORT
// ============================================================================

/**
 * Port interface for content relevance scoring
 *
 * Implementations:
 * - TrafilaturaScorerAdapter (custom scoring algorithm)
 */
export interface IContentScorer {
  /**
   * Score an element for content relevance
   * @param element - DOM element to score
   */
  scoreElement(element: Element): ContentScore;

  /**
   * Score HTML content
   * @param html - HTML string to score
   */
  scoreHtml(html: string): ContentScore;

  /**
   * Find the best content container in a document
   * @param document - Document to search
   * @returns Best container element or null
   */
  findBestContainer(document: Document): Element | null;
}

export interface ContentScore {
  readonly score: number;
  readonly paragraphCount: number;
  readonly linkDensity: number;
  readonly headingCount: number;
}

// ============================================================================
// SETTINGS STORE PORT
// ============================================================================

/**
 * Port interface for settings persistence
 *
 * Implementations:
 * - BrowserSettingsAdapter (browser.storage.local)
 */
export interface ISettingsStore {
  /**
   * Get all settings
   * @returns Current settings
   */
  getSettings(): Promise<Settings>;

  /**
   * Update settings (partial update)
   * @param updates - Partial settings to update
   */
  updateSettings(updates: Partial<Settings>): Promise<void>;

  /**
   * Get API key for provider
   * @param provider - Provider to get key for
   * @returns API key or null if not set
   */
  getApiKey(provider: ProviderId): Promise<string | null>;

  /**
   * Set API key for provider
   * @param provider - Provider to set key for
   * @param key - API key
   */
  setApiKey(provider: ProviderId, key: string): Promise<void>;

  /**
   * Subscribe to settings changes
   * @param callback - Callback for changes
   * @returns Unsubscribe function
   */
  subscribe(callback: (settings: Settings) => void): () => void;
}

export interface Settings {
  mode: ExtractionMode;
  provider: ProviderId;
  voice: string | null;
  speed: number;
  showCostEstimate: boolean;
  cacheEnabled: boolean;
  maxCacheSize: number;
  wordSyncEnabled: boolean;
}
