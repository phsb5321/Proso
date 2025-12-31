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

import { MessageType } from './constants.js';

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
    playbackController?.handlePlay(msg, sender.tab);
  });

  router.register('pause', () => {
    playbackController?.handlePause();
  });

  router.register('resume', () => {
    playbackController?.handleResume();
  });

  router.register('stop', () => {
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
    playbackController?.processTextContent(msg.text, msg.mode);
  });

  router.register('jumpToParagraph', (msg) => {
    playbackController?.jumpToParagraph(msg.index);
  });

  router.register('jumpToWord', (msg) => {
    playbackController?.jumpToWord(msg.paragraphIndex, msg.wordIndex);
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

  return router;
}

export default MessageRouter;
