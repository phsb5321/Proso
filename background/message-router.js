/**
 * Message Router
 * Centralized message handling for the background service worker.
 * Routes incoming messages from popup and content scripts to appropriate handlers.
 *
 * ## Message Types
 *
 * ### Playback Control (from popup/content → background)
 * - `play` - Start playback with optional provider/voice/speed/mode/text
 * - `pause` - Pause current playback
 * - `resume` - Resume paused playback
 * - `stop` - Stop playback and reset state
 * - `prev` - Go to previous paragraph
 * - `next` - Go to next paragraph
 *
 * ### Settings (from popup/options → background)
 * - `setProvider` - Change TTS provider (openai/elevenlabs/cartesia/groq/browser)
 * - `setVoice` - Change voice for current provider
 * - `setSpeed` - Change playback speed (0.5-2.0)
 *
 * ### State Queries (from popup → background, returns response)
 * - `getState` - Get current playback state (status, progress, settings)
 * - `getProviders` - Get list of available TTS providers and voices
 *
 * ### Content Script → Background
 * - `textContent` - Extracted text content from page (response to extractText)
 * - `jumpToParagraph` - User clicked on a paragraph in the page
 * - `jumpToWord` - User clicked on a specific word
 * - `controllerAction` - Action from floating controller (play/pause/seek/close)
 * - `visibilityChanged` - Tab visibility changed (for resync)
 * - `requestResync` - Request sync state refresh (tab became visible)
 *
 * ### Visualizer (from popup → background)
 * - `getVisualizerData` - Get audio visualization data
 * - `initVisualizer` - Initialize the audio visualizer
 *
 * ### Onboarding
 * - `setOnboardingComplete` - Mark onboarding as completed
 *
 * ## Message Flow
 *
 * ```
 * Popup/Content → message-router.route() → handler → playbackController/uiCoordinator
 *                                                   ↓
 *                                            uiCoordinator sends updates
 *                                                   ↓
 *                                            Content script receives highlight/state
 * ```
 *
 * @module background/message-router
 * @see background/constants.js - MessageType enum
 * @see background/playback-controller.js - Handles playback operations
 * @see background/ui-coordinator.js - Handles UI notifications
 */

import { FooterMessageTypes, FooterActions, StorageKey, LanguageMessageTypes } from './constants.js';
import { getLogger } from './remote-logger.js';
import { footerStateDefaults } from '../shared/config/defaults.js';
import {
  detectLanguage,
  getLanguageState,
  setLanguageOverride,
  clearLanguageOverride,
  storeDetectedLanguage
} from './language-detector.js';
import { getProvidersForLanguage, getLanguageDisplayName, getAllLanguages } from './language-mappings.js';

/**
 * Message handler function type
 * @typedef {function(Object, Object, function): (boolean|void)} MessageHandler
 */

/**
 * MessageRouter class - registry-based message routing
 */
export class MessageRouter {
  constructor() {
    /** @type {Map<string, MessageHandler>} */
    this.handlers = new Map();
  }

  /**
   * Register a handler for a message type
   * @param {string} type - Message type to handle
   * @param {MessageHandler} handler - Handler function
   * @returns {MessageRouter} - For chaining
   */
  register(type, handler) {
    this.handlers.set(type, handler);
    return this;
  }

  /**
   * Route a message to its handler
   * @param {Object} message - The message object
   * @param {Object} sender - Message sender info
   * @param {function} sendResponse - Response callback
   * @returns {boolean|void} - True if async response expected
   */
  route(message, sender, sendResponse) {
    const type = message.action || message.type;
    const handler = this.handlers.get(type);

    if (handler) {
      return handler(message, sender, sendResponse);
    }

    // Return undefined if no handler found (message not handled)
    return undefined;
  }

  /**
   * Check if a handler exists for a message type
   * @param {string} type - Message type
   * @returns {boolean}
   */
  hasHandler(type) {
    return this.handlers.has(type);
  }

  /**
   * Get all registered message types
   * @returns {string[]}
   */
  getRegisteredTypes() {
    return Array.from(this.handlers.keys());
  }
}

/**
 * Create a configured message router with all handlers registered.
 *
 * Handlers are organized into categories:
 * - **Playback Control**: play, pause, resume, stop, prev, next
 * - **Settings**: setProvider, setVoice, setSpeed
 * - **State Queries**: getState, getProviders (async - return true)
 * - **Content**: textContent, jumpToParagraph, jumpToWord
 * - **Controller**: controllerAction (from floating controller)
 * - **Sync**: visibilityChanged, requestResync
 * - **Visualizer**: getVisualizerData, initVisualizer (async)
 * - **Onboarding**: setOnboardingComplete (async)
 *
 * @param {Object} deps - Dependencies for handlers (injected for testability)
 * @param {PlaybackController} deps.playbackController - Handles playback operations
 * @param {ProviderRegistry} deps.providerRegistry - Manages TTS provider instances
 * @param {Object} deps.visualizer - Audio visualization functions
 * @returns {MessageRouter} Configured router ready to handle messages
 *
 * @example
 * // In background/index.js:
 * const router = createRouter({
 *   playbackController,
 *   providerRegistry,
 *   visualizer
 * });
 * browser.runtime.onMessage.addListener((msg, sender, respond) =>
 *   router.route(msg, sender, respond)
 * );
 */
export function createRouter(deps = {}) {
  const router = new MessageRouter();
  const {
    playbackController,
    providerRegistry,
    visualizer
  } = deps;

  // Playback control handlers (6 types)
  router.register('play', (msg, sender) => {
    getLogger().info('Playback requested', 'background', {
      mode: msg.mode,
      provider: msg.provider,
      hasText: !!msg.text,
    });
    playbackController?.handlePlay(msg, sender.tab);
  });

  router.register('pause', () => {
    playbackController?.handlePause();
  });

  router.register('resume', () => {
    playbackController?.handleResume();
  });

  router.register('stop', () => {
    getLogger().debug('Playback stopped', 'background');
    playbackController?.handleStop();
  });

  router.register('prev', () => {
    playbackController?.handlePrev();
  });

  router.register('next', () => {
    playbackController?.handleNext();
  });

  // Settings handlers (3 types)
  router.register('setProvider', (msg) => {
    getLogger().info('Provider changed', 'background', { provider: msg.provider });
    playbackController?.setProvider(msg.provider);
  });

  router.register('setVoice', (msg) => {
    playbackController?.setVoice(msg.voice);
  });

  router.register('setSpeed', (msg) => {
    playbackController?.setSpeed(msg.speed);
  });

  // State query handlers (2 types - async, return true)
  router.register('getState', (msg, sender, sendResponse) => {
    const state = playbackController?.getState();
    sendResponse(state);
    return true;
  });

  router.register('getProviders', (msg, sender, sendResponse) => {
    sendResponse(providerRegistry?.getProviderInfo());
    return true;
  });

  // Content handlers (3 types - from content script)
  router.register('textContent', (msg) => {
    // Pass paragraphs array for accurate TTS-to-DOM index synchronization
    playbackController?.processTextContent(msg.text, msg.mode, msg.paragraphs);
  });

  router.register('jumpToParagraph', (msg) => {
    playbackController?.jumpToParagraph(msg.index);
  });

  router.register('jumpToWord', (msg) => {
    playbackController?.jumpToWord(msg.paragraphIndex, msg.wordIndex);
  });

  // Play from a specific paragraph (from paragraph selector)
  router.register('playFromParagraph', (msg, sender) => {
    playbackController?.playFromParagraph(msg.index, sender.tab);
  });

  // Onboarding (1 type - async)
  router.register('setOnboardingComplete', (msg, sender, sendResponse) => {
    playbackController?.handleSetOnboardingComplete();
    sendResponse({ success: true });
    return true;
  });

  // Visualizer handlers (2 types - async)
  router.register('getVisualizerData', (msg, sender, sendResponse) => {
    sendResponse(visualizer?.getVisualizerData());
    return true;
  });

  router.register('initVisualizer', (msg, sender, sendResponse) => {
    const success = visualizer?.initializeVisualizer();
    sendResponse({ success, ready: visualizer?.isVisualizerReady() });
    return true;
  });

  // Controller actions (1 type - from floating controller)
  router.register('controllerAction', (msg, sender) => {
    playbackController?.handleControllerAction(msg.controllerAction, msg, sender.tab);
  });

  // Visibility/resync handlers (2 types - for audio-text sync recovery)
  router.register('visibilityChanged', (msg) => {
    if (msg.visible) {
      playbackController?.handleResyncRequest('tab-visible');
    }
  });

  router.register('requestResync', (msg) => {
    const reason = msg.reason || msg.payload?.reason || 'unknown';
    playbackController?.handleResyncRequest(reason);
  });

  // Lifecycle handlers (011-highlight-playback-fix)
  router.register('stopPlayback', (msg, sender, sendResponse) => {
    const reason = msg.reason || 'unknown';
    console.log(`VoxPage: Stopping playback (reason: ${reason})`);
    playbackController?.handleStop();
    sendResponse({ success: true });
    return true;
  });

  // Scroll coordination handlers (011-highlight-playback-fix)
  router.register('highlightWithScroll', (msg) => {
    const { index, text, timestamp, scrollBehavior } = msg;
    playbackController?.uiCoordinator?.highlightParagraph(index, text, timestamp);
    // Scroll is handled by content script with scroll-margin CSS
  });

  router.register('reportScrollState', (msg) => {
    // User scrolled manually - could be used for analytics or pause auto-scroll coordination
    const { userScrolledAt } = msg;
    console.log(`VoxPage: User scrolled at ${userScrolledAt}`);
  });

  // Remote logging handlers (014-loki-remote-logging)
  router.register('testLoggingConnection', async (msg, sender, sendResponse) => {
    try {
      const logger = getLogger();
      const result = await logger.testConnection(msg.config);
      sendResponse(result);
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  });

  router.register('getLogs', (msg, sender, sendResponse) => {
    try {
      const logger = getLogger();
      const result = logger.getLogs();
      sendResponse(result);
    } catch (error) {
      sendResponse({ logs: [], status: { error: error.message } });
    }
    return true;
  });

  router.register('clearLogs', (msg, sender, sendResponse) => {
    try {
      const logger = getLogger();
      logger.clearLogs();
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  });

  router.register('flushLogs', async (msg, sender, sendResponse) => {
    try {
      const logger = getLogger();
      await logger.flush();
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  });

  // =========================================
  // Footer message handlers (018-ui-redesign)
  // =========================================

  // T018: FOOTER_SHOW - Instructs content script to show the footer
  router.register(FooterMessageTypes.FOOTER_SHOW, async (msg, sender, sendResponse) => {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        // Get saved footer state from storage
        const result = await browser.storage.local.get(StorageKey.FOOTER_STATE);
        const footerState = result[StorageKey.FOOTER_STATE] || { ...footerStateDefaults };

        await browser.tabs.sendMessage(tabs[0].id, {
          action: FooterMessageTypes.FOOTER_SHOW,
          initialState: {
            isMinimized: footerState.isMinimized,
            position: footerState.position
          }
        });

        getLogger().debug('Footer shown', 'background');
        sendResponse?.({ success: true });
      }
    } catch (error) {
      getLogger().error('Failed to show footer', 'background', { error: error.message });
      sendResponse?.({ success: false, error: error.message });
    }
    return true;
  });

  // T019: FOOTER_HIDE - Instructs content script to hide the footer
  router.register(FooterMessageTypes.FOOTER_HIDE, async (msg, sender, sendResponse) => {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        await browser.tabs.sendMessage(tabs[0].id, {
          action: FooterMessageTypes.FOOTER_HIDE
        });
        getLogger().debug('Footer hidden', 'background');
        sendResponse?.({ success: true });
      }
    } catch (error) {
      getLogger().error('Failed to hide footer', 'background', { error: error.message });
      sendResponse?.({ success: false, error: error.message });
    }
    return true;
  });

  // T020: FOOTER_ACTION - Handle footer control actions
  router.register(FooterMessageTypes.FOOTER_ACTION, (msg, sender) => {
    const { action, value } = msg;

    switch (action) {
      case FooterActions.PLAY:
        playbackController?.handleResume();
        break;
      case FooterActions.PAUSE:
        playbackController?.handlePause();
        break;
      case FooterActions.STOP:
        playbackController?.handleStop();
        break;
      case FooterActions.NEXT:
        playbackController?.handleNext();
        break;
      case FooterActions.PREV:
        playbackController?.handlePrev();
        break;
      case FooterActions.SEEK:
        if (typeof value === 'number' && value >= 0 && value <= 100) {
          playbackController?.jumpToParagraph(
            Math.floor((value / 100) * (playbackController.state.paragraphs.length || 1))
          );
        }
        break;
      case FooterActions.SPEED:
        if (typeof value === 'number' && value >= 0.5 && value <= 2.0) {
          playbackController?.setSpeed(value);
        }
        break;
      case FooterActions.CLOSE:
        playbackController?.handleStop();
        break;
      case FooterActions.MINIMIZE:
      case FooterActions.EXPAND:
        // Visibility state handled by FOOTER_VISIBILITY_CHANGED
        break;
      default:
        getLogger().warn('Unknown footer action', 'background', { action });
    }
  });

  // T021: FOOTER_STATE_UPDATE - Send state updates to content script
  router.register(FooterMessageTypes.FOOTER_STATE_UPDATE, async (msg, sender, sendResponse) => {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        await browser.tabs.sendMessage(tabs[0].id, {
          action: FooterMessageTypes.FOOTER_STATE_UPDATE,
          ...msg.payload
        });
        sendResponse?.({ success: true });
      }
    } catch (error) {
      sendResponse?.({ success: false, error: error.message });
    }
    return true;
  });

  // T022: FOOTER_POSITION_CHANGED - Persist footer position
  router.register(FooterMessageTypes.FOOTER_POSITION_CHANGED, async (msg, sender, sendResponse) => {
    try {
      const { position } = msg;
      const result = await browser.storage.local.get(StorageKey.FOOTER_STATE);
      const footerState = result[StorageKey.FOOTER_STATE] || { ...footerStateDefaults };

      footerState.position = position;
      await browser.storage.local.set({ [StorageKey.FOOTER_STATE]: footerState });

      getLogger().debug('Footer position saved', 'background', { position });
      sendResponse?.({ success: true });
    } catch (error) {
      getLogger().error('Failed to save footer position', 'background', { error: error.message });
      sendResponse?.({ success: false, error: error.message });
    }
    return true;
  });

  // T023: FOOTER_VISIBILITY_CHANGED - Handle minimize/expand state
  router.register(FooterMessageTypes.FOOTER_VISIBILITY_CHANGED, async (msg, sender, sendResponse) => {
    try {
      const { isMinimized } = msg;
      const result = await browser.storage.local.get(StorageKey.FOOTER_STATE);
      const footerState = result[StorageKey.FOOTER_STATE] || { ...footerStateDefaults };

      footerState.isMinimized = isMinimized;
      await browser.storage.local.set({ [StorageKey.FOOTER_STATE]: footerState });

      getLogger().debug('Footer visibility changed', 'background', { isMinimized });
      sendResponse?.({ success: true });
    } catch (error) {
      getLogger().error('Failed to save footer visibility', 'background', { error: error.message });
      sendResponse?.({ success: false, error: error.message });
    }
    return true;
  });

  // T024: SHOW_FOOTER - Request from popup to show footer on active tab
  router.register(FooterMessageTypes.SHOW_FOOTER, async (msg, sender, sendResponse) => {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        sendResponse({ success: false, error: 'No active tab' });
        return true;
      }

      // Get saved footer state
      const result = await browser.storage.local.get(StorageKey.FOOTER_STATE);
      const footerState = result[StorageKey.FOOTER_STATE] || { ...footerStateDefaults };

      // Send show message to content script
      await browser.tabs.sendMessage(tabs[0].id, {
        action: FooterMessageTypes.FOOTER_SHOW,
        initialState: {
          isMinimized: footerState.isMinimized,
          position: footerState.position
        }
      });

      sendResponse({ success: true });
    } catch (error) {
      getLogger().error('Failed to show footer from popup', 'background', { error: error.message });
      sendResponse({ success: false, error: error.message });
    }
    return true;
  });

  // T025: GET_PLAYBACK_STATUS - Return current playback status for popup
  router.register(FooterMessageTypes.GET_PLAYBACK_STATUS, (msg, sender, sendResponse) => {
    const state = playbackController?.getState() || {};
    sendResponse({
      status: state.status || 'stopped',
      currentParagraph: state.currentIndex !== undefined ? state.currentIndex + 1 : undefined,
      totalParagraphs: state.totalParagraphs,
      provider: state.currentProvider
    });
    return true;
  });

  // =========================================
  // Language detection handlers (019-multilingual-tts)
  // =========================================

  // LANGUAGE_DETECTED - Content script detected page language
  router.register(LanguageMessageTypes.LANGUAGE_DETECTED, async (msg, sender, sendResponse) => {
    try {
      const { metadata, textSample, url } = msg.payload || msg;

      // Run detection
      const detected = await detectLanguage({ metadata, textSample, url });

      // Store the result
      await storeDetectedLanguage(detected);

      // Get compatible providers
      const compatibleProviders = getProvidersForLanguage(detected.primaryCode);

      // Log the detection
      getLogger().info('Language detected', 'background', {
        code: detected.code,
        confidence: detected.confidence,
        source: detected.source,
        url
      });

      // Check if current provider supports this language
      const state = playbackController?.getState() || {};
      const currentProvider = state.currentProvider || 'browser';
      const providerSupported = compatibleProviders.includes(currentProvider);

      // Broadcast language state update to all listeners
      const languageState = {
        detected,
        override: null,
        effective: detected.primaryCode,
        providerSupported,
        compatibleProviders
      };

      // Send to popup if open
      try {
        browser.runtime.sendMessage({
          type: LanguageMessageTypes.LANGUAGE_STATE_UPDATE,
          payload: languageState
        });
      } catch {
        // Popup may not be open
      }

      sendResponse?.({ success: true, detected });
    } catch (error) {
      getLogger().error('Language detection failed', 'background', { error: error.message });
      sendResponse?.({ success: false, error: error.message });
    }
    return true;
  });

  // REQUEST_LANGUAGE_DETECTION - Request re-detection
  router.register(LanguageMessageTypes.REQUEST_LANGUAGE_DETECTION, async (msg, sender, sendResponse) => {
    try {
      // Ask content script to extract and send language info
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        await browser.tabs.sendMessage(tabs[0].id, {
          action: 'extractLanguage',
          forceRefresh: msg.payload?.forceRefresh || false
        });
      }
      sendResponse?.({ success: true });
    } catch (error) {
      sendResponse?.({ success: false, error: error.message });
    }
    return true;
  });

  // GET_LANGUAGE_STATE - Get current language state for popup
  router.register(LanguageMessageTypes.GET_LANGUAGE_STATE, async (msg, sender, sendResponse) => {
    try {
      const tabId = sender.tab?.id;
      const state = await getLanguageState(tabId);

      // Get compatible providers for effective language
      const compatibleProviders = getProvidersForLanguage(state.effective);

      // Check if current provider supports this language
      const playbackState = playbackController?.getState() || {};
      const currentProvider = playbackState.currentProvider || 'browser';
      const providerSupported = compatibleProviders.includes(currentProvider);

      sendResponse({
        ...state,
        providerSupported,
        compatibleProviders,
        availableLanguages: getAllLanguages()
      });
    } catch (error) {
      getLogger().error('Failed to get language state', 'background', { error: error.message });
      sendResponse({ error: error.message });
    }
    return true;
  });

  // SET_LANGUAGE_OVERRIDE - User sets manual language override
  router.register(LanguageMessageTypes.SET_LANGUAGE_OVERRIDE, async (msg, sender, sendResponse) => {
    try {
      const { languageCode } = msg.payload || msg;
      await setLanguageOverride(languageCode);

      getLogger().info('Language override set', 'background', { languageCode });

      // Broadcast update
      const state = await getLanguageState(sender.tab?.id);
      const compatibleProviders = getProvidersForLanguage(state.effective);

      browser.runtime.sendMessage({
        type: LanguageMessageTypes.LANGUAGE_STATE_UPDATE,
        payload: {
          ...state,
          compatibleProviders,
          providerSupported: compatibleProviders.includes(
            playbackController?.getState()?.currentProvider || 'browser'
          )
        }
      }).catch(() => {});

      sendResponse?.({ success: true });
    } catch (error) {
      sendResponse?.({ success: false, error: error.message });
    }
    return true;
  });

  // CLEAR_LANGUAGE_OVERRIDE - User clears override (back to auto-detect)
  router.register(LanguageMessageTypes.CLEAR_LANGUAGE_OVERRIDE, async (msg, sender, sendResponse) => {
    try {
      await clearLanguageOverride();

      getLogger().info('Language override cleared', 'background');

      // Broadcast update
      const state = await getLanguageState(sender.tab?.id);
      const compatibleProviders = getProvidersForLanguage(state.effective);

      browser.runtime.sendMessage({
        type: LanguageMessageTypes.LANGUAGE_STATE_UPDATE,
        payload: {
          ...state,
          compatibleProviders,
          providerSupported: compatibleProviders.includes(
            playbackController?.getState()?.currentProvider || 'browser'
          )
        }
      }).catch(() => {});

      sendResponse?.({ success: true });
    } catch (error) {
      sendResponse?.({ success: false, error: error.message });
    }
    return true;
  });

  // LANGUAGE_NOT_SUPPORTED - Notify when language is not supported by provider
  router.register(LanguageMessageTypes.LANGUAGE_NOT_SUPPORTED, async (msg, sender, sendResponse) => {
    const { requestedLanguage, currentProvider } = msg.payload || msg;
    const compatibleProviders = getProvidersForLanguage(requestedLanguage);

    getLogger().warn('Language not supported', 'background', {
      language: requestedLanguage,
      provider: currentProvider,
      alternatives: compatibleProviders
    });

    // Forward to popup for user notification
    try {
      browser.runtime.sendMessage({
        type: LanguageMessageTypes.LANGUAGE_NOT_SUPPORTED,
        payload: {
          requestedLanguage,
          currentProvider,
          compatibleProviders,
          languageDisplayName: getLanguageDisplayName(requestedLanguage)
        }
      });
    } catch {
      // Popup may not be open
    }

    sendResponse?.({ success: true });
    return true;
  });

  return router;
}

export default MessageRouter;
