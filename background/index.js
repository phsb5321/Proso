/**
 * VoxPage Background Service Worker - Entry Point
 * Initializes all modules and registers browser event listeners.
 *
 * @module background/index
 */

import { providerRegistry } from './provider-registry.js';
import { MessageType, StorageKey } from './constants.js';
import { groqTimestampProvider } from './providers/groq-timestamp-provider.js';
import { getVisualizerData, initializeVisualizer, isVisualizerReady } from './audio-visualizer.js';
import { createRouter } from './message-router.js';
import { createUICoordinator } from './ui-coordinator.js';
import { createAudioGenerator } from './audio-generator.js';
import { createPlaybackController } from './playback-controller.js';
import { settingsStore } from '../shared/config/store.js';
import { initializeLogger, getLogger } from './remote-logger.js';
import { footerStateDefaults } from '../shared/config/defaults.js';
// T034: Language navigation listener (019-multilingual-tts)
import { setupNavigationListener } from './language-detector.js';

// Create module instances with dependency injection
const uiCoordinator = createUICoordinator();

const audioGenerator = createAudioGenerator({
  providerRegistry,
  groqTimestampProvider
});

const playbackController = createPlaybackController({
  providerRegistry,
  audioGenerator,
  uiCoordinator,
  groqTimestampProvider
});

// Create message router with all dependencies
const router = createRouter({
  playbackController,
  providerRegistry,
  visualizer: {
    getVisualizerData,
    initializeVisualizer,
    isVisualizerReady
  }
});

/**
 * Initialize the background worker
 */
async function initialize() {
  try {
    // Load settings and run migrations FIRST (SSOT pattern)
    const settings = await settingsStore.load();
    console.log('VoxPage: Settings loaded, mode:', settings.mode);

    // Apply loaded settings to playback controller
    if (settings.mode) {
      playbackController.state.mode = settings.mode;
    }
    if (settings.provider) {
      playbackController.state.currentProvider = settings.provider;
    }
    if (settings.speed) {
      playbackController.state.speed = settings.speed;
    }

    // T029: Load footer state from storage (018-ui-redesign)
    const footerStateResult = await browser.storage.local.get(StorageKey.FOOTER_STATE);
    if (!footerStateResult[StorageKey.FOOTER_STATE]) {
      // Initialize footer state with defaults
      await browser.storage.local.set({
        [StorageKey.FOOTER_STATE]: { ...footerStateDefaults }
      });
      console.log('VoxPage: Footer state initialized with defaults');
    }

    await playbackController.initialize();

    // Initialize remote logger (lazy, does not block startup)
    // Feature is opt-in and disabled by default (014-loki-remote-logging)
    initializeLogger().then(logger => {
      logger.info('VoxPage background service worker initialized', 'background');
    }).catch(err => {
      console.warn('VoxPage: Remote logger initialization failed (non-fatal)', err.message);
    });

    // T034: Setup language navigation listener to clear override on URL change
    setupNavigationListener();

    console.log('VoxPage background service worker initialized');
  } catch (error) {
    console.error('Failed to initialize VoxPage:', error);
  }
}

// Initialize on load
initialize();

/**
 * Handle tab visibility changes for sync recovery
 */
browser.tabs.onActivated.addListener(async (activeInfo) => {
  // Delegate to playback controller for resync
  playbackController.handleResyncRequest('tab-activated');
});

/**
 * T033: Handle tab close - stop playback and cleanup resources
 * Implements FR-013: Clean up all playback resources when tab is closed
 */
browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
  // Check if this was the tab we were playing on
  // For now, just log - full implementation would track active playback tab
  console.log(`VoxPage: Tab ${tabId} closed, stopping any associated playback`);
  playbackController.handleStop();
});

/**
 * Initialize context menu
 */
browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: 'voxpage-read-selection',
    title: 'Read with VoxPage',
    contexts: ['selection']
  });
});

/**
 * Handle context menu clicks
 */
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'voxpage-read-selection' && info.selectionText) {
    playbackController.handlePlay({
      mode: 'selection',
      text: info.selectionText
    }, tab);
  }
});

/**
 * Listen for messages from popup and content scripts
 * Uses the message router for dispatching to appropriate handlers
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Route through the message router
  const result = router.route(message, sender, sendResponse);

  // If router returned true, it means async response is expected
  if (result === true) {
    return true;
  }

  // Return undefined for unhandled messages (allows other listeners to handle)
  return undefined;
});
