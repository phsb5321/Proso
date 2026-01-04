/**
 * VoxPage Background Service Worker
 * Main entrypoint for WXT extension background context
 */

import { browser } from 'wxt/browser';

// Import message handlers
import * as playbackHandlers from '../utils/messaging/handlers/playback';
import * as settingsHandlers from '../utils/messaging/handlers/settings';

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
}

let playbackState: PlaybackState = {
  status: 'stopped',
  currentParagraph: 0,
  totalParagraphs: 0,
  progress: 0,
  speed: 1.0,
  provider: 'browser',
};

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
    playbackState.status = 'loading';
    // In real implementation, this would trigger actual TTS
    // For now, simulate loading -> playing transition
    setTimeout(() => {
      playbackState.status = 'playing';
      notifyPopup();
    }, 500);
    return { success: true };
  },

  pausePlayback: async () => {
    playbackState.status = 'paused';
    notifyPopup();
    return { success: true };
  },

  stopPlayback: async () => {
    playbackState.status = 'stopped';
    playbackState.currentParagraph = 0;
    playbackState.progress = 0;
    notifyPopup();
    return { success: true };
  },

  nextParagraph: async () => {
    if (playbackState.totalParagraphs > 0) {
      playbackState.currentParagraph = Math.min(
        playbackState.currentParagraph + 1,
        playbackState.totalParagraphs - 1
      );
      playbackState.progress =
        (playbackState.currentParagraph / playbackState.totalParagraphs) * 100;
      notifyPopup();
    }
    return { success: true, currentParagraph: playbackState.currentParagraph };
  },

  previousParagraph: async () => {
    playbackState.currentParagraph = Math.max(playbackState.currentParagraph - 1, 0);
    if (playbackState.totalParagraphs > 0) {
      playbackState.progress =
        (playbackState.currentParagraph / playbackState.totalParagraphs) * 100;
    }
    notifyPopup();
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
    return { success: true };
  },

  // Settings messages (delegate to handlers)
  'settings.get': async () => {
    return settingsHandlers.handleSettingsGet();
  },

  'settings.update': async (data) => {
    return settingsHandlers.handleSettingsUpdate(data as Parameters<typeof settingsHandlers.handleSettingsUpdate>[0]);
  },
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

  // Set up message listener
  browser.runtime.onMessage.addListener((message, _sender) => {
    const { type, ...data } = message as { type: string; [key: string]: unknown };

    console.log('[Background] Received message:', type);

    const handler = messageHandlers[type];
    if (handler) {
      // Return a promise for async response
      return handler(data);
    }

    console.warn('[Background] Unknown message type:', type);
    return Promise.resolve({ error: 'Unknown message type' });
  });

  // Initialize settings from storage
  browser.storage.local.get(['speed', 'provider']).then((result) => {
    if (typeof result.speed === 'number') {
      playbackState.speed = result.speed;
    }
    if (typeof result.provider === 'string') {
      playbackState.provider = result.provider;
    }
    console.log('[Background] Settings loaded:', {
      speed: playbackState.speed,
      provider: playbackState.provider,
    });
  });

  console.log('VoxPage: Message handlers registered');
});
