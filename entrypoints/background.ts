/**
 * VoxPage Background Service Worker
 * Main entrypoint for WXT extension background context
 */

import { browser } from 'wxt/browser';
import { ElevenLabsProvider, loadElevenLabsApiKey } from '../src/background/providers/elevenlabs';

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
};

let activeTabId: number | null = null;
let paragraphs: string[] = [];
let apiKeys: ApiKeys = {};
let elevenlabsProvider: ElevenLabsProvider | null = null;

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

async function generateElevenLabsAudio(text: string): Promise<string | null> {
  // Initialize/refresh provider with latest key
  const provider = await initElevenLabsProvider();
  if (!provider) {
    console.error('[Background] ElevenLabs provider not available');
    return null;
  }

  try {
    console.log('[Background] Generating ElevenLabs audio, text length:', text.length);

    // Get default voice
    const defaultVoice = provider.getDefaultVoice();
    console.log('[Background] Using voice:', defaultVoice.name, defaultVoice.id);

    // Generate audio
    const audioData = await provider.generateAudio(text, defaultVoice.id, {
      turbo: false,
      stability: 0.5,
      similarityBoost: 0.75,
      style: 0.5,
    });

    // Result is ArrayBuffer (no timestamps requested)
    const arrayBuffer = audioData as ArrayBuffer;

    // Convert to base64 data URL for passing to content script
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    const audioUrl = `data:audio/mpeg;base64,${base64}`;
    console.log('[Background] ElevenLabs audio generated, size:', arrayBuffer.byteLength);
    return audioUrl;
  } catch (error) {
    console.error('[Background] ElevenLabs generation error:', error);
    return null;
  }
}

// ============================================
// TTS Playback
// ============================================

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
    // Use ElevenLabs
    const audioUrl = await generateElevenLabsAudio(text);
    if (audioUrl) {
      const result = await sendToContentScript(activeTabId, {
        action: 'playAudio',
        audioUrl: audioUrl,
        speed: playbackState.speed,
      });
      success = result !== null;
    } else {
      console.warn('[Background] ElevenLabs failed, falling back to browser TTS');
    }
  }

  if (!success) {
    // Fallback to browser TTS
    await sendToContentScript(activeTabId, {
      action: 'speakText',
      text: text,
      speed: playbackState.speed,
    });
  }

  // Check if we're still playing (might have been paused/stopped)
  if (playbackState.status === 'playing') {
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

    activeTabId = tab.id;
    playbackState.status = 'loading';
    notifyPopup();

    // Reload API keys in case they changed
    const stored = await browser.storage.local.get([
      'elevenlabsApiKey',
      'openaiApiKey',
      'groqApiKey',
      'cartesiaApiKey',
    ]);
    apiKeys = {
      elevenlabsApiKey: stored.elevenlabsApiKey as string | undefined,
      openaiApiKey: stored.openaiApiKey as string | undefined,
      groqApiKey: stored.groqApiKey as string | undefined,
      cartesiaApiKey: stored.cartesiaApiKey as string | undefined,
    };
    console.log('[Background] API keys loaded, elevenlabs:', !!apiKeys.elevenlabsApiKey);

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

    if (activeTabId) {
      // Stop audio/speech
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

    if (activeTabId) {
      // Stop audio/speech
      await sendToContentScript(activeTabId, { action: 'stopAudio' });
      await sendToContentScript(activeTabId, { action: 'stopSpeech' });
      await sendToContentScript(activeTabId, { action: 'clearHighlight' });
      await sendToContentScript(activeTabId, { action: 'FOOTER_HIDE' });
    }

    return { success: true };
  },

  nextParagraph: async () => {
    if (playbackState.status === 'playing' && activeTabId) {
      // Stop current audio
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
    if (playbackState.status === 'playing' && activeTabId) {
      // Stop current audio
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
});
