// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * VoxPage Background Service Worker
 * Main entrypoint for WXT extension background context
 */

import { browser } from 'wxt/browser';
import {
  ElevenLabsProvider,
  loadElevenLabsApiKey,
  type WordTiming,
  type AudioWithTiming,
} from '../background/providers/elevenlabs';

// Roadmap feature handlers (023-feature-roadmap)
import { exportHandlers } from '../utils/messaging/handlers/export';
import { summarizeHandlers } from '../utils/messaging/handlers/summarize';
import { ocrHandlers } from '../utils/messaging/handlers/ocr';
import { queueHandlers } from '../utils/messaging/handlers/queue';
import { QUEUE_STORAGE_KEYS } from '../utils/queue/types';

// TTS Providers (multi-provider support)
import { OpenAIProvider } from '../utils/providers/openai';
import { GroqProvider } from '../utils/providers/groq';
import { CartesiaProvider } from '../utils/providers/cartesia';

// Smart Audio Cache (028-smart-audio-cache)
import { getCacheStore, generateContentHash, generateCacheKey } from '../utils/cache';
import type { CachedAudioEntry, WordTimelineItem } from '../utils/cache';

// Playback Queue and Prefetch Service (028-smart-audio-cache User Story 3)
import { playbackQueue, prefetchService } from '../utils/playback';

// Hexagonal Architecture (034-hexagonal-architecture)
import {
  initHexagonalArchitecture,
  dispatchToHexagonal,
  logLegacyDispatch,
} from '../background/init-hexagonal';

// ============================================
// Strangler Fig Pattern: Hexagonal Migration
// ============================================

/**
 * Maps legacy message types to hexagonal handler names.
 * Used during migration to route messages through the new architecture.
 * Once a mapping exists, messages are tried via hex first, then legacy fallback.
 */
const LEGACY_TO_HEXAGONAL_MAP: Record<string, string> = {
  // Phase 2: Playback handlers (T025)
  startPlayback: 'playback.start',
  pausePlayback: 'playback.pause',
  resumePlayback: 'playback.resume',
  stopPlayback: 'playback.stop',
  seekToPosition: 'playback.seekToParagraph',
  nextParagraph: 'playback.next',
  previousParagraph: 'playback.previous',
  getPlaybackState: 'playback.getState',
  setSpeed: 'playback.setSpeed',
  jumpToParagraph: 'playback.seekToParagraph',

  // Phase 3: Audio/Provider handlers (T035)
  getVoices: 'audio.getVoices',
  setVoice: 'audio.setVoice',
  testApiKey: 'audio.validateCredentials',
  testElevenLabsKey: 'audio.validateCredentials',
  'audio.generate': 'audio.generate',
  'provider.select': 'provider.select',
  'provider.getList': 'provider.getList',
  validateLanguageSupport: 'provider.validateLanguage',

  // Phase 4: Settings/Footer handlers (T045)
  'settings.get': 'settings.get',
  'settings.update': 'settings.update',
  'settings.migrate': 'settings.migrate',
  'settings.testApiKey': 'settings.testApiKey',
  'settings.getTheme': 'settings.getTheme',
  'settings.setTheme': 'settings.setTheme',
  updateSettings: 'settings.update',
  FOOTER_ACTION: 'footer.action',
  FOOTER_SHOW: 'footer.show',
  FOOTER_HIDE: 'footer.hide',
  FOOTER_STATE_UPDATE: 'footer.stateUpdate',
  FOOTER_VISIBILITY_CHANGED: 'footer.visibilityChanged',
  FOOTER_POSITION_CHANGED: 'footer.positionChanged',

  // Phase 5: Cache/Prefetch handlers (T054)
  getCachedParagraphs: 'cache.getCachedParagraphs',
  'cost.estimate': 'cost.estimate',
  'cache.getStats': 'cache.getStats',
  'cache.clear': 'cache.clear',
  'cache.check': 'cache.check',
  'cache.get': 'cache.get',
  'cache.evict': 'cache.evict',
  'prefetch.start': 'prefetch.start',
  'prefetch.stop': 'prefetch.stop',
  'prefetch.getStatus': 'prefetch.getStatus',
  'prefetch.clearBuffer': 'prefetch.clearBuffer',

  // Phase 6: PDF handlers (T066)
  'pdf.detected': 'pdf.detected',
  'pdf.extract': 'pdf.extract',
  'pdf.ocr': 'pdf.ocr',
  'pdf.getState': 'pdf.getState',
  'pdf.saveState': 'pdf.saveState',
  'pdf.play': 'pdf.play',
  'pdf.seek': 'pdf.seek',
  'pdf.highlight': 'pdf.highlight',
  'pdf.scrollToPage': 'pdf.scrollToPage',

  // Phase 6: Queue handlers (T066)
  'queue.add': 'queue.add',
  'queue.remove': 'queue.remove',
  'queue.reorder': 'queue.reorder',
  'queue.updateStatus': 'queue.updateStatus',
  'queue.updateProgress': 'queue.updateProgress',
  'queue.clear': 'queue.clear',
  'queue.getState': 'queue.getState',
  'queue.getItem': 'queue.getItem',
  'queue.play': 'queue.play',
  'queue.playNext': 'queue.playNext',
  'queue.playPrevious': 'queue.playPrevious',

  // Debug handlers
  'hexagonal.getStatus': 'hexagonal.getStatus',
  'hexagonal.getDispatchStats': 'hexagonal.getDispatchStats',
};

/**
 * Feature flags for per-domain rollback capability.
 * Set via browser.storage.local.set({ USE_LEGACY_PLAYBACK: true }) to disable hex handlers.
 * Loaded on startup from storage and can be changed at runtime.
 */
interface MigrationFlags {
  USE_LEGACY_PLAYBACK: boolean;
  USE_LEGACY_AUDIO: boolean;
  USE_LEGACY_SETTINGS: boolean;
  USE_LEGACY_CACHE: boolean;
  USE_LEGACY_PDF: boolean;
  USE_LEGACY_QUEUE: boolean;
}

const MIGRATION_FLAGS: MigrationFlags = {
  USE_LEGACY_PLAYBACK: false,
  USE_LEGACY_AUDIO: false,
  USE_LEGACY_SETTINGS: false,
  USE_LEGACY_CACHE: false,
  USE_LEGACY_PDF: false,
  USE_LEGACY_QUEUE: false,
};

/**
 * Check if a message type should use legacy handlers based on feature flags.
 */
function shouldUseLegacy(messageType: string): boolean {
  // Map message types to their feature flag domain
  if (
    messageType.startsWith('playback.') ||
    [
      'startPlayback',
      'pausePlayback',
      'resumePlayback',
      'stopPlayback',
      'seekToPosition',
      'nextParagraph',
      'previousParagraph',
      'getPlaybackState',
      'setSpeed',
      'jumpToParagraph',
    ].includes(messageType)
  ) {
    return MIGRATION_FLAGS.USE_LEGACY_PLAYBACK;
  }
  if (
    messageType.startsWith('audio.') ||
    messageType.startsWith('provider.') ||
    [
      'getVoices',
      'setVoice',
      'testApiKey',
      'testElevenLabsKey',
      'validateLanguageSupport',
    ].includes(messageType)
  ) {
    return MIGRATION_FLAGS.USE_LEGACY_AUDIO;
  }
  if (
    messageType.startsWith('settings.') ||
    messageType.startsWith('FOOTER_') ||
    messageType.startsWith('footer.') ||
    messageType === 'updateSettings'
  ) {
    return MIGRATION_FLAGS.USE_LEGACY_SETTINGS;
  }
  if (
    messageType.startsWith('cache.') ||
    messageType.startsWith('prefetch.') ||
    messageType.startsWith('cost.') ||
    messageType === 'getCachedParagraphs'
  ) {
    return MIGRATION_FLAGS.USE_LEGACY_CACHE;
  }
  if (messageType.startsWith('pdf.')) {
    return MIGRATION_FLAGS.USE_LEGACY_PDF;
  }
  if (messageType.startsWith('queue.')) {
    return MIGRATION_FLAGS.USE_LEGACY_QUEUE;
  }
  return false;
}

/**
 * Load migration flags from storage.
 */
async function loadMigrationFlags(): Promise<void> {
  try {
    const stored = await browser.storage.local.get([
      'USE_LEGACY_PLAYBACK',
      'USE_LEGACY_AUDIO',
      'USE_LEGACY_SETTINGS',
      'USE_LEGACY_CACHE',
      'USE_LEGACY_PDF',
      'USE_LEGACY_QUEUE',
    ]);

    if (typeof stored.USE_LEGACY_PLAYBACK === 'boolean') {
      MIGRATION_FLAGS.USE_LEGACY_PLAYBACK = stored.USE_LEGACY_PLAYBACK;
    }
    if (typeof stored.USE_LEGACY_AUDIO === 'boolean') {
      MIGRATION_FLAGS.USE_LEGACY_AUDIO = stored.USE_LEGACY_AUDIO;
    }
    if (typeof stored.USE_LEGACY_SETTINGS === 'boolean') {
      MIGRATION_FLAGS.USE_LEGACY_SETTINGS = stored.USE_LEGACY_SETTINGS;
    }
    if (typeof stored.USE_LEGACY_CACHE === 'boolean') {
      MIGRATION_FLAGS.USE_LEGACY_CACHE = stored.USE_LEGACY_CACHE;
    }
    if (typeof stored.USE_LEGACY_PDF === 'boolean') {
      MIGRATION_FLAGS.USE_LEGACY_PDF = stored.USE_LEGACY_PDF;
    }
    if (typeof stored.USE_LEGACY_QUEUE === 'boolean') {
      MIGRATION_FLAGS.USE_LEGACY_QUEUE = stored.USE_LEGACY_QUEUE;
    }

    console.log('[Background] Migration flags loaded:', MIGRATION_FLAGS);
  } catch (error) {
    console.warn('[Background] Failed to load migration flags:', error);
  }
}

// Track if hexagonal architecture is initialized
// eslint-disable-next-line prefer-const
let hexagonalInitialized = false;

// ============================================
// State Management
// ============================================

interface PlaybackState {
  status: 'stopped' | 'loading' | 'playing' | 'paused';
  currentParagraph: number;
  totalParagraphs: number;
  progress: number;
  speed: number;
  provider: string;
  voice: string | null;
  currentTime: number; // Current audio time in seconds
  totalTime: number; // Total audio duration in seconds
}

interface ApiKeys {
  elevenlabsApiKey?: string;
  openaiApiKey?: string;
  groqApiKey?: string;
  cartesiaApiKey?: string;
}

const playbackState: PlaybackState = {
  status: 'stopped',
  currentParagraph: 0,
  totalParagraphs: 0,
  progress: 0,
  speed: 1.0,
  provider: 'browser',
  voice: null,
  currentTime: 0,
  totalTime: 0,
};

// Track if audio was manually stopped (to resolve pending Promises)
let audioStoppedManually = false;
let audioResolveCallback: ((value: boolean) => void) | null = null;

let activeTabId: number | null = null;
let paragraphs: string[] = [];
let apiKeys: ApiKeys = {};
let elevenlabsProvider: ElevenLabsProvider | null = null;

// Word timing state for word-by-word highlighting
let currentWordTimings: WordTiming[] = [];
let currentWordIndex = -1;
let wordHighlightInterval: ReturnType<typeof setInterval> | null = null;

// Audio prefetch cache - stores pre-generated audio for upcoming paragraphs
interface PrefetchedAudio {
  audioUrl: string;
  wordTimings: WordTiming[];
  paragraphIndex: number;
}
const audioPrefetchCache: Map<number, PrefetchedAudio> = new Map();
const PREFETCH_AHEAD_COUNT = 3; // Number of paragraphs to prefetch ahead
let prefetchInProgress = false;

// Current page URL for cache lookups
let currentPageUrl: string | null = null;

// ============================================
// Blob URL Lifecycle Management (T002: 035-selection-tts-hardening)
// ============================================

/**
 * Track active blob URLs by paragraph index to prevent memory leaks.
 * Key: paragraph index
 * Value: blob URL (blob:moz-extension://...)
 *
 * Lifecycle rules (per research.md R6):
 * - Revoke previous URL before creating new one for same paragraph
 * - Revoke all URLs on playback stop or navigation
 * - Do NOT revoke on 'ended' event (breaks seek/replay)
 */
const activeBlobUrls: Map<number, string> = new Map();

/**
 * Track blob URL for a paragraph. Revokes any existing URL for the same paragraph.
 * @param paragraphIndex - The paragraph index
 * @param blobUrl - The blob URL to track
 */
function trackBlobUrl(paragraphIndex: number, blobUrl: string): void {
  // Revoke existing URL for this paragraph if present
  const existingUrl = activeBlobUrls.get(paragraphIndex);
  if (existingUrl) {
    console.log(`[VoxPage:BlobURL] Revoking previous URL for paragraph ${paragraphIndex}`);
    URL.revokeObjectURL(existingUrl);
  }

  // Track the new URL
  activeBlobUrls.set(paragraphIndex, blobUrl);
  console.log(
    `[VoxPage:BlobURL] Created: ${blobUrl.substring(0, 30)}... for paragraph ${paragraphIndex}`,
  );
}

/**
 * Revoke a specific blob URL by paragraph index.
 * @param paragraphIndex - The paragraph index whose URL should be revoked
 */
function revokeBlobUrl(paragraphIndex: number): void {
  const url = activeBlobUrls.get(paragraphIndex);
  if (url) {
    console.log(
      `[VoxPage:BlobURL] Revoked: ${url.substring(0, 30)}... for paragraph ${paragraphIndex}`,
    );
    URL.revokeObjectURL(url);
    activeBlobUrls.delete(paragraphIndex);
  }
}

/**
 * Revoke all tracked blob URLs.
 * Called on playback stop or tab navigation.
 */
function revokeAllBlobUrls(): void {
  const count = activeBlobUrls.size;
  if (count === 0) return;

  console.log(`[VoxPage:BlobURL] Revoking all ${count} tracked blob URLs`);
  for (const [index, url] of activeBlobUrls) {
    console.log(`[VoxPage:BlobURL] Revoked: ${url.substring(0, 30)}... for paragraph ${index}`);
    URL.revokeObjectURL(url);
  }
  activeBlobUrls.clear();
}

/**
 * Clean up blob URLs for paragraphs before the current one.
 * Called during playback to free memory for already-played paragraphs.
 * @param currentParagraphIndex - The current paragraph being played
 */
function cleanupOldBlobUrls(currentParagraphIndex: number): void {
  const toRemove: number[] = [];
  for (const [index] of activeBlobUrls) {
    if (index < currentParagraphIndex - 1) {
      // Keep current and previous paragraph URLs for seek/replay
      toRemove.push(index);
    }
  }

  for (const index of toRemove) {
    revokeBlobUrl(index);
  }
}

// ============================================
// Tab Communication
// ============================================

async function getActiveTab(): Promise<{ id?: number; url?: string } | null> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function sendToContentScript(
  tabId: number,
  message: Record<string, unknown>,
): Promise<unknown> {
  try {
    return await browser.tabs.sendMessage(tabId, message);
  } catch (error) {
    console.error('[Background] Failed to send to content script:', error);
    return null;
  }
}

// ============================================
// ElevenLabs TTS
// ============================================

/**
 * Initialize or refresh the ElevenLabs provider with the latest API key
 */
async function initElevenLabsProvider(): Promise<ElevenLabsProvider | null> {
  try {
    const apiKey = await loadElevenLabsApiKey();
    console.log('[Background] ElevenLabs API key loaded:', {
      hasKey: !!apiKey,
      keyLength: apiKey?.length || 0,
      keyPrefix: apiKey?.substring(0, 8) || 'none',
    });

    if (!apiKey) {
      console.warn('[Background] No ElevenLabs API key configured');
      return null;
    }

    // Create or update provider
    if (!elevenlabsProvider) {
      elevenlabsProvider = new ElevenLabsProvider(apiKey);
    } else {
      elevenlabsProvider.setApiKey(apiKey);
    }

    // Validate the key
    const isValid = await elevenlabsProvider.validateKey();
    console.log('[Background] ElevenLabs API key validation:', isValid ? 'VALID' : 'INVALID');

    if (!isValid) {
      console.error('[Background] ElevenLabs API key is invalid');
      return null;
    }

    return elevenlabsProvider;
  } catch (error) {
    console.error('[Background] Error initializing ElevenLabs provider:', error);
    return null;
  }
}

interface ElevenLabsAudioResult {
  audioUrl: string;
  audioData: ArrayBuffer; // Raw audio data for caching
  wordTimings: WordTiming[];
  duration: number;
}

async function generateElevenLabsAudio(text: string): Promise<ElevenLabsAudioResult | null> {
  // Initialize/refresh provider with latest key
  const provider = await initElevenLabsProvider();
  if (!provider) {
    console.error('[Background] ElevenLabs provider not available');
    return null;
  }

  try {
    console.log(
      '[Background] Generating ElevenLabs audio with timestamps, text length:',
      text.length,
    );

    // Get voice - use saved preference or default
    let voiceId = playbackState.voice;
    let voiceName = 'Unknown';

    if (!voiceId) {
      const defaultVoice = provider.getDefaultVoice();
      voiceId = defaultVoice.id;
      voiceName = defaultVoice.name;
    } else {
      const voices = provider.getVoices();
      const voice = voices.find((v) => v.id === voiceId);
      voiceName = voice?.name || 'Custom';
    }

    console.log('[Background] Using voice:', voiceName, voiceId);

    // Generate audio WITH timestamps for word-by-word highlighting
    const result = (await provider.generateAudio(text, voiceId, {
      turbo: false,
      stability: 0.5,
      similarityBoost: 0.75,
      style: 0.5,
      withTimestamps: true,
    })) as AudioWithTiming;

    // Result is AudioWithTiming with audioData and wordTiming
    const blob = new Blob([result.audioData], { type: 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(blob);

    // Calculate duration from last word timing
    const duration =
      result.wordTiming.length > 0
        ? result.wordTiming[result.wordTiming.length - 1].endTimeMs / 1000
        : 0;

    console.log(
      '[Background] ElevenLabs audio generated with',
      result.wordTiming.length,
      'word timings, duration:',
      duration,
    );

    return {
      audioUrl,
      audioData: result.audioData, // Return raw data for caching
      wordTimings: result.wordTiming,
      duration,
    };
  } catch (error) {
    // T031: Add error context (provider, paragraph index)
    console.error('[Background] ElevenLabs generation error:', {
      error,
      provider: 'elevenlabs',
      paragraphIndex: playbackState.currentParagraph,
    });
    return null;
  }
}

/**
 * Configure and start the modular prefetch service
 * Called when playback starts
 */
function configurePrefetchService(): void {
  // Audio generator function for the prefetch service
  const audioGenerator = async (text: string, index: number) => {
    // Only generate for ElevenLabs
    if (playbackState.provider !== 'elevenlabs' || !apiKeys.elevenlabsApiKey) {
      return null;
    }

    console.log('[Background] Prefetch generating audio for paragraph', index + 1);
    const result = await generateElevenLabsAudio(text);
    if (!result) return null;

    return {
      audioUrl: result.audioUrl,
      wordTimings: result.wordTimings,
    };
  };

  // Cache checker function
  const cacheChecker = async (index: number): Promise<boolean> => {
    if (!currentPageUrl) return false;
    const cacheStore = getCacheStore();
    const voiceId = playbackState.voice ?? 'default';
    const text = paragraphs[index];
    if (!text) return false;

    const contentHash = await generateContentHash(text);
    const cacheKey = generateCacheKey(
      currentPageUrl,
      index,
      playbackState.provider,
      voiceId,
      contentHash,
    );
    return cacheStore.has(cacheKey);
  };

  // Initialize playback queue with paragraphs
  playbackQueue.initialize(paragraphs, {
    startIndex: playbackState.currentParagraph,
  });

  // Configure prefetch service
  prefetchService.configure(playbackQueue, audioGenerator, cacheChecker);
}

/**
 * Start prefetching (wrapper for legacy compatibility)
 */
function startPrefetching(): void {
  // Only prefetch for ElevenLabs (API-based TTS)
  if (playbackState.provider !== 'elevenlabs' || !apiKeys.elevenlabsApiKey) {
    return;
  }

  prefetchService.start();
}

/**
 * Stop prefetching and clear buffer
 */
function stopPrefetching(): void {
  prefetchService.stop();
  prefetchService.clearBuffer();
}

/**
 * Prefetch audio for upcoming paragraphs to eliminate buffering delays
 * Called after current paragraph starts playing
 * @deprecated Use startPrefetching() with the modular prefetch service
 */
async function prefetchUpcomingAudio(): Promise<void> {
  if (prefetchInProgress || playbackState.status !== 'playing') {
    return;
  }

  // Only prefetch for ElevenLabs (API-based TTS)
  if (playbackState.provider !== 'elevenlabs' || !apiKeys.elevenlabsApiKey) {
    return;
  }

  prefetchInProgress = true;

  const currentIndex = playbackState.currentParagraph;
  const endIndex = Math.min(currentIndex + PREFETCH_AHEAD_COUNT + 1, paragraphs.length);

  for (let i = currentIndex + 1; i < endIndex; i++) {
    // Skip if already in modular prefetch buffer
    if (prefetchService.has(i)) {
      continue;
    }

    // Skip if already cached in legacy cache
    if (audioPrefetchCache.has(i)) {
      continue;
    }

    // Stop prefetching if playback stopped/paused
    if (playbackState.status !== 'playing') {
      break;
    }

    const text = paragraphs[i];
    if (!text || text.trim().length === 0) {
      continue;
    }

    console.log('[Background] Prefetching audio for paragraph', i + 1);
    const audioResult = await generateElevenLabsAudio(text);

    if (audioResult && playbackState.status === 'playing') {
      audioPrefetchCache.set(i, {
        audioUrl: audioResult.audioUrl,
        wordTimings: audioResult.wordTimings,
        paragraphIndex: i,
      });
      console.log(
        '[Background] Prefetched paragraph',
        i + 1,
        '- cache size:',
        audioPrefetchCache.size,
      );
    }
  }

  prefetchInProgress = false;
}

/**
 * Clear old entries from prefetch cache (paragraphs we've already passed)
 */
function cleanupPrefetchCache(): void {
  const currentIndex = playbackState.currentParagraph;
  // Clean up legacy prefetch cache
  for (const [index] of audioPrefetchCache) {
    if (index < currentIndex) {
      audioPrefetchCache.delete(index);
    }
  }
  // Clean up modular prefetch buffer
  prefetchService.clearBuffer([currentIndex, currentIndex + 1, currentIndex + 2]);
}

/**
 * Clear all prefetch cache (called on stop/new playback)
 */
function clearPrefetchCache(): void {
  // Stop and clear modular prefetch service
  stopPrefetching();
  // Clear legacy prefetch cache
  audioPrefetchCache.clear();
  prefetchInProgress = false;
}

// ============================================
// Persistent Audio Cache (T023-T024)
// ============================================

/**
 * T023: Check persistent cache for audio entry
 * Returns cached audio if found, null otherwise
 */
async function checkPersistentCache(
  url: string,
  paragraphIndex: number,
  text: string,
  provider: string,
  voice: string,
): Promise<{ audioUrl: string; wordTimings: WordTiming[] } | null> {
  try {
    const cacheStore = getCacheStore();
    const contentHash = await generateContentHash(text);
    const cacheKey = generateCacheKey(url, paragraphIndex, provider, voice, contentHash);

    // Check if entry exists in cache
    if (!cacheStore.has(cacheKey)) {
      console.log('[Background] Cache miss for paragraph', paragraphIndex);
      return null;
    }

    // Retrieve the cached entry
    const entry = await cacheStore.get(cacheKey);
    if (!entry) {
      console.log('[Background] Cache miss (entry not found) for paragraph', paragraphIndex);
      return null;
    }

    console.log(
      '[Background] Cache hit for paragraph',
      paragraphIndex,
      '- size:',
      entry.compressedSize,
    );

    // Convert ArrayBuffer to blob URL
    const blob = new Blob([entry.audioData], { type: 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(blob);

    // Parse word timings from entry
    const wordTimings: WordTiming[] = (entry.wordTimeline ?? []).map((wt: WordTimelineItem) => ({
      word: wt.word,
      charOffset: wt.charOffset,
      charLength: wt.charLength,
      startTimeMs: wt.startMs,
      endTimeMs: wt.endMs,
    }));

    return { audioUrl, wordTimings };
  } catch (error) {
    console.error('[Background] Persistent cache lookup error:', error);
    return null;
  }
}

/**
 * T024: Store audio to persistent cache
 */
async function storeToPersistentCache(
  url: string,
  paragraphIndex: number,
  text: string,
  provider: string,
  voice: string,
  audioData: ArrayBuffer,
  wordTimings: WordTiming[],
): Promise<void> {
  try {
    const cacheStore = getCacheStore();
    const contentHash = await generateContentHash(text);

    // Convert WordTiming[] to WordTimelineItem[]
    const wordTimeline: WordTimelineItem[] = wordTimings.map((wt) => ({
      word: wt.word,
      charOffset: wt.charOffset,
      charLength: wt.charLength,
      startMs: wt.startTimeMs,
      endMs: wt.endTimeMs,
    }));

    // Create cache entry
    const entry: Omit<
      CachedAudioEntry,
      'cacheKey' | 'createdAt' | 'lastAccessedAt' | 'accessCount'
    > = {
      url,
      paragraphIndex,
      provider,
      voice,
      contentHash,
      audioData,
      compressedSize: audioData.byteLength,
      wordTimeline,
      durationMs: wordTimings.length > 0 ? wordTimings[wordTimings.length - 1].endTimeMs : 0,
    };

    const cacheKey = await cacheStore.set(entry);
    console.log('[Background] Stored audio to cache:', cacheKey, '- size:', audioData.byteLength);
  } catch (error) {
    console.error('[Background] Failed to store audio to cache:', error);
    // Non-fatal error - audio playback continues without caching
  }
}

// ============================================
// TTS Playback
// ============================================

// Current audio element for background playback
let currentAudio: HTMLAudioElement | null = null;

/**
 * Format seconds to MM:SS string
 */
function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Start word-by-word highlighting based on audio currentTime
 * Uses a polling interval to check the current time and highlight the corresponding word
 */
function startWordHighlighting(paragraphIndex: number): void {
  // Clear any existing interval
  stopWordHighlighting();

  if (currentWordTimings.length === 0 || !activeTabId) {
    console.log('[Background] No word timings or active tab for word highlighting');
    return;
  }

  currentWordIndex = -1;

  // Poll every 50ms (20Hz) for smooth word highlighting
  wordHighlightInterval = setInterval(() => {
    if (!currentAudio || playbackState.status !== 'playing') {
      return;
    }

    const currentTimeMs = currentAudio.currentTime * 1000;

    // Binary search for the current word
    let newWordIndex = -1;
    for (let i = 0; i < currentWordTimings.length; i++) {
      const timing = currentWordTimings[i];
      if (currentTimeMs >= timing.startTimeMs && currentTimeMs <= timing.endTimeMs) {
        newWordIndex = i;
        break;
      }
      // If we've passed this word but haven't reached the next, show this word
      if (
        currentTimeMs > timing.endTimeMs &&
        (i + 1 >= currentWordTimings.length ||
          currentTimeMs < currentWordTimings[i + 1].startTimeMs)
      ) {
        newWordIndex = i;
        break;
      }
    }

    // Only send highlight if word changed
    if (newWordIndex !== currentWordIndex && newWordIndex >= 0 && activeTabId) {
      currentWordIndex = newWordIndex;
      sendToContentScript(activeTabId, {
        action: 'highlightWord',
        paragraphIndex: paragraphIndex,
        wordIndex: currentWordIndex,
        timestamp: currentTimeMs,
      }).catch(() => {
        // Ignore errors - tab might be closed
      });
    }
  }, 50);

  console.log(
    '[Background] Started word highlighting for paragraph',
    paragraphIndex,
    'with',
    currentWordTimings.length,
    'words',
  );
}

/**
 * Stop word-by-word highlighting
 */
function stopWordHighlighting(): void {
  if (wordHighlightInterval) {
    clearInterval(wordHighlightInterval);
    wordHighlightInterval = null;
  }
  currentWordIndex = -1;
}

/**
 * Send footer state update with current time info
 */
async function updateFooterProgress(): Promise<void> {
  if (!activeTabId) return;

  await sendToContentScript(activeTabId, {
    action: 'FOOTER_STATE_UPDATE',
    status: playbackState.status,
    progress: playbackState.progress,
    currentTime: formatTime(playbackState.currentTime),
    totalTime: formatTime(playbackState.totalTime),
    currentParagraph: playbackState.currentParagraph + 1,
    totalParagraphs: playbackState.totalParagraphs,
    speed: playbackState.speed,
  });
}

/**
 * Play audio in the background script (avoids content script autoplay restrictions)
 */
function playAudioInBackground(audioUrl: string, speed: number): Promise<boolean> {
  return new Promise((resolve) => {
    // Validate audio URL before attempting to play
    if (!audioUrl || audioUrl.trim() === '') {
      console.error('[Background] Invalid audio URL: empty or undefined');
      resolve(false);
      return;
    }

    // Check if playback was stopped/paused before starting
    if (playbackState.status !== 'playing') {
      console.log('[Background] Audio playback cancelled - status is', playbackState.status);
      resolve(false);
      return;
    }

    // Reset manual stop flag
    audioStoppedManually = false;

    // Store resolve callback so we can call it when manually stopped
    audioResolveCallback = resolve;

    // Stop any existing audio
    // T026: Use proper cleanup to avoid Invalid URI / CSP errors (035-selection-tts-hardening)
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.removeAttribute('src');
      currentAudio.load();
      currentAudio = null;
    }

    const audio = new Audio(audioUrl);
    currentAudio = audio;
    audio.playbackRate = Math.max(0.5, Math.min(2.0, speed));

    // Track audio duration when metadata loads
    audio.onloadedmetadata = () => {
      // Only set if duration is valid (not Infinity)
      if (audio.duration && isFinite(audio.duration)) {
        playbackState.totalTime = audio.duration;
        console.log('[Background] Audio duration:', audio.duration, 'seconds');
      } else {
        console.warn('[Background] Audio duration not available:', audio.duration);
      }
    };

    // Update progress as audio plays
    audio.ontimeupdate = () => {
      if (audio.duration && isFinite(audio.duration)) {
        playbackState.currentTime = audio.currentTime;
        playbackState.totalTime = audio.duration;
        // Update footer with current time
        updateFooterProgress();
      }
    };

    audio.onended = () => {
      console.log('[Background] Audio playback ended');
      currentAudio = null;
      audioResolveCallback = null;
      resolve(true);
    };

    audio.onerror = (event) => {
      // Ignore errors caused by manual stop
      if (audioStoppedManually) {
        return;
      }
      // T031: Add error context (provider, paragraph index)
      console.error('[Background] Audio playback error:', {
        event,
        provider: playbackState.provider,
        paragraphIndex: playbackState.currentParagraph,
        audioUrl: audioUrl.substring(0, 50),
      });
      currentAudio = null;
      audioResolveCallback = null;
      resolve(false);
    };

    console.log('[Background] Playing audio in background, speed:', speed);
    audio
      .play()
      .then(() => {
        console.log('[Background] Audio play() started successfully');
      })
      .catch((err) => {
        // T031: Add error context (provider, paragraph index)
        console.error('[Background] Audio play() failed:', {
          error: err,
          provider: playbackState.provider,
          paragraphIndex: playbackState.currentParagraph,
          audioUrl: audioUrl.substring(0, 50),
        });
        currentAudio = null;
        audioResolveCallback = null;
        resolve(false);
      });
  });
}

/**
 * Stop current audio playback
 */
function stopCurrentAudio(): void {
  // Set flag before stopping to prevent error handler issues
  audioStoppedManually = true;

  // Stop word highlighting
  stopWordHighlighting();
  currentWordTimings = [];

  // T026: Use proper cleanup to avoid Invalid URI / CSP errors (035-selection-tts-hardening)
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.removeAttribute('src');
    currentAudio.load();
    currentAudio = null;
    console.log('[VoxPage:Audio] Audio stopped and cleaned');
  }

  // T028-T029: Revoke all tracked blob URLs when stopping playback
  revokeAllBlobUrls();

  // Resolve any pending audio Promise so speakCurrentParagraph can check status
  if (audioResolveCallback) {
    audioResolveCallback(false);
    audioResolveCallback = null;
  }
}

async function speakCurrentParagraph(): Promise<void> {
  if (!activeTabId || playbackState.status !== 'playing') {
    return;
  }

  if (playbackState.currentParagraph >= paragraphs.length) {
    // Finished all paragraphs
    console.log('[Background] Playback complete');
    playbackState.status = 'stopped';
    playbackState.currentParagraph = 0;
    playbackState.progress = 100;
    notifyPopup();
    await sendToContentScript(activeTabId, { action: 'FOOTER_HIDE' });
    await sendToContentScript(activeTabId, { action: 'clearHighlight' });
    return;
  }

  const text = paragraphs[playbackState.currentParagraph];
  console.log(
    '[Background] Speaking paragraph',
    playbackState.currentParagraph + 1,
    '/',
    paragraphs.length,
  );

  // Highlight the current paragraph
  await sendToContentScript(activeTabId, {
    action: 'highlight',
    index: playbackState.currentParagraph,
    text: text,
  });

  let success = false;

  // T016: Debug logging for provider selection (035-selection-tts-hardening)
  console.log('[VoxPage:Provider] Selected:', playbackState.provider);
  console.log('[VoxPage:Provider] Voice:', playbackState.voice ?? 'default');

  // T013: API key validation before playback attempt (035-selection-tts-hardening)
  const providerApiKeyMap: Record<string, string | undefined> = {
    elevenlabs: apiKeys.elevenlabsApiKey,
    openai: apiKeys.openaiApiKey,
    groq: apiKeys.groqApiKey,
    cartesia: apiKeys.cartesiaApiKey,
    browser: 'browser-native', // Browser TTS doesn't need API key
  };

  const hasApiKey =
    playbackState.provider === 'browser' || !!providerApiKeyMap[playbackState.provider];

  // T014: Show error notification if API key missing (035-selection-tts-hardening)
  if (!hasApiKey) {
    const errorMessage = `${playbackState.provider.charAt(0).toUpperCase() + playbackState.provider.slice(1)} API key not configured. Please add your API key in the options page.`;
    console.error(`[VoxPage:Provider] API key missing for ${playbackState.provider}`);

    // Send error notification to content script for display in sticky footer
    await sendToContentScript(activeTabId, {
      action: 'PLAYBACK_ERROR',
      message: errorMessage,
      provider: playbackState.provider,
    });

    // Stop playback - do NOT fallback to browser TTS
    playbackState.status = 'stopped';
    notifyPopup();
    return;
  }

  // Provider routing - use the selected provider
  if (playbackState.provider === 'elevenlabs' && apiKeys.elevenlabsApiKey) {
    let audioResult: { audioUrl: string; wordTimings: WordTiming[] } | null = null;
    let shouldStoreToCache = false;
    let generatedAudioData: ArrayBuffer | null = null;

    // T023: First, check persistent cache for this paragraph
    const voiceId = playbackState.voice ?? 'default';
    if (currentPageUrl) {
      const cached = await checkPersistentCache(
        currentPageUrl,
        playbackState.currentParagraph,
        text,
        playbackState.provider,
        voiceId,
      );

      if (cached) {
        console.log(
          '[Background] Using persistently cached audio for paragraph',
          playbackState.currentParagraph + 1,
        );
        audioResult = cached;
      }
    }

    // Second, check modular prefetch service buffer (T048)
    if (!audioResult) {
      const prefetchedModular = prefetchService.consume(playbackState.currentParagraph);
      if (prefetchedModular) {
        console.log(
          '[Background] Using modular prefetch buffer for paragraph',
          playbackState.currentParagraph + 1,
        );
        audioResult = {
          audioUrl: prefetchedModular.audioUrl,
          wordTimings: prefetchedModular.wordTimings,
        };
      }
    }

    // Third, check legacy in-memory prefetch cache
    if (!audioResult) {
      const prefetched = audioPrefetchCache.get(playbackState.currentParagraph);
      if (prefetched) {
        console.log(
          '[Background] Using legacy prefetch cache for paragraph',
          playbackState.currentParagraph + 1,
        );
        audioResult = {
          audioUrl: prefetched.audioUrl,
          wordTimings: prefetched.wordTimings,
        };
        // Remove from cache since we're using it
        audioPrefetchCache.delete(playbackState.currentParagraph);
      }
    }

    // Fourth, generate audio on-demand if not cached
    if (!audioResult) {
      console.log(
        '[Background] Generating audio on-demand for paragraph',
        playbackState.currentParagraph + 1,
      );
      const generated = await generateElevenLabsAudio(text);

      // Check if playback was stopped/paused during API call
      if (playbackState.status !== 'playing') {
        console.log('[Background] Playback cancelled during audio generation');
        return;
      }

      if (generated) {
        audioResult = {
          audioUrl: generated.audioUrl,
          wordTimings: generated.wordTimings,
        };
        // T024: Mark for storing to persistent cache
        shouldStoreToCache = true;
        generatedAudioData = generated.audioData;
      }
    }

    if (audioResult) {
      console.log(
        '[Background] Playing ElevenLabs audio with',
        audioResult.wordTimings.length,
        'word timings',
      );

      // Store word timings for highlighting
      currentWordTimings = audioResult.wordTimings;

      // Send word timeline to content script for word-by-word highlighting
      if (audioResult.wordTimings.length > 0) {
        await sendToContentScript(activeTabId, {
          action: 'setWordTimeline',
          wordTimeline: audioResult.wordTimings.map((wt) => ({
            word: wt.word,
            charOffset: wt.charOffset,
            charLength: wt.charLength,
            startMs: wt.startTimeMs,
            endMs: wt.endTimeMs,
          })),
          paragraphIndex: playbackState.currentParagraph,
        });

        // Start word highlighting
        startWordHighlighting(playbackState.currentParagraph);
      }

      // Start prefetching next paragraphs while this one plays
      startPrefetching(); // Use modular prefetch service
      prefetchUpcomingAudio(); // Also run legacy prefetch for backward compatibility

      // Guard against empty audio URLs
      if (!audioResult.audioUrl || audioResult.audioUrl.trim() === '') {
        console.error('[Background] Empty audio URL in audioResult, skipping playback');
        success = false;
      } else {
        // T028-T029: Track blob URL and revoke previous for this paragraph
        trackBlobUrl(playbackState.currentParagraph, audioResult.audioUrl);
        success = await playAudioInBackground(audioResult.audioUrl, playbackState.speed);
      }

      // T024: Store to persistent cache after successful playback
      if (shouldStoreToCache && generatedAudioData && currentPageUrl) {
        storeToPersistentCache(
          currentPageUrl,
          playbackState.currentParagraph,
          text,
          playbackState.provider,
          voiceId,
          generatedAudioData,
          audioResult.wordTimings,
        ).catch((err) => {
          console.error('[Background] Failed to store to persistent cache:', err);
        });
      }

      // Stop word highlighting when audio ends
      stopWordHighlighting();

      // Clean up old cache entries
      cleanupPrefetchCache();
    } else {
      console.warn('[Background] ElevenLabs failed, falling back to browser TTS');
    }
  } else if (playbackState.provider === 'openai' && apiKeys.openaiApiKey) {
    // OpenAI TTS provider
    console.log('[Background] Generating audio with OpenAI');
    try {
      const openaiProvider = new OpenAIProvider();
      openaiProvider.setApiKey(apiKeys.openaiApiKey);

      const response = await openaiProvider.generateAudio({
        text,
        voice: playbackState.voice,
        speed: playbackState.speed,
      });

      // Convert Blob to URL
      const audioUrl = URL.createObjectURL(response.audioData);

      if (audioUrl && audioUrl.trim() !== '') {
        // T028-T029: Track blob URL and revoke previous for this paragraph
        trackBlobUrl(playbackState.currentParagraph, audioUrl);
        success = await playAudioInBackground(audioUrl, playbackState.speed);
      }

      if (!success) {
        console.warn('[Background] OpenAI playback failed');
      }
    } catch (error) {
      // T031: Add error context (provider, paragraph index)
      console.error('[Background] OpenAI TTS error:', {
        error,
        provider: 'openai',
        paragraphIndex: playbackState.currentParagraph,
      });
    }
  } else if (playbackState.provider === 'groq' && apiKeys.groqApiKey) {
    // Groq TTS provider
    console.log('[Background] Generating audio with Groq');
    try {
      const groqProvider = new GroqProvider();
      groqProvider.setApiKey(apiKeys.groqApiKey);

      const response = await groqProvider.generateAudio({
        text,
        voice: playbackState.voice,
        speed: playbackState.speed,
      });

      // Convert Blob to URL
      const audioUrl = URL.createObjectURL(response.audioData);

      if (audioUrl && audioUrl.trim() !== '') {
        // T028-T029: Track blob URL and revoke previous for this paragraph
        trackBlobUrl(playbackState.currentParagraph, audioUrl);
        success = await playAudioInBackground(audioUrl, playbackState.speed);
      }

      if (!success) {
        console.warn('[Background] Groq playback failed');
      }
    } catch (error) {
      // T031: Add error context (provider, paragraph index)
      console.error('[Background] Groq TTS error:', {
        error,
        provider: 'groq',
        paragraphIndex: playbackState.currentParagraph,
      });
    }
  } else if (playbackState.provider === 'cartesia' && apiKeys.cartesiaApiKey) {
    // Cartesia TTS provider
    console.log('[Background] Generating audio with Cartesia');
    try {
      const cartesiaProvider = new CartesiaProvider();
      cartesiaProvider.setApiKey(apiKeys.cartesiaApiKey);

      const response = await cartesiaProvider.generateAudio({
        text,
        voice: playbackState.voice,
        speed: playbackState.speed,
      });

      // Convert Blob to URL
      const audioUrl = URL.createObjectURL(response.audioData);

      if (audioUrl && audioUrl.trim() !== '') {
        // T028-T029: Track blob URL and revoke previous for this paragraph
        trackBlobUrl(playbackState.currentParagraph, audioUrl);
        success = await playAudioInBackground(audioUrl, playbackState.speed);
      }

      if (!success) {
        console.warn('[Background] Cartesia playback failed');
      }
    } catch (error) {
      // T031: Add error context (provider, paragraph index)
      console.error('[Background] Cartesia TTS error:', {
        error,
        provider: 'cartesia',
        paragraphIndex: playbackState.currentParagraph,
      });
    }
  } else if (playbackState.provider === 'browser') {
    // Browser TTS explicitly selected
    console.log('[Background] Using browser TTS (explicitly selected)');
    currentWordTimings = [];
    await sendToContentScript(activeTabId, {
      action: 'speakText',
      text: text,
      speed: playbackState.speed,
    });
    success = true; // Browser TTS doesn't return completion status
  }

  // T012: Remove silent fallback - show error notification instead (035-selection-tts-hardening)
  // If provider failed (API error, network issue, etc.), notify user instead of silently falling back
  if (!success && playbackState.provider !== 'browser') {
    const errorMessage = `${playbackState.provider.charAt(0).toUpperCase() + playbackState.provider.slice(1)} playback failed. Please check your API key or try again.`;
    console.error(`[VoxPage:Provider] Playback failed for ${playbackState.provider}`);

    // Send error notification to content script for display in sticky footer
    await sendToContentScript(activeTabId, {
      action: 'PLAYBACK_ERROR',
      message: errorMessage,
      provider: playbackState.provider,
    });

    // Stop playback - do NOT fallback to browser TTS
    playbackState.status = 'stopped';
    await sendToContentScript(activeTabId, { action: 'FOOTER_HIDE' });
    await sendToContentScript(activeTabId, { action: 'clearHighlight' });
    notifyPopup();
    return;
  }

  // Check if we're still playing (might have been paused/stopped)
  if (playbackState.status === 'playing') {
    // Advance playback queue (T047)
    playbackQueue.advance();

    // Move to next paragraph
    playbackState.currentParagraph++;
    playbackState.progress = (playbackState.currentParagraph / paragraphs.length) * 100;
    notifyPopup();

    // Update footer
    await sendToContentScript(activeTabId, {
      action: 'FOOTER_STATE_UPDATE',
      status: 'playing',
      currentParagraph: playbackState.currentParagraph,
      totalParagraphs: paragraphs.length,
      progress: playbackState.progress,
    });

    // Speak next paragraph
    speakCurrentParagraph();
  }
}

// ============================================
// Message Router
// ============================================

type MessageHandler = (data: Record<string, unknown>) => Promise<unknown>;

/**
 * Legacy message handlers - most handlers migrated to hexagonal architecture.
 * Only PARAGRAPH_CLICKED and roadmap handlers remain here.
 *
 * T077: Removed commented-out legacy handlers after successful hexagonal migration.
 *
 * Hexagonal handlers: see src/handlers/
 * - playback.handlers.ts (playback.start, playback.pause, etc.)
 * - settings.handlers.ts (settings.get, settings.update, etc.)
 * - footer.handlers.ts (footer.action, footer.show, etc.)
 * - cache.handlers.ts (cache.getStats, cache.clear, etc.)
 * - prefetch.handlers.ts (prefetch.start, prefetch.stop, etc.)
 */
const messageHandlers: Record<string, MessageHandler> = {
  /**
   * Handle paragraph click from content script.
   * Starts playback from the clicked paragraph index.
   * NOTE: This is kept as a legacy handler because it combines:
   * - Text extraction (if needed)
   * - Playback start from specific paragraph
   * - Footer initialization
   * A hexagonal equivalent would require orchestration across multiple services.
   */
  PARAGRAPH_CLICKED: async (data) => {
    const paragraphIndex = data.paragraphIndex as number;
    const isCached = data.isCached as boolean;

    console.log('[Background] Paragraph clicked:', paragraphIndex, 'cached:', isCached);

    const tab = await getActiveTab();
    if (!tab?.id) {
      return { success: false, playbackStarted: false, error: 'No active tab' };
    }

    // Store current page URL for cache lookups
    currentPageUrl = tab.url ?? null;
    activeTabId = tab.id;

    // If paragraphs not yet extracted, extract them first
    if (paragraphs.length === 0) {
      playbackState.status = 'loading';
      notifyPopup();

      // Reload API keys and settings
      const stored = await browser.storage.local.get([
        'elevenlabsApiKey',
        'openaiApiKey',
        'groqApiKey',
        'cartesiaApiKey',
        'elevenlabsVoice',
        'speed',
        'provider',
      ]);
      apiKeys = {
        elevenlabsApiKey: stored.elevenlabsApiKey as string | undefined,
        openaiApiKey: stored.openaiApiKey as string | undefined,
        groqApiKey: stored.groqApiKey as string | undefined,
        cartesiaApiKey: stored.cartesiaApiKey as string | undefined,
      };
      if (stored.elevenlabsVoice) {
        playbackState.voice = stored.elevenlabsVoice as string;
      }
      if (stored.speed) {
        playbackState.speed = stored.speed as number;
      }
      if (stored.provider) {
        playbackState.provider = stored.provider as string;
      }

      // Extract text from the page
      const extractResult = await sendToContentScript(tab.id, {
        action: 'extractText',
        mode: 'article',
      });

      if (extractResult && typeof extractResult === 'object' && 'paragraphs' in extractResult) {
        const result = extractResult as { paragraphs: string[] };
        paragraphs = result.paragraphs;
        playbackState.totalParagraphs = paragraphs.length;
        console.log('[Background] Extracted', playbackState.totalParagraphs, 'paragraphs');
      } else {
        console.error('[Background] Failed to extract text');
        playbackState.status = 'stopped';
        notifyPopup();
        return { success: false, playbackStarted: false, error: 'Failed to extract text' };
      }
    }

    // Validate paragraph index
    if (paragraphIndex < 0 || paragraphIndex >= paragraphs.length) {
      console.error(
        '[Background] Invalid paragraph index:',
        paragraphIndex,
        'total:',
        paragraphs.length,
      );
      return { success: false, playbackStarted: false, error: 'Invalid paragraph index' };
    }

    // Clear prefetch cache and stop current audio
    clearPrefetchCache();
    stopCurrentAudio();

    // Set the current paragraph to the clicked index
    playbackState.currentParagraph = paragraphIndex;
    playbackState.progress = (paragraphIndex / playbackState.totalParagraphs) * 100;
    playbackState.status = 'playing';
    notifyPopup();

    // Show the footer
    await sendToContentScript(tab.id, {
      action: 'FOOTER_SHOW',
      initialState: {
        isPlaying: true,
        currentIndex: playbackState.currentParagraph,
        totalParagraphs: playbackState.totalParagraphs,
        progress: playbackState.progress,
        speed: playbackState.speed,
      },
    });

    // Update footer state
    await sendToContentScript(tab.id, {
      action: 'FOOTER_STATE_UPDATE',
      status: 'playing',
      currentParagraph: playbackState.currentParagraph,
      totalParagraphs: playbackState.totalParagraphs,
      progress: playbackState.progress,
      speed: playbackState.speed,
    });

    // Start speaking from the clicked paragraph
    speakCurrentParagraph();

    return { success: true, playbackStarted: true };
  },

  /**
   * Legacy fallback: Start playback from the beginning.
   * Used when hexagonal playback.start is unavailable (container not initialized).
   */
  startPlayback: async () => {
    const tab = await getActiveTab();
    if (!tab?.id) {
      return { success: false, error: 'No active tab' };
    }

    // Store current page URL for cache lookups
    currentPageUrl = tab.url ?? null;
    activeTabId = tab.id;

    // Set status to loading
    playbackState.status = 'loading';
    notifyPopup();

    // Reload API keys and settings
    const stored = await browser.storage.local.get([
      'elevenlabsApiKey',
      'openaiApiKey',
      'groqApiKey',
      'cartesiaApiKey',
      'elevenlabsVoice',
      'speed',
      'provider',
    ]);
    apiKeys = {
      elevenlabsApiKey: stored.elevenlabsApiKey as string | undefined,
      openaiApiKey: stored.openaiApiKey as string | undefined,
      groqApiKey: stored.groqApiKey as string | undefined,
      cartesiaApiKey: stored.cartesiaApiKey as string | undefined,
    };
    if (stored.elevenlabsVoice) {
      playbackState.voice = stored.elevenlabsVoice as string;
    }
    if (stored.speed) {
      playbackState.speed = stored.speed as number;
    }
    if (stored.provider) {
      playbackState.provider = stored.provider as string;
    }

    // Extract text from the page
    const extractResult = await sendToContentScript(tab.id, {
      action: 'extractText',
      mode: 'article',
    });

    if (extractResult && typeof extractResult === 'object' && 'paragraphs' in extractResult) {
      const result = extractResult as { paragraphs: string[] };
      paragraphs = result.paragraphs;
      playbackState.totalParagraphs = paragraphs.length;
      console.log('[Background] Extracted', playbackState.totalParagraphs, 'paragraphs');
    } else {
      console.error('[Background] Failed to extract text');
      playbackState.status = 'stopped';
      notifyPopup();
      return { success: false, error: 'Failed to extract text' };
    }

    if (paragraphs.length === 0) {
      playbackState.status = 'stopped';
      notifyPopup();
      return { success: false, error: 'No paragraphs found' };
    }

    // Clear prefetch cache and stop current audio
    clearPrefetchCache();
    stopCurrentAudio();

    // Start from the first paragraph
    playbackState.currentParagraph = 0;
    playbackState.progress = 0;
    playbackState.status = 'playing';
    notifyPopup();

    // Show the footer
    await sendToContentScript(tab.id, {
      action: 'FOOTER_SHOW',
      initialState: {
        isPlaying: true,
        currentIndex: 0,
        totalParagraphs: playbackState.totalParagraphs,
        progress: 0,
        speed: playbackState.speed,
      },
    });

    // Update footer state
    await sendToContentScript(tab.id, {
      action: 'FOOTER_STATE_UPDATE',
      status: 'playing',
      currentParagraph: 0,
      totalParagraphs: playbackState.totalParagraphs,
      progress: 0,
      speed: playbackState.speed,
    });

    // Start speaking from the first paragraph
    speakCurrentParagraph();

    return { success: true };
  },

  /**
   * Legacy fallback: Pause playback.
   */
  pausePlayback: async () => {
    if (playbackState.status !== 'playing') {
      return { success: false, error: 'Not playing' };
    }

    playbackState.status = 'paused';
    if (currentAudio) {
      currentAudio.pause();
    }
    stopWordHighlighting();
    notifyPopup();

    if (activeTabId) {
      await sendToContentScript(activeTabId, {
        action: 'FOOTER_STATE_UPDATE',
        status: 'paused',
        currentParagraph: playbackState.currentParagraph,
        totalParagraphs: playbackState.totalParagraphs,
        progress: playbackState.progress,
        speed: playbackState.speed,
      });
    }

    return { success: true };
  },

  /**
   * Legacy fallback: Resume playback.
   */
  resumePlayback: async () => {
    if (playbackState.status !== 'paused') {
      return { success: false, error: 'Not paused' };
    }

    playbackState.status = 'playing';
    if (currentAudio) {
      currentAudio.play();
      // Resume word highlighting
      startWordHighlighting(playbackState.currentParagraph);
    } else {
      // Audio was lost, regenerate
      speakCurrentParagraph();
    }
    notifyPopup();

    if (activeTabId) {
      await sendToContentScript(activeTabId, {
        action: 'FOOTER_STATE_UPDATE',
        status: 'playing',
        currentParagraph: playbackState.currentParagraph,
        totalParagraphs: playbackState.totalParagraphs,
        progress: playbackState.progress,
        speed: playbackState.speed,
      });
    }

    return { success: true };
  },

  /**
   * Legacy fallback: Stop playback.
   */
  stopPlayback: async () => {
    stopCurrentAudio();
    playbackState.status = 'stopped';
    playbackState.currentParagraph = 0;
    playbackState.progress = 0;
    paragraphs = [];
    notifyPopup();

    if (activeTabId) {
      await sendToContentScript(activeTabId, { action: 'FOOTER_HIDE' });
      await sendToContentScript(activeTabId, { action: 'clearHighlight' });
    }

    return { success: true };
  },

  /**
   * Legacy fallback: Next paragraph.
   */
  nextParagraph: async () => {
    if (playbackState.currentParagraph >= paragraphs.length - 1) {
      return { success: false, error: 'Already at last paragraph' };
    }

    stopCurrentAudio();
    playbackState.currentParagraph++;
    playbackState.progress = (playbackState.currentParagraph / paragraphs.length) * 100;
    notifyPopup();

    if (playbackState.status === 'playing') {
      speakCurrentParagraph();
    }

    return { success: true, currentParagraph: playbackState.currentParagraph };
  },

  /**
   * Legacy fallback: Previous paragraph.
   */
  previousParagraph: async () => {
    if (playbackState.currentParagraph <= 0) {
      return { success: false, error: 'Already at first paragraph' };
    }

    stopCurrentAudio();
    playbackState.currentParagraph--;
    playbackState.progress = (playbackState.currentParagraph / paragraphs.length) * 100;
    notifyPopup();

    if (playbackState.status === 'playing') {
      speakCurrentParagraph();
    }

    return { success: true, currentParagraph: playbackState.currentParagraph };
  },

  /**
   * Legacy fallback: Get playback state.
   */
  getPlaybackState: async () => {
    return playbackState;
  },

  /**
   * Legacy fallback: Update settings.
   */
  updateSettings: async (data) => {
    if (typeof data.speed === 'number') {
      playbackState.speed = data.speed;
      if (currentAudio) {
        currentAudio.playbackRate = data.speed;
      }
    }
    if (typeof data.provider === 'string') {
      playbackState.provider = data.provider;
    }
    if (typeof data.voice === 'string') {
      playbackState.voice = data.voice;
    }
    return { success: true };
  },

  /**
   * Legacy fallback: Seek to paragraph.
   */
  seekToPosition: async (data) => {
    const progress = data.progress as number;
    if (typeof progress !== 'number' || progress < 0 || progress > 100) {
      return { success: false, error: 'Invalid progress value' };
    }

    const targetIndex = Math.floor((progress / 100) * paragraphs.length);
    if (targetIndex >= 0 && targetIndex < paragraphs.length) {
      stopCurrentAudio();
      playbackState.currentParagraph = targetIndex;
      playbackState.progress = progress;
      notifyPopup();

      if (playbackState.status === 'playing') {
        speakCurrentParagraph();
      }
    }

    return { success: true };
  },

  /**
   * Legacy fallback: Jump to paragraph.
   */
  jumpToParagraph: async (data) => {
    const index = data.index as number;
    if (typeof index !== 'number' || index < 0 || index >= paragraphs.length) {
      return { success: false, error: 'Invalid paragraph index' };
    }

    stopCurrentAudio();
    playbackState.currentParagraph = index;
    playbackState.progress = (index / paragraphs.length) * 100;
    notifyPopup();

    if (playbackState.status === 'playing') {
      speakCurrentParagraph();
    }

    return { success: true };
  },

  // Roadmap Feature Handlers - These are domain handlers that haven't been
  // migrated to hexagonal yet. They use their own modular pattern.
  // Export handlers
  ...Object.fromEntries(
    Object.entries(exportHandlers).map(([key, handler]) => [
      key,
      async (data: Record<string, unknown>) => handler(data as never),
    ]),
  ),
  // Summarize handlers
  ...Object.fromEntries(
    Object.entries(summarizeHandlers).map(([key, handler]) => [
      key,
      async (data: Record<string, unknown>) => handler(data as never),
    ]),
  ),
  // OCR handlers
  ...Object.fromEntries(
    Object.entries(ocrHandlers).map(([key, handler]) => [
      key,
      async (data: Record<string, unknown>) => handler(data as never),
    ]),
  ),
  // Queue handlers
  ...Object.fromEntries(
    Object.entries(queueHandlers).map(([key, handler]) => [
      key,
      async (data: Record<string, unknown>) => handler(data as never),
    ]),
  ),
};

// ============================================
// Popup Notification
// ============================================

async function notifyPopup(): Promise<void> {
  try {
    await browser.runtime.sendMessage({
      type: 'playbackStateUpdate',
      state: playbackState,
    });
  } catch {
    // Popup might be closed, ignore
  }
}

// ============================================
// Main Background Script
// ============================================

export default defineBackground(() => {
  console.log('VoxPage background service worker started');

  // Initialize hexagonal architecture (034-hexagonal-architecture)
  initHexagonalArchitecture()
    .then(() => {
      hexagonalInitialized = true;
      console.log('[Background] Hexagonal architecture initialized');
    })
    .catch((error) => {
      console.error('[Background] Failed to initialize hexagonal architecture:', error);
    });

  // Load migration flags from storage
  loadMigrationFlags();

  // T021: Initialize audio cache on extension startup
  const cacheStore = getCacheStore();
  cacheStore
    .init()
    .then(() => {
      console.log(
        '[Background] Audio cache initialized, mode:',
        cacheStore.isInMemoryMode ? 'in-memory' : 'IndexedDB',
      );
      const stats = cacheStore.getStats();
      console.log('[Background] Cache stats:', {
        entries: stats.entries,
        size: stats.totalSize,
        hitRate: stats.hitRate,
      });
    })
    .catch((error) => {
      console.error('[Background] Failed to initialize audio cache:', error);
    });

  /**
   * Strangler Fig dispatch: Try hexagonal handler first, fall back to legacy.
   * Returns the response, or null if neither handler exists.
   */
  async function dispatchMessage(type: string, data: Record<string, unknown>): Promise<unknown> {
    const startTime = Date.now();

    // Check if we have a hexagonal mapping for this message type
    const hexType = LEGACY_TO_HEXAGONAL_MAP[type] ?? type;

    // Check feature flags - if legacy is forced, skip hex
    if (!shouldUseLegacy(type) && hexagonalInitialized) {
      // Try hexagonal handler first
      const hexResult = await dispatchToHexagonal(hexType, data);
      if (hexResult !== null) {
        return hexResult;
      }
    }

    // Fall back to legacy handler
    const handler = messageHandlers[type];
    if (handler) {
      const result = await handler(data);
      const durationMs = Date.now() - startTime;
      logLegacyDispatch(type, durationMs, true);
      return result;
    }

    return null;
  }

  // Set up message listener with Strangler Fig dispatch
  browser.runtime.onMessage.addListener((message, _sender) => {
    // Handle messages with 'type' field (from popup)
    if (message && typeof message === 'object' && 'type' in message) {
      const { type, ...data } = message as { type: string; [key: string]: unknown };

      // Skip internal messages like playbackStateUpdate
      if (type === 'playbackStateUpdate') {
        return;
      }

      console.log('[Background] Received message:', type);

      return dispatchMessage(type, data).then((result) => {
        if (result === null) {
          console.warn('[Background] Unknown message type:', type);
          return { error: 'Unknown message type' };
        }
        return result;
      });
    }

    // Handle messages with 'action' field (legacy format from content script)
    if (message && typeof message === 'object' && 'action' in message) {
      const { action, ...data } = message as { action: string; [key: string]: unknown };
      console.log('[Background] Received legacy action:', action);

      return dispatchMessage(action, data).then((result) => {
        if (result === null) {
          // Acknowledge unknown actions
          return { received: true };
        }
        return result;
      });
    }

    // Ignore other messages (e.g., from other extensions)
    return;
  });

  // Initialize settings from storage
  browser.storage.local
    .get(['speed', 'provider', 'elevenlabsApiKey', 'openaiApiKey', 'groqApiKey', 'cartesiaApiKey'])
    .then((result) => {
      if (typeof result.speed === 'number') {
        playbackState.speed = result.speed;
      }
      if (typeof result.provider === 'string') {
        playbackState.provider = result.provider;
      }
      apiKeys = {
        elevenlabsApiKey: result.elevenlabsApiKey as string | undefined,
        openaiApiKey: result.openaiApiKey as string | undefined,
        groqApiKey: result.groqApiKey as string | undefined,
        cartesiaApiKey: result.cartesiaApiKey as string | undefined,
      };
      console.log('[Background] Settings loaded:', {
        speed: playbackState.speed,
        provider: playbackState.provider,
        hasElevenLabsKey: !!apiKeys.elevenlabsApiKey,
      });
    });

  console.log('VoxPage: Message handlers registered');

  // Cross-tab sync for reading queue (T075)
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    // Check if queue data changed
    if (changes[QUEUE_STORAGE_KEYS.ITEMS] || changes[QUEUE_STORAGE_KEYS.METADATA]) {
      console.log('[Background] Queue storage changed, broadcasting to tabs');

      // Broadcast to all tabs
      browser.tabs.query({}).then((tabs) => {
        const queueUpdate = {
          type: 'queue.updated',
          items: changes[QUEUE_STORAGE_KEYS.ITEMS]?.newValue,
          metadata: changes[QUEUE_STORAGE_KEYS.METADATA]?.newValue,
        };

        for (const tab of tabs) {
          if (tab.id) {
            browser.tabs.sendMessage(tab.id, queueUpdate).catch(() => {
              // Ignore tabs that can't receive messages
            });
          }
        }
      });
    }
  });

  // ============================================
  // Cache Cleanup Scheduling (028-smart-audio-cache T059)
  // ============================================

  // Run initial cleanup on startup after a short delay
  // This handles stale entries that may have accumulated
  const INITIAL_CLEANUP_DELAY_MS = 5000; // 5 seconds after startup
  const PERIODIC_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Every hour

  setTimeout(async () => {
    try {
      const store = getCacheStore();
      const result = await store.cleanup();
      if (result.entriesRemoved > 0) {
        console.log('[Background] Initial cache cleanup:', {
          entriesRemoved: result.entriesRemoved,
          bytesFreed: result.bytesFreed,
          durationMs: result.durationMs,
        });
      }
    } catch (error) {
      console.error('[Background] Initial cache cleanup failed:', error);
    }
  }, INITIAL_CLEANUP_DELAY_MS);

  // Schedule periodic cleanup (every hour)
  setInterval(async () => {
    try {
      const store = getCacheStore();

      // Run cleanup for stale entries
      const cleanupResult = await store.cleanup();
      if (cleanupResult.entriesRemoved > 0) {
        console.log('[Background] Periodic cache cleanup:', {
          staleRemoved: cleanupResult.staleEntriesRemoved,
          corruptRemoved: cleanupResult.corruptEntriesRemoved,
          bytesFreed: cleanupResult.bytesFreed,
        });
      }

      // Check if eviction is needed
      const evictionResult = await store.evictIfNeeded();
      if (evictionResult.triggered && evictionResult.entriesEvicted > 0) {
        console.log('[Background] Periodic cache eviction:', {
          entriesEvicted: evictionResult.entriesEvicted,
          bytesFreed: evictionResult.bytesFreed,
          reason: evictionResult.reason,
        });
      }
    } catch (error) {
      console.error('[Background] Periodic cache maintenance failed:', error);
    }
  }, PERIODIC_CLEANUP_INTERVAL_MS);

  console.log('[Background] Cache cleanup scheduled:', {
    initialDelay: `${INITIAL_CLEANUP_DELAY_MS / 1000}s`,
    periodicInterval: `${PERIODIC_CLEANUP_INTERVAL_MS / 1000 / 60}min`,
  });
});
