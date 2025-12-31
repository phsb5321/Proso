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
    await playbackController.initialize();
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
