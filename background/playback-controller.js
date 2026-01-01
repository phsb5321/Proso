/**
 * Playback Controller
 * Orchestrates TTS playback flow: text processing, audio generation,
 * playback state management, and synchronization.
 *
 * @module background/playback-controller
 */

import { PlaybackStatus, ProviderId } from './constants.js';
import { audioCache } from './audio-cache.js';
import { PlaybackSyncState } from './playback-sync.js';

/**
 * PlaybackController class - orchestrates TTS playback
 */
export class PlaybackController {
  /**
   * @param {Object} deps - Dependencies
   * @param {Object} deps.providerRegistry - Provider registry instance
   * @param {Object} deps.audioGenerator - Audio generator instance
   * @param {Object} deps.uiCoordinator - UI coordinator instance
   * @param {Object} deps.groqTimestampProvider - Groq timestamp provider
   */
  constructor(deps = {}) {
    this.providerRegistry = deps.providerRegistry;
    this.audioGenerator = deps.audioGenerator;
    this.uiCoordinator = deps.uiCoordinator;
    this.groqTimestampProvider = deps.groqTimestampProvider;

    // Playback sync state for audio-text synchronization
    this.syncState = new PlaybackSyncState();

    // Playback state
    this.state = {
      status: PlaybackStatus.IDLE,
      isPlaying: false,
      isPaused: false,
      currentProvider: ProviderId.OPENAI,
      currentVoice: 'alloy',
      speed: 1.0,
      mode: 'full',
      paragraphs: [],
      currentIndex: 0,
      audioQueue: [],
      currentAudio: null,
      startTime: 0,
      totalDuration: 0,
      preGenerating: new Set(),
      lastCacheHit: false
    };

    this._setupSyncCallbacks();
  }

  /**
   * Setup sync state callbacks
   * @private
   */
  _setupSyncCallbacks() {
    // Word change callback for word-level highlighting
    this.syncState.onWordChange((paragraphIndex, wordIndex, timestamp) => {
      this.uiCoordinator?.highlightWord(this.state.currentIndex, wordIndex, timestamp);
    });

    this.syncState.onProgress((progressPercent, timeRemaining) => {
      this.uiCoordinator?.updateFloatingControllerState(this.state);
    });
  }

  /**
   * Initialize the controller
   */
  async initialize() {
    try {
      await this.providerRegistry?.initialize();
      await this.groqTimestampProvider?.initialize();
      console.log('VoxPage playback controller initialized');
    } catch (error) {
      console.error('Failed to initialize playback controller:', error);
    }
  }

  /**
   * Get current playback state
   * @returns {Object}
   */
  getState() {
    return {
      status: this.state.status,
      isPlaying: this.state.isPlaying,
      isPaused: this.state.isPaused,
      currentProvider: this.state.currentProvider,
      currentVoice: this.state.currentVoice,
      currentIndex: this.state.currentIndex,
      totalParagraphs: this.state.paragraphs.length,
      progress: {
        current: this._getCurrentProgress(),
        total: this.state.totalDuration
      }
    };
  }

  /**
   * Set the current provider
   * @param {string} providerId
   */
  setProvider(providerId) {
    if (this.providerRegistry?.hasProvider(providerId)) {
      const previousProvider = this.state.currentProvider;
      this.state.currentProvider = providerId;

      // Clear cache for the previous provider when switching
      if (previousProvider !== providerId) {
        audioCache.clearForProvider(previousProvider);
      }

      // Set default voice for the new provider
      const provider = this.providerRegistry.getProvider(providerId);
      if (provider) {
        const defaultVoice = provider.getDefaultVoice();
        if (defaultVoice) {
          this.state.currentVoice = defaultVoice.id;
        }
      }
    }
  }

  /**
   * Set the current voice
   * @param {string} voice
   */
  setVoice(voice) {
    this.state.currentVoice = voice;
  }

  /**
   * Set the playback speed
   * @param {number} speed
   */
  setSpeed(speed) {
    this.state.speed = speed;
    if (this.state.currentAudio) {
      this.state.currentAudio.playbackRate = speed;
    }
  }

  /**
   * Handle play request
   * @param {Object} message - Play message with options
   * @param {Object} tab - Tab that sent the request
   */
  async handlePlay(message, tab) {
    try {
      if (message.provider) {
        this.setProvider(message.provider);
      }
      if (message.voice) {
        this.state.currentVoice = message.voice;
      }
      if (message.speed) {
        this.state.speed = message.speed;
      }
      this.state.mode = message.mode || this.state.mode;

      // If we have direct text (from selection), use it
      if (message.text) {
        await this.processTextContent(message.text, 'selection');
        return;
      }

      // Otherwise, request text from content script
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const tab = tabs[0];

        // Check if this is a restricted page
        if (tab.url?.startsWith('about:') ||
            tab.url?.startsWith('moz-extension:') ||
            tab.url?.startsWith('chrome:') ||
            tab.url?.includes('addons.mozilla.org')) {
          this.uiCoordinator?.notifyError('Cannot read content on this page');
          return;
        }

        try {
          await browser.tabs.sendMessage(tab.id, {
            action: 'extractText',
            mode: this.state.mode
          });
        } catch (sendError) {
          console.warn('Content script not responding:', sendError.message);

          // Check if scripts are already loaded but just not ready yet
          try {
            const checkResults = await browser.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => typeof window.VoxPage !== 'undefined' && !!window.VoxPage.contentExtractor
            });

            const scriptsLoaded = checkResults?.[0]?.result;
            console.log('Scripts already loaded:', scriptsLoaded);

            if (!scriptsLoaded) {
              // Scripts not loaded, inject them
              console.log('Injecting content scripts into tab', tab.id);
              await browser.scripting.executeScript({
                target: { tabId: tab.id },
                files: [
                  'content/content-scorer.js',
                  'content/content-extractor.js',
                  'content/highlight-manager.js',
                  'content/floating-controller.js',
                  'content/index.js'
                ]
              });

              await browser.scripting.insertCSS({
                target: { tabId: tab.id },
                files: ['styles/content.css']
              });
              console.log('Scripts and CSS injected');
            }

            // Wait for scripts to initialize
            await new Promise(resolve => setTimeout(resolve, 300));

            // Retry sending the message
            console.log('Retrying message to content script');
            await browser.tabs.sendMessage(tab.id, {
              action: 'extractText',
              mode: this.state.mode
            });
            console.log('Message sent successfully');
          } catch (injectError) {
            console.error('Failed to communicate with content scripts:', injectError);
            console.error('Tab URL:', tab.url);
            this.uiCoordinator?.notifyError('Could not access page content. Try refreshing the page.');
          }
        }
      }
    } catch (error) {
      console.error('Play error:', error);
      this.uiCoordinator?.notifyError(error.message);
    }
  }

  /**
   * Process text content and start playback
   * @param {string} text - Text to read
   * @param {string} mode - Extraction mode
   */
  async processTextContent(text, mode) {
    if (!text || text.trim().length === 0) {
      this.uiCoordinator?.notifyError('No text found to read');
      return;
    }

    // Split text into paragraphs
    this.state.paragraphs = this._splitIntoParagraphs(text);
    this.state.currentIndex = 0;
    this.state.audioQueue = [];
    this.state.status = PlaybackStatus.LOADING;
    this.state.isPlaying = true;
    this.state.isPaused = false;
    this.state.startTime = Date.now();

    // Estimate total duration (rough: ~150 words per minute)
    const wordCount = text.split(/\s+/).length;
    this.state.totalDuration = (wordCount / 150) * 60;

    // Build paragraph timeline for sync
    this.syncState.buildParagraphTimeline(
      this.state.paragraphs,
      this.state.totalDuration * 1000
    );

    this.uiCoordinator?.notifyPlaybackState(this.state, true);
    this.uiCoordinator?.showFloatingController();

    await this._playCurrentParagraph();
  }

  /**
   * Handle pause
   */
  handlePause() {
    this.state.isPaused = true;
    this.state.isPlaying = false;
    this.state.status = PlaybackStatus.PAUSED;

    if (this.audioGenerator?.isBrowserTTS(this.state.currentProvider)) {
      this.audioGenerator.pauseBrowserTTS();
    } else if (this.state.currentAudio) {
      this.state.currentAudio.pause();
    }

    this.syncState.pause();
    this.uiCoordinator?.notifyPlaybackState(this.state, false);
  }

  /**
   * Handle resume
   */
  handleResume() {
    if (this.state.isPaused) {
      this.state.isPaused = false;
      this.state.isPlaying = true;
      this.state.status = PlaybackStatus.PLAYING;

      if (this.audioGenerator?.isBrowserTTS(this.state.currentProvider)) {
        this.audioGenerator.resumeBrowserTTS();
      } else if (this.state.currentAudio) {
        this.state.currentAudio.play();
      }

      this.syncState.resume();
      this.uiCoordinator?.notifyPlaybackState(this.state, true);
    }
  }

  /**
   * Handle stop
   */
  handleStop() {
    this.state.isPlaying = false;
    this.state.isPaused = false;
    this.state.currentIndex = 0;
    this.state.status = PlaybackStatus.STOPPED;

    if (this.audioGenerator?.isBrowserTTS(this.state.currentProvider)) {
      this.audioGenerator.stopBrowserTTS();
    } else if (this.state.currentAudio) {
      this.state.currentAudio.pause();
      this.state.currentAudio = null;
    }

    this.syncState.reset();
    this.uiCoordinator?.clearHighlight();
    this.uiCoordinator?.notifyPlaybackState(this.state, false);
    this.uiCoordinator?.hideFloatingController();
  }

  /**
   * Handle previous paragraph
   */
  handlePrev() {
    if (this.state.currentIndex > 0) {
      this._stopCurrentPlayback();
      this.state.currentIndex = Math.max(0, this.state.currentIndex - 1);
      this._updateProgress();

      if (this.state.isPlaying || this.state.isPaused) {
        this.state.isPlaying = true;
        this.state.isPaused = false;
        this.uiCoordinator?.notifyPlaybackState(this.state, true);
        this._playCurrentParagraph();
      }
    }
  }

  /**
   * Handle next paragraph
   */
  handleNext() {
    if (this.state.currentIndex < this.state.paragraphs.length - 1) {
      this._stopCurrentPlayback();
      this.state.currentIndex++;
      this._updateProgress();

      if (this.state.isPlaying) {
        this._playCurrentParagraph();
      }
    }
  }

  /**
   * Jump to a specific paragraph
   * @param {number} index
   */
  jumpToParagraph(index) {
    if (index >= 0 && index < this.state.paragraphs.length) {
      this._stopCurrentPlayback();
      this.state.currentIndex = index;
      this.syncState.seekToParagraph(index);
      this._updateProgress();

      if (this.state.isPlaying || this.state.isPaused) {
        this.state.isPlaying = true;
        this.state.isPaused = false;
        this.uiCoordinator?.notifyPlaybackState(this.state, true);
        this._playCurrentParagraph();
      }
    }
  }

  /**
   * Jump to a specific word within a paragraph
   * @param {number} paragraphIndex
   * @param {number} wordIndex
   */
  jumpToWord(paragraphIndex, wordIndex) {
    if (paragraphIndex !== this.state.currentIndex) {
      this.jumpToParagraph(paragraphIndex);
    }

    if (this.syncState.hasWordTiming && this.syncState.wordTimeline) {
      const wordData = this.syncState.wordTimeline[wordIndex];
      if (wordData && this.state.currentAudio) {
        this.state.currentAudio.currentTime = wordData.startTimeMs / 1000;
        this.syncState.seekTo(wordData.startTimeMs);
      }
    }
  }

  /**
   * Handle controller action from floating controller
   * @param {string} action - Action type
   * @param {Object} message - Full message
   * @param {Object} tab - Source tab
   */
  handleControllerAction(action, message, tab) {
    switch (action) {
      case 'play':
        this.handleResume();
        break;
      case 'pause':
        this.handlePause();
        break;
      case 'prev':
        this.handlePrev();
        break;
      case 'next':
        this.handleNext();
        break;
      case 'stop':
        this.handleStop();
        break;
      case 'close':
        this.uiCoordinator?.hideFloatingController(tab);
        break;
      case 'seek':
        const seekPercent = message.percent ?? message.progress;
        if (typeof seekPercent === 'number') {
          this._seekToProgress(seekPercent);
        }
        break;
      case 'positionChanged':
        // Position is persisted by the controller itself
        break;
      default:
        console.warn('VoxPage: Unknown controller action:', action);
    }
  }

  /**
   * Handle resync request from content script
   * @param {string} reason - Reason for resync
   */
  handleResyncRequest(reason) {
    if (!this.state.isPlaying || this.state.isPaused || !this.state.currentAudio) {
      return;
    }

    const resyncStart = performance.now();
    const currentTimeMs = this.state.currentAudio.currentTime * 1000;

    this.syncState.seekTo(currentTimeMs);

    if (this.syncState.hasWordTiming) {
      const wordIndex = this.syncState._binarySearchWord(currentTimeMs);
      if (wordIndex >= 0) {
        this.uiCoordinator?.highlightWord(this.state.currentIndex, wordIndex, Date.now());
      }
    }

    const resyncDuration = performance.now() - resyncStart;
    console.log(`VoxPage: Resync completed (${reason}) in ${resyncDuration.toFixed(1)}ms at ${currentTimeMs.toFixed(0)}ms`);

    if (resyncDuration > 500) {
      console.warn(`VoxPage: Resync exceeded 500ms threshold: ${resyncDuration.toFixed(1)}ms`);
    }
  }

  /**
   * Handle setting onboarding complete
   */
  async handleSetOnboardingComplete() {
    try {
      const result = await browser.storage.local.get('ui');
      const uiState = result.ui || {};
      uiState.onboardingComplete = true;
      await browser.storage.local.set({ ui: uiState });
    } catch (error) {
      console.error('Error setting onboarding complete:', error);
    }
  }

  /**
   * Play the current paragraph
   * @private
   */
  async _playCurrentParagraph() {
    if (!this.state.isPlaying || this.state.currentIndex >= this.state.paragraphs.length) {
      this.handleStop();
      return;
    }

    const text = this.state.paragraphs[this.state.currentIndex];
    this.state.status = PlaybackStatus.LOADING;

    // Reset word highlight tracking
    this.uiCoordinator?.resetWordHighlightTracking();

    try {
      // Highlight current paragraph
      this.uiCoordinator?.highlightParagraph(this.state.currentIndex, text);
      this.uiCoordinator?.notifyParagraphChanged(this.state.currentIndex, this.state.paragraphs.length);

      if (this.audioGenerator?.isBrowserTTS(this.state.currentProvider)) {
        await this.audioGenerator.playWithBrowserTTS(text, this.state.currentVoice, this.state.speed);
        this._onParagraphEnded();
      } else {
        await this._playWithTTSProvider(text);
      }
    } catch (error) {
      console.error('Playback error:', error);
      this.state.status = PlaybackStatus.ERROR;
      this.uiCoordinator?.notifyError(`Playback error: ${error.message}`);
      this.handleStop();
    }
  }

  /**
   * Play with TTS provider (non-browser)
   * @param {string} text
   * @private
   */
  async _playWithTTSProvider(text) {
    const cacheKey = audioCache.generateKey(
      this.state.currentProvider,
      this.state.currentVoice,
      text
    );

    let audioData;
    let wordTiming = null;
    const cachedSegment = audioCache.get(cacheKey);

    if (cachedSegment) {
      audioData = cachedSegment.audioData;
      wordTiming = cachedSegment.wordTiming || null;
      this.state.lastCacheHit = true;
      this.uiCoordinator?.notifyCacheHit(true);
    } else {
      const result = await this.audioGenerator.generateAudioWithTiming(
        text,
        this.state.currentProvider,
        this.state.currentVoice,
        { speed: this.state.speed }
      );

      audioData = result.audioData;
      wordTiming = result.wordTiming;
      this.state.lastCacheHit = false;
      this.uiCoordinator?.notifyCacheHit(false);

      audioCache.set(cacheKey, audioData, {
        provider: this.state.currentProvider,
        voice: this.state.currentVoice,
        text: text,
        wordTiming: wordTiming
      });
    }

    this._setupWordTimeline(wordTiming, cachedSegment);

    this.state.status = PlaybackStatus.PLAYING;

    this.state.currentAudio = this.audioGenerator.playAudio(audioData, {
      speed: this.state.speed,
      onEnded: () => this._onParagraphEnded(),
      onError: (error) => {
        this.uiCoordinator?.notifyError(error.message);
        this.handleStop();
      },
      onTimeUpdate: (audio) => this._onTimeUpdate(audio),
      onLoadedMetadata: (audio) => this._onLoadedMetadata(audio)
    });

    this.syncState.start(this.state.currentAudio);

    // Pre-generate next paragraphs
    this.audioGenerator.preGenerateNextParagraphs(
      this.state.paragraphs,
      this.state.currentIndex,
      this.state.currentProvider,
      this.state.currentVoice,
      this.state.preGenerating,
      (index) => this.uiCoordinator?.notifyPreGenerating(index)
    );
  }

  /**
   * Setup word timeline for sync
   * @param {Array|null} wordTiming
   * @param {Object|null} cachedSegment
   * @private
   */
  _setupWordTimeline(wordTiming, cachedSegment) {
    if (wordTiming && wordTiming.length > 0) {
      this.syncState.setWordTimeline(wordTiming);
      this.uiCoordinator?.sendWordTimeline(wordTiming, this.state.currentIndex);

      const source = cachedSegment?.wordTiming ? 'cached' :
        (this.groqTimestampProvider?.hasApiKey() ? 'groq' : 'native');
      this.uiCoordinator?.notifyWordSyncStatus(true, source, this.syncState.driftMs, this.syncState.isDrifting);

      console.log('VoxPage: Word timeline set with', wordTiming.length, 'words');
    } else {
      this.syncState.clearWordTimeline();
      this.uiCoordinator?.notifyWordSyncStatus(false, 'none', 0, false);
      console.log('VoxPage: No word timing available, using paragraph-only sync');
    }
  }

  /**
   * Handle paragraph ended
   * @private
   */
  _onParagraphEnded() {
    this.state.currentIndex++;
    this._updateProgress();

    if (this.state.isPlaying && !this.state.isPaused) {
      this._playCurrentParagraph();
    }
  }

  /**
   * Handle audio time update
   * @param {HTMLAudioElement} audio
   * @private
   */
  _onTimeUpdate(audio) {
    if (audio && this.syncState.hasWordTiming) {
      const currentTimeMs = audio.currentTime * 1000;
      this.uiCoordinator?.syncWordFromTime(currentTimeMs, this.syncState.wordTimeline, this.state.currentIndex);
    }
  }

  /**
   * Handle audio metadata loaded
   * @param {HTMLAudioElement} audio
   * @private
   */
  _onLoadedMetadata(audio) {
    if (audio && audio.duration) {
      const actualDurationMs = audio.duration * 1000;
      this.syncState.setCurrentParagraphDuration(actualDurationMs);
      console.log('VoxPage: Audio loaded, duration:', actualDurationMs.toFixed(0), 'ms');
    }
  }

  /**
   * Stop current audio playback
   * @private
   */
  _stopCurrentPlayback() {
    if (this.audioGenerator?.isBrowserTTS(this.state.currentProvider)) {
      this.audioGenerator.stopBrowserTTS();
    } else if (this.state.currentAudio) {
      this.state.currentAudio.pause();
      this.state.currentAudio = null;
    }
  }

  /**
   * Update progress
   * @private
   */
  _updateProgress() {
    this.uiCoordinator?.notifyProgress(this.state);
  }

  /**
   * Get current progress in seconds
   * @returns {number}
   * @private
   */
  _getCurrentProgress() {
    if (this.state.paragraphs.length === 0) return 0;
    const paragraphProgress = this.state.currentIndex / this.state.paragraphs.length;
    return paragraphProgress * this.state.totalDuration;
  }

  /**
   * Seek to a specific progress percentage
   * @param {number} progressPercent - Progress (0-100)
   * @private
   */
  _seekToProgress(progressPercent) {
    if (this.state.paragraphs.length === 0) return;

    const targetIndex = Math.floor((progressPercent / 100) * this.state.paragraphs.length);
    const clampedIndex = Math.max(0, Math.min(targetIndex, this.state.paragraphs.length - 1));

    this.jumpToParagraph(clampedIndex);
  }

  /**
   * Split text into readable paragraphs
   * @param {string} text
   * @returns {string[]}
   * @private
   */
  _splitIntoParagraphs(text) {
    const chunks = text
      .split(/\n\n+|\n(?=\s*[A-Z])/)
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .filter(p => /\w/.test(p));

    const result = [];
    for (const chunk of chunks) {
      if (chunk.length > 1000) {
        const sentences = chunk.match(/[^.!?]+[.!?]+/g) || [chunk];
        let current = '';
        for (const sentence of sentences) {
          if (current.length + sentence.length > 800) {
            if (current) result.push(current.trim());
            current = sentence;
          } else {
            current += ' ' + sentence;
          }
        }
        if (current) result.push(current.trim());
      } else {
        result.push(chunk);
      }
    }

    return result;
  }
}

/**
 * Create a playback controller instance
 * @param {Object} deps - Dependencies
 * @returns {PlaybackController}
 */
export function createPlaybackController(deps = {}) {
  return new PlaybackController(deps);
}

export default PlaybackController;
