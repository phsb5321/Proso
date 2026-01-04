/**
 * VoxPage Background Service Worker
 * Main entrypoint for WXT extension background context
 */

import { browser } from 'wxt/browser';

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

let activeTabId: number | null = null;

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

    activeTabId = tab.id;
    playbackState.status = 'loading';
    notifyPopup();

    // Extract text from the page
    const extractResult = await sendToContentScript(tab.id, {
      action: 'extractText',
      mode: 'article',
    });

    if (extractResult && typeof extractResult === 'object' && 'paragraphs' in extractResult) {
      const result = extractResult as { paragraphs: string[] };
      playbackState.totalParagraphs = result.paragraphs.length;
      console.log('[Background] Extracted', playbackState.totalParagraphs, 'paragraphs');
    }

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

    return { success: true };
  },

  pausePlayback: async () => {
    playbackState.status = 'paused';
    notifyPopup();

    if (activeTabId) {
      await sendToContentScript(activeTabId, {
        action: 'FOOTER_STATE_UPDATE',
        status: 'paused',
      });
    }

    return { success: true };
  },

  stopPlayback: async () => {
    playbackState.status = 'stopped';
    playbackState.currentParagraph = 0;
    playbackState.progress = 0;
    notifyPopup();

    if (activeTabId) {
      await sendToContentScript(activeTabId, {
        action: 'FOOTER_HIDE',
      });
    }

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

      if (activeTabId) {
        await sendToContentScript(activeTabId, {
          action: 'FOOTER_STATE_UPDATE',
          currentParagraph: playbackState.currentParagraph,
          totalParagraphs: playbackState.totalParagraphs,
          progress: playbackState.progress,
        });
      }
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

    if (activeTabId) {
      await sendToContentScript(activeTabId, {
        action: 'FOOTER_STATE_UPDATE',
        currentParagraph: playbackState.currentParagraph,
        totalParagraphs: playbackState.totalParagraphs,
        progress: playbackState.progress,
      });
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
      const action = (message as { action: string }).action;
      console.log('[Background] Received legacy action:', action);
      // For now, just acknowledge - legacy handlers would go here
      return Promise.resolve({ received: true });
    }

    // Ignore other messages (e.g., from other extensions)
    return;
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
