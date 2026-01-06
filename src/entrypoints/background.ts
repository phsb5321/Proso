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

// Smart Audio Cache (028-smart-audio-cache)
import { getCacheStore, generateContentHash, generateCacheKey, estimateCost } from '../utils/cache';
import type { CachedAudioEntry, WordTimelineItem } from '../utils/cache';

// Playback Queue and Prefetch Service (028-smart-audio-cache User Story 3)
import {
  PlaybackQueue,
  PrefetchService,
  playbackQueue,
  prefetchService,
  type PrefetchedAudio as PrefetchedAudioType,
} from '../utils/playback';

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

let playbackState: PlaybackState = {
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
// Tab Communication
// ============================================

async function getActiveTab(): Promise<{ id?: number; url?: string } | null> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function sendToContentScript(tabId: number, message: Record<string, unknown>): Promise<unknown> {
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
    console.log('[Background] Generating ElevenLabs audio with timestamps, text length:', text.length);

    // Get voice - use saved preference or default
    let voiceId = playbackState.voice;
    let voiceName = 'Unknown';

    if (!voiceId) {
      const defaultVoice = provider.getDefaultVoice();
      voiceId = defaultVoice.id;
      voiceName = defaultVoice.name;
    } else {
      const voices = provider.getVoices();
      const voice = voices.find(v => v.id === voiceId);
      voiceName = voice?.name || 'Custom';
    }

    console.log('[Background] Using voice:', voiceName, voiceId);

    // Generate audio WITH timestamps for word-by-word highlighting
    const result = await provider.generateAudio(text, voiceId, {
      turbo: false,
      stability: 0.5,
      similarityBoost: 0.75,
      style: 0.5,
      withTimestamps: true,
    }) as AudioWithTiming;

    // Result is AudioWithTiming with audioData and wordTiming
    const blob = new Blob([result.audioData], { type: 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(blob);

    // Calculate duration from last word timing
    const duration = result.wordTiming.length > 0
      ? result.wordTiming[result.wordTiming.length - 1].endTimeMs / 1000
      : 0;

    console.log('[Background] ElevenLabs audio generated with', result.wordTiming.length, 'word timings, duration:', duration);

    return {
      audioUrl,
      audioData: result.audioData, // Return raw data for caching
      wordTimings: result.wordTiming,
      duration,
    };
  } catch (error) {
    console.error('[Background] ElevenLabs generation error:', error);
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

    const contentHash = generateContentHash(text);
    const cacheKey = generateCacheKey(currentPageUrl, index, contentHash, playbackState.provider, voiceId);
    return await cacheStore.has(cacheKey);
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
      console.log('[Background] Prefetched paragraph', i + 1, '- cache size:', audioPrefetchCache.size);
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
  voice: string
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

    console.log('[Background] Cache hit for paragraph', paragraphIndex, '- size:', entry.compressedSize);

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
  wordTimings: WordTiming[]
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
    const entry: Omit<CachedAudioEntry, 'cacheKey' | 'createdAt' | 'lastAccessedAt' | 'accessCount'> = {
      url,
      paragraphIndex,
      provider,
      voice,
      contentHash,
      audioData,
      compressedSize: audioData.byteLength,
      wordTimeline,
      durationMs: wordTimings.length > 0
        ? wordTimings[wordTimings.length - 1].endTimeMs
        : 0,
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
      if (currentTimeMs > timing.endTimeMs && (i + 1 >= currentWordTimings.length || currentTimeMs < currentWordTimings[i + 1].startTimeMs)) {
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

  console.log('[Background] Started word highlighting for paragraph', paragraphIndex, 'with', currentWordTimings.length, 'words');
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
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = '';
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
      console.error('[Background] Audio playback error:', event);
      currentAudio = null;
      audioResolveCallback = null;
      resolve(false);
    };

    console.log('[Background] Playing audio in background, speed:', speed);
    audio.play()
      .then(() => {
        console.log('[Background] Audio play() started successfully');
      })
      .catch((err) => {
        console.error('[Background] Audio play() failed:', err);
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

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
    console.log('[Background] Audio stopped');
  }

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
  console.log('[Background] Speaking paragraph', playbackState.currentParagraph + 1, '/', paragraphs.length);

  // Highlight the current paragraph
  await sendToContentScript(activeTabId, {
    action: 'highlight',
    index: playbackState.currentParagraph,
    text: text,
  });

  let success = false;

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
        voiceId
      );

      if (cached) {
        console.log('[Background] Using persistently cached audio for paragraph', playbackState.currentParagraph + 1);
        audioResult = cached;
      }
    }

    // Second, check modular prefetch service buffer (T048)
    if (!audioResult) {
      const prefetchedModular = prefetchService.consume(playbackState.currentParagraph);
      if (prefetchedModular) {
        console.log('[Background] Using modular prefetch buffer for paragraph', playbackState.currentParagraph + 1);
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
        console.log('[Background] Using legacy prefetch cache for paragraph', playbackState.currentParagraph + 1);
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
      console.log('[Background] Generating audio on-demand for paragraph', playbackState.currentParagraph + 1);
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
      console.log('[Background] Playing ElevenLabs audio with', audioResult.wordTimings.length, 'word timings');

      // Store word timings for highlighting
      currentWordTimings = audioResult.wordTimings;

      // Send word timeline to content script for word-by-word highlighting
      if (audioResult.wordTimings.length > 0) {
        await sendToContentScript(activeTabId, {
          action: 'setWordTimeline',
          wordTimeline: audioResult.wordTimings.map(wt => ({
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

      success = await playAudioInBackground(audioResult.audioUrl, playbackState.speed);

      // T024: Store to persistent cache after successful playback
      if (shouldStoreToCache && generatedAudioData && currentPageUrl) {
        storeToPersistentCache(
          currentPageUrl,
          playbackState.currentParagraph,
          text,
          playbackState.provider,
          voiceId,
          generatedAudioData,
          audioResult.wordTimings
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
  }

  if (!success) {
    // Clear word timings for browser TTS (no word-by-word support)
    currentWordTimings = [];

    // Fallback to browser TTS (in content script - has different autoplay behavior)
    await sendToContentScript(activeTabId, {
      action: 'speakText',
      text: text,
      speed: playbackState.speed,
    });
    // Browser TTS doesn't return when finished, so we just continue
    // TODO: Add proper callback mechanism for browser TTS
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

const messageHandlers: Record<string, MessageHandler> = {
  // Playback messages
  getPlaybackState: async () => {
    return playbackState;
  },

  startPlayback: async () => {
    const tab = await getActiveTab();
    if (!tab?.id) {
      return { success: false, error: 'No active tab' };
    }

    // Clear any previous prefetch cache
    clearPrefetchCache();

    // Store current page URL for persistent cache lookups
    currentPageUrl = tab.url ?? null;

    activeTabId = tab.id;
    playbackState.status = 'loading';
    notifyPopup();

    // Reload API keys and settings in case they changed
    const stored = await browser.storage.local.get([
      'elevenlabsApiKey',
      'openaiApiKey',
      'groqApiKey',
      'cartesiaApiKey',
      'elevenlabsVoice', // Voice preference
      'speed',
      'provider',
    ]);
    apiKeys = {
      elevenlabsApiKey: stored.elevenlabsApiKey as string | undefined,
      openaiApiKey: stored.openaiApiKey as string | undefined,
      groqApiKey: stored.groqApiKey as string | undefined,
      cartesiaApiKey: stored.cartesiaApiKey as string | undefined,
    };
    // Update playback state with saved preferences
    if (stored.elevenlabsVoice) {
      playbackState.voice = stored.elevenlabsVoice as string;
    }
    if (stored.speed) {
      playbackState.speed = stored.speed as number;
    }
    if (stored.provider) {
      playbackState.provider = stored.provider as string;
    }
    console.log('[Background] API keys loaded, elevenlabs:', !!apiKeys.elevenlabsApiKey);
    console.log('[Background] Settings loaded, voice:', playbackState.voice, 'speed:', playbackState.speed);

    // Extract text from the page
    const extractResult = await sendToContentScript(tab.id, {
      action: 'extractText',
      mode: 'article',
    });

    if (extractResult && typeof extractResult === 'object' && 'paragraphs' in extractResult) {
      const result = extractResult as { paragraphs: string[] };
      paragraphs = result.paragraphs;
      playbackState.totalParagraphs = paragraphs.length;
      playbackState.currentParagraph = 0;
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
      return { success: false, error: 'No text found on page' };
    }

    // Configure prefetch service with playback queue (T046)
    configurePrefetchService();

    // Show the footer
    await sendToContentScript(tab.id, {
      action: 'FOOTER_SHOW',
      initialState: {
        isPlaying: true,
        currentIndex: playbackState.currentParagraph,
        totalParagraphs: playbackState.totalParagraphs,
        progress: 0,
        speed: playbackState.speed,
      },
    });

    // Update state to playing
    playbackState.status = 'playing';
    notifyPopup();

    // Update footer state
    await sendToContentScript(tab.id, {
      action: 'FOOTER_STATE_UPDATE',
      status: 'playing',
      currentParagraph: playbackState.currentParagraph,
      totalParagraphs: playbackState.totalParagraphs,
      progress: 0,
      speed: playbackState.speed,
    });

    // Start speaking the first paragraph
    speakCurrentParagraph();

    return { success: true };
  },

  pausePlayback: async () => {
    playbackState.status = 'paused';
    notifyPopup();

    // Stop background audio
    stopCurrentAudio();

    if (activeTabId) {
      // Stop content script audio/speech (for browser TTS fallback)
      await sendToContentScript(activeTabId, { action: 'stopAudio' });
      await sendToContentScript(activeTabId, { action: 'stopSpeech' });
      await sendToContentScript(activeTabId, {
        action: 'FOOTER_STATE_UPDATE',
        status: 'paused',
      });
    }

    return { success: true };
  },

  resumePlayback: async () => {
    if (playbackState.status === 'paused' && activeTabId) {
      playbackState.status = 'playing';
      notifyPopup();

      await sendToContentScript(activeTabId, {
        action: 'FOOTER_STATE_UPDATE',
        status: 'playing',
      });

      // Resume speaking from current paragraph
      speakCurrentParagraph();
    }
    return { success: true };
  },

  stopPlayback: async () => {
    playbackState.status = 'stopped';
    playbackState.currentParagraph = 0;
    playbackState.progress = 0;
    paragraphs = [];
    notifyPopup();

    // Clear prefetch cache
    clearPrefetchCache();

    // Stop background audio
    stopCurrentAudio();

    if (activeTabId) {
      // Stop content script audio/speech
      await sendToContentScript(activeTabId, { action: 'stopAudio' });
      await sendToContentScript(activeTabId, { action: 'stopSpeech' });
      await sendToContentScript(activeTabId, { action: 'clearHighlight' });
      await sendToContentScript(activeTabId, { action: 'FOOTER_HIDE' });
    }

    return { success: true };
  },

  nextParagraph: async () => {
    // Stop current audio first
    stopCurrentAudio();

    if (activeTabId) {
      await sendToContentScript(activeTabId, { action: 'stopAudio' });
      await sendToContentScript(activeTabId, { action: 'stopSpeech' });
    }

    if (playbackState.totalParagraphs > 0) {
      playbackState.currentParagraph = Math.min(
        playbackState.currentParagraph + 1,
        playbackState.totalParagraphs - 1
      );
      playbackState.progress =
        (playbackState.currentParagraph / playbackState.totalParagraphs) * 100;
      notifyPopup();

      if (activeTabId) {
        await sendToContentScript(activeTabId, {
          action: 'FOOTER_STATE_UPDATE',
          currentParagraph: playbackState.currentParagraph,
          totalParagraphs: playbackState.totalParagraphs,
          progress: playbackState.progress,
        });

        // If playing, speak the new paragraph
        if (playbackState.status === 'playing') {
          speakCurrentParagraph();
        }
      }
    }
    return { success: true, currentParagraph: playbackState.currentParagraph };
  },

  previousParagraph: async () => {
    // Stop current audio first
    stopCurrentAudio();

    if (activeTabId) {
      await sendToContentScript(activeTabId, { action: 'stopAudio' });
      await sendToContentScript(activeTabId, { action: 'stopSpeech' });
    }

    playbackState.currentParagraph = Math.max(playbackState.currentParagraph - 1, 0);
    if (playbackState.totalParagraphs > 0) {
      playbackState.progress =
        (playbackState.currentParagraph / playbackState.totalParagraphs) * 100;
    }
    notifyPopup();

    if (activeTabId) {
      await sendToContentScript(activeTabId, {
        action: 'FOOTER_STATE_UPDATE',
        currentParagraph: playbackState.currentParagraph,
        totalParagraphs: playbackState.totalParagraphs,
        progress: playbackState.progress,
      });

      // If playing, speak the new paragraph
      if (playbackState.status === 'playing') {
        speakCurrentParagraph();
      }
    }

    return { success: true, currentParagraph: playbackState.currentParagraph };
  },

  seekToPosition: async (data) => {
    const progress = data.progress as number;
    playbackState.progress = progress;
    if (playbackState.totalParagraphs > 0) {
      playbackState.currentParagraph = Math.floor(
        (progress / 100) * playbackState.totalParagraphs
      );
    }
    notifyPopup();

    if (activeTabId) {
      await sendToContentScript(activeTabId, {
        action: 'FOOTER_STATE_UPDATE',
        currentParagraph: playbackState.currentParagraph,
        progress: playbackState.progress,
      });
    }

    return { success: true };
  },

  updateSettings: async (data) => {
    if (typeof data.speed === 'number') {
      playbackState.speed = data.speed;
    }
    if (typeof data.provider === 'string') {
      playbackState.provider = data.provider;
    }
    notifyPopup();

    if (activeTabId) {
      await sendToContentScript(activeTabId, {
        action: 'FOOTER_STATE_UPDATE',
        speed: playbackState.speed,
      });
    }

    return { success: true };
  },

  // Footer actions from the sticky footer
  FOOTER_ACTION: async (data) => {
    const action = data.action as string;
    console.log('[Background] Footer action:', action);

    switch (action) {
      case 'play':
        if (playbackState.status === 'paused') {
          return messageHandlers.resumePlayback({});
        } else if (playbackState.status === 'stopped') {
          return messageHandlers.startPlayback({});
        }
        break;
      case 'pause':
        return messageHandlers.pausePlayback({});
      case 'prev':
        return messageHandlers.previousParagraph({});
      case 'next':
        return messageHandlers.nextParagraph({});
      case 'stop':
      case 'close':
        return messageHandlers.stopPlayback({});
      case 'speed':
        if (typeof data.value === 'number') {
          playbackState.speed = data.value;
          notifyPopup();
        }
        break;
      case 'addToQueue':
        // T077: Add current page to queue from footer
        if (activeTabId) {
          try {
            const tab = await browser.tabs.get(activeTabId);
            if (tab.url && tab.title) {
              return await queueHandlers['queue.add']({
                url: tab.url,
                title: tab.title,
              });
            }
          } catch (err) {
            console.error('[Background] Failed to add to queue:', err);
            return { success: false, error: 'Failed to add to queue' };
          }
        }
        return { success: false, error: 'No active tab' };
    }
    return { success: true };
  },

  // Test API key validation
  testElevenLabsKey: async () => {
    console.log('[Background] Testing ElevenLabs API key...');
    const provider = await initElevenLabsProvider();
    if (!provider) {
      return { success: false, error: 'No API key configured or key is invalid' };
    }
    return { success: true, message: 'API key is valid!' };
  },

  testApiKey: async (data) => {
    const provider = data.provider as string;
    console.log('[Background] Testing API key for provider:', provider);

    if (provider === 'elevenlabs') {
      const result = await messageHandlers.testElevenLabsKey({});
      return result;
    }

    // For other providers, just check if key exists
    const stored = await browser.storage.local.get([`${provider}ApiKey`]);
    const key = stored[`${provider}ApiKey`] as string | undefined;
    if (key && key.trim().length > 0) {
      return { success: true, message: 'API key is configured (validation not implemented for this provider)' };
    }
    return { success: false, error: 'No API key configured' };
  },

  // Voice management
  getVoices: async (data) => {
    const provider = (data.provider as string) || playbackState.provider;
    console.log('[Background] Getting voices for provider:', provider);

    if (provider === 'elevenlabs') {
      const elevenlabs = await initElevenLabsProvider();
      if (elevenlabs) {
        const voices = elevenlabs.getVoices();
        return {
          success: true,
          voices: voices.map(v => ({
            id: v.id,
            name: v.name,
            language: v.language,
            gender: v.gender,
          })),
        };
      }
      return { success: false, voices: [] };
    }

    // For browser TTS, we can't easily get voices from background
    return { success: true, voices: [] };
  },

  setVoice: async (data) => {
    const voiceId = data.voiceId as string;
    console.log('[Background] Setting voice:', voiceId);

    playbackState.voice = voiceId;

    // Save to storage
    await browser.storage.local.set({ elevenlabsVoice: voiceId });

    return { success: true };
  },

  setSpeed: async (data) => {
    const speed = data.speed as number;
    console.log('[Background] Setting speed:', speed);

    playbackState.speed = speed;

    // Save to storage
    await browser.storage.local.set({ speed: speed });

    // Update current audio playback rate if playing
    if (currentAudio) {
      currentAudio.playbackRate = Math.max(0.5, Math.min(2.0, speed));
    }

    notifyPopup();
    return { success: true };
  },

  // ========== Paragraph Selection Handlers (028-smart-audio-cache) ==========

  /**
   * T035-T037: Handle paragraph click from content script
   * Starts playback from the clicked paragraph index
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
      console.error('[Background] Invalid paragraph index:', paragraphIndex, 'total:', paragraphs.length);
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
   * Get cached paragraph indices for the current page
   */
  getCachedParagraphs: async (data) => {
    const url = data.url as string;
    const provider = (data.provider as string) || playbackState.provider;
    const voice = (data.voice as string) || playbackState.voice || '';

    const cacheStore = getCacheStore();
    if (!cacheStore.isInitialized) {
      return { cachedIndices: [], totalParagraphs: paragraphs.length };
    }

    const cachedIndices = cacheStore.getCachedParagraphs(url, provider, voice);
    return { cachedIndices, totalParagraphs: paragraphs.length };
  },

  // ========== Prefetch Message Handlers (T049-T050) ==========

  'prefetch.start': async (data) => {
    const currentIndex = (data.currentIndex as number) ?? playbackState.currentParagraph;

    // Configure and start prefetching from current position
    if (paragraphs.length > 0) {
      playbackQueue.jumpTo(currentIndex);
      startPrefetching();
      const status = prefetchService.getStatus();
      return {
        success: true,
        queuedCount: status.pendingTasks,
      };
    }

    return { success: false, queuedCount: 0, error: 'No paragraphs loaded' };
  },

  'prefetch.stop': async () => {
    stopPrefetching();
    return { success: true };
  },

  'prefetch.getStatus': async () => {
    const status = prefetchService.getStatus();
    return {
      isActive: status.isActive,
      bufferSize: status.bufferSize,
      bufferedIndices: status.bufferedIndices,
      pendingTasks: status.pendingTasks,
      inProgressTasks: status.inProgressTasks,
    };
  },

  'prefetch.clearBuffer': async (data) => {
    const keepIndices = data.keepIndices as number[] | undefined;
    const previousSize = prefetchService.getStatus().bufferSize;
    prefetchService.clearBuffer(keepIndices);
    const newSize = prefetchService.getStatus().bufferSize;
    return {
      success: true,
      clearedCount: previousSize - newSize,
    };
  },

  // ========== Cost Estimation Handlers (028-smart-audio-cache T071-T072) ==========

  'cost.estimate': async (data) => {
    const url = data.url as string;
    const paragraphsData = data.paragraphs as string[];
    const provider = (data.provider as string) || playbackState.provider;
    const voice = (data.voice as string) || playbackState.voice || '';
    const startParagraph = data.startParagraph as number | undefined;
    const endParagraph = data.endParagraph as number | undefined;

    // If no paragraphs provided, return empty estimate
    if (!paragraphsData || paragraphsData.length === 0) {
      return {
        totalCharacters: 0,
        cachedCharacters: 0,
        uncachedCharacters: 0,
        provider,
        pricePerKiloChar: 0,
        estimatedCost: 0,
        actualCost: 0,
        savingsFromCache: 0,
        savingsPercentage: 0,
        paragraphCosts: [],
      };
    }

    // Use the cost estimator service
    try {
      return await estimateCost({
        url,
        paragraphs: paragraphsData,
        provider,
        voice,
        startParagraph,
        endParagraph,
      });
    } catch (error) {
      console.error('[Background] Cost estimation error:', error);
      return {
        totalCharacters: 0,
        cachedCharacters: 0,
        uncachedCharacters: 0,
        provider,
        pricePerKiloChar: 0,
        estimatedCost: 0,
        actualCost: 0,
        savingsFromCache: 0,
        savingsPercentage: 0,
        paragraphCosts: [],
      };
    }
  },

  // ========== Roadmap Feature Handlers (023-feature-roadmap) ==========
  // Export handlers
  ...Object.fromEntries(
    Object.entries(exportHandlers).map(([key, handler]) => [
      key,
      async (data: Record<string, unknown>) => handler(data as never),
    ])
  ),
  // Summarize handlers
  ...Object.fromEntries(
    Object.entries(summarizeHandlers).map(([key, handler]) => [
      key,
      async (data: Record<string, unknown>) => handler(data as never),
    ])
  ),
  // OCR handlers
  ...Object.fromEntries(
    Object.entries(ocrHandlers).map(([key, handler]) => [
      key,
      async (data: Record<string, unknown>) => handler(data as never),
    ])
  ),
  // Queue handlers
  ...Object.fromEntries(
    Object.entries(queueHandlers).map(([key, handler]) => [
      key,
      async (data: Record<string, unknown>) => handler(data as never),
    ])
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

  // T021: Initialize audio cache on extension startup
  const cacheStore = getCacheStore();
  cacheStore.init().then(() => {
    console.log('[Background] Audio cache initialized, mode:', cacheStore.isInMemoryMode ? 'in-memory' : 'IndexedDB');
    const stats = cacheStore.getStats();
    console.log('[Background] Cache stats:', { entries: stats.entries, size: stats.totalSize, hitRate: stats.hitRate });
  }).catch((error) => {
    console.error('[Background] Failed to initialize audio cache:', error);
  });

  // Set up message listener
  browser.runtime.onMessage.addListener((message, _sender) => {
    // Handle messages with 'type' field (from popup)
    if (message && typeof message === 'object' && 'type' in message) {
      const { type, ...data } = message as { type: string; [key: string]: unknown };

      // Skip internal messages like playbackStateUpdate
      if (type === 'playbackStateUpdate') {
        return;
      }

      console.log('[Background] Received message:', type);

      const handler = messageHandlers[type];
      if (handler) {
        return handler(data);
      }

      console.warn('[Background] Unknown message type:', type);
      return Promise.resolve({ error: 'Unknown message type' });
    }

    // Handle messages with 'action' field (legacy format from content script)
    if (message && typeof message === 'object' && 'action' in message) {
      const { action, ...data } = message as { action: string; [key: string]: unknown };
      console.log('[Background] Received legacy action:', action);

      // Check if we have a handler for this action
      const handler = messageHandlers[action];
      if (handler) {
        return handler(data);
      }

      // Acknowledge unknown actions
      return Promise.resolve({ received: true });
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
