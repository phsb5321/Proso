// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Chrome MV3 Offscreen Document for Audio Playback
 *
 * Handles TTS audio playback in Chrome MV3 where the service worker
 * cannot play audio directly. Communicates with background script
 * via chrome.runtime messaging.
 *
 * @module entrypoints/offscreen
 */

// Audio player element
let audioElement: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;

// Playback state
let isPlaying = false;
let playbackSpeed = 1.0;

/**
 * Message types for offscreen document communication
 */
interface OffscreenMessage {
  type: string;
  data?: unknown;
}

interface LoadAudioMessage extends OffscreenMessage {
  type: 'LOAD_AUDIO';
  data: {
    audioData: ArrayBuffer | number[];
    mimeType: string;
  };
}

interface PlayMessage extends OffscreenMessage {
  type: 'PLAY';
}

interface PauseMessage extends OffscreenMessage {
  type: 'PAUSE';
}

interface StopMessage extends OffscreenMessage {
  type: 'STOP';
}

interface SeekMessage extends OffscreenMessage {
  type: 'SEEK';
  data: {
    positionMs: number;
  };
}

interface SetSpeedMessage extends OffscreenMessage {
  type: 'SET_SPEED';
  data: {
    speed: number;
  };
}

interface GetStateMessage extends OffscreenMessage {
  type: 'GET_STATE';
}

type AudioMessage =
  | LoadAudioMessage
  | PlayMessage
  | PauseMessage
  | StopMessage
  | SeekMessage
  | SetSpeedMessage
  | GetStateMessage;

/**
 * Initialize the offscreen document
 */
function init(): void {
  audioElement = document.getElementById('audio-player') as HTMLAudioElement;

  if (!audioElement) {
    console.error('[Offscreen] Audio element not found');
    return;
  }

  // Set up event listeners
  audioElement.addEventListener('play', handlePlay);
  audioElement.addEventListener('pause', handlePause);
  audioElement.addEventListener('ended', handleEnded);
  audioElement.addEventListener('timeupdate', handleTimeUpdate);
  audioElement.addEventListener('error', handleError);
  audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);

  console.log('[Offscreen] Initialized audio playback document');
}

/**
 * Handle incoming messages from background script
 */
chrome.runtime.onMessage.addListener(
  (
    message: AudioMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => {
    // Handle message based on type
    switch (message.type) {
      case 'LOAD_AUDIO':
        handleLoadAudio(message.data, sendResponse);
        return true; // Async response

      case 'PLAY':
        handlePlayCommand(sendResponse);
        return true;

      case 'PAUSE':
        handlePauseCommand(sendResponse);
        return true;

      case 'STOP':
        handleStopCommand(sendResponse);
        return true;

      case 'SEEK':
        handleSeekCommand(message.data.positionMs, sendResponse);
        return true;

      case 'SET_SPEED':
        handleSetSpeedCommand(message.data.speed, sendResponse);
        return true;

      case 'GET_STATE':
        handleGetStateCommand(sendResponse);
        return true;

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
        return false;
    }
  },
);

/**
 * Load audio data from ArrayBuffer
 */
async function handleLoadAudio(
  data: { audioData: ArrayBuffer | number[]; mimeType: string },
  sendResponse: (response: unknown) => void,
): Promise<void> {
  try {
    if (!audioElement) {
      sendResponse({ success: false, error: 'Audio element not initialized' });
      return;
    }

    // Clean up previous object URL
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }

    // Convert array to ArrayBuffer if needed
    const arrayBuffer =
      data.audioData instanceof ArrayBuffer
        ? data.audioData
        : new Uint8Array(data.audioData).buffer;

    // Create blob from array buffer
    const blob = new Blob([arrayBuffer], { type: data.mimeType || 'audio/mpeg' });
    currentObjectUrl = URL.createObjectURL(blob);

    // Set audio source
    audioElement.src = currentObjectUrl;
    audioElement.playbackRate = playbackSpeed;

    // Wait for audio to load
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        audioElement?.removeEventListener('loadeddata', onLoaded);
        audioElement?.removeEventListener('error', onError);
        resolve();
      };
      const onError = () => {
        audioElement?.removeEventListener('loadeddata', onLoaded);
        audioElement?.removeEventListener('error', onError);
        reject(new Error('Failed to load audio'));
      };
      audioElement?.addEventListener('loadeddata', onLoaded);
      audioElement?.addEventListener('error', onError);
    });

    sendResponse({
      success: true,
      duration: (audioElement.duration || 0) * 1000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Offscreen] Failed to load audio:', message);
    sendResponse({ success: false, error: message });
  }
}

/**
 * Start playback
 */
async function handlePlayCommand(sendResponse: (response: unknown) => void): Promise<void> {
  try {
    if (!audioElement) {
      sendResponse({ success: false, error: 'Audio element not initialized' });
      return;
    }

    await audioElement.play();
    sendResponse({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Offscreen] Failed to play:', message);
    sendResponse({ success: false, error: message });
  }
}

/**
 * Pause playback
 */
function handlePauseCommand(sendResponse: (response: unknown) => void): void {
  try {
    if (!audioElement) {
      sendResponse({ success: false, error: 'Audio element not initialized' });
      return;
    }

    audioElement.pause();
    sendResponse({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Offscreen] Failed to pause:', message);
    sendResponse({ success: false, error: message });
  }
}

/**
 * Stop playback and reset
 */
function handleStopCommand(sendResponse: (response: unknown) => void): void {
  try {
    if (!audioElement) {
      sendResponse({ success: false, error: 'Audio element not initialized' });
      return;
    }

    audioElement.pause();
    audioElement.currentTime = 0;

    // Clean up object URL
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }

    audioElement.src = '';
    isPlaying = false;

    sendResponse({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Offscreen] Failed to stop:', message);
    sendResponse({ success: false, error: message });
  }
}

/**
 * Seek to position
 */
function handleSeekCommand(positionMs: number, sendResponse: (response: unknown) => void): void {
  try {
    if (!audioElement) {
      sendResponse({ success: false, error: 'Audio element not initialized' });
      return;
    }

    audioElement.currentTime = positionMs / 1000;
    sendResponse({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Offscreen] Failed to seek:', message);
    sendResponse({ success: false, error: message });
  }
}

/**
 * Set playback speed
 */
function handleSetSpeedCommand(speed: number, sendResponse: (response: unknown) => void): void {
  try {
    if (!audioElement) {
      sendResponse({ success: false, error: 'Audio element not initialized' });
      return;
    }

    // Clamp speed to valid range
    playbackSpeed = Math.max(0.5, Math.min(2.0, speed));
    audioElement.playbackRate = playbackSpeed;

    sendResponse({ success: true, speed: playbackSpeed });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Offscreen] Failed to set speed:', message);
    sendResponse({ success: false, error: message });
  }
}

/**
 * Get current playback state
 */
function handleGetStateCommand(sendResponse: (response: unknown) => void): void {
  try {
    if (!audioElement) {
      sendResponse({
        success: true,
        state: {
          isPlaying: false,
          positionMs: 0,
          durationMs: 0,
          speed: playbackSpeed,
        },
      });
      return;
    }

    sendResponse({
      success: true,
      state: {
        isPlaying: !audioElement.paused,
        positionMs: audioElement.currentTime * 1000,
        durationMs: (audioElement.duration || 0) * 1000,
        speed: audioElement.playbackRate,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Offscreen] Failed to get state:', message);
    sendResponse({ success: false, error: message });
  }
}

// Event handlers

function handlePlay(): void {
  isPlaying = true;
  sendEventToBackground('playing', {
    positionMs: (audioElement?.currentTime || 0) * 1000,
  });
}

function handlePause(): void {
  isPlaying = false;
  sendEventToBackground('paused', {
    positionMs: (audioElement?.currentTime || 0) * 1000,
  });
}

function handleEnded(): void {
  isPlaying = false;
  sendEventToBackground('ended', {});
}

function handleTimeUpdate(): void {
  if (!audioElement) return;

  // Send time updates at reduced frequency (4Hz)
  const positionMs = audioElement.currentTime * 1000;
  sendEventToBackground('timeupdate', { positionMs });
}

function handleError(): void {
  const error = audioElement?.error;
  sendEventToBackground('error', {
    code: error?.code,
    message: error?.message || 'Unknown playback error',
  });
}

function handleLoadedMetadata(): void {
  sendEventToBackground('loaded', {
    durationMs: (audioElement?.duration || 0) * 1000,
  });
}

/**
 * Send event to background script
 */
function sendEventToBackground(eventType: string, data: Record<string, unknown>): void {
  try {
    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_EVENT',
      eventType,
      data,
    });
  } catch (error) {
    // Ignore send errors (background may not be listening)
  }
}

// Initialize on load
init();
