// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso Background Script — Composition Root
 *
 * This is the main entrypoint for the WXT extension background context.
 * All playback, settings, cache, footer, and provider logic is handled
 * by hexagonal handlers registered via initHexagonalArchitecture().
 *
 * Remaining legacy handlers here:
 * - getLogs / flushLogs (telemetry log viewer)
 * - export / summarize / queue (roadmap feature handlers)
 */

import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { installOffscreenAudioElementShim } from '../adapters/audio';
import { createLogger } from '../utils/logging/logger';

// Roadmap feature handlers (023-feature-roadmap)
import { exportHandlers } from '../utils/messaging/handlers/export';
import { queueHandlers } from '../utils/messaging/handlers/queue';
import { QUEUE_STORAGE_KEYS } from '../utils/queue/types';

// Smart Audio Cache (028-smart-audio-cache)
import { getCacheStore } from '../utils/cache';

// Hexagonal Architecture (034-hexagonal-architecture)
import { dispatchToHexagonal, initHexagonalArchitecture } from '../background/init-hexagonal';

// PROSO-90: inbound-message gate against the handler-registration window
import { setMessageGate, waitForMessageGate } from '../background/message-gate';

// Keyboard shortcuts + "Read with Proso" context menu
import {
  READ_SELECTION_MENU_ID,
  handleReadSelectionClick,
  handleShortcutCommand,
} from '../background/shortcuts';
import { getPlaybackService, isPlaybackServiceAvailable } from '../composition';

// Legacy `action:` names mapped onto canonical handler names (T068)
import { LEGACY_BRIDGE } from '../handlers/legacy-bridge';

// Structured error responses (041-firefox-first-pivot T1.2)
import { unknownMessageResponse } from '../utils/messaging/error-response';
// Unknown message telemetry (041-firefox-first-pivot T1.3)
import { logUnknownMessage } from '../utils/telemetry';
import { clearRetiredTelemetryState } from '../utils/telemetry/retired-state';

// Usage observability (043-usage-observability-loki)
import { usageTracker } from '../utils/telemetry/usage/tracker';

// Chrome MV3 has no worker DOM, so `Audio` is undefined there (spec 106
// C1/C2). Installs a worker-safe shim before anything can call `new Audio()`;
// a no-op everywhere `Audio` already exists (Firefox MV2's event page).
installOffscreenAudioElementShim();

const log = createLogger('background');

// ============================================
// Message Router
// ============================================

type MessageHandler = (data: Record<string, unknown>) => Promise<unknown>;

/**
 * Remaining legacy message handlers.
 * Most playback/settings/cache/footer handlers have been migrated to hexagonal architecture.
 * Only telemetry log viewers and roadmap feature handlers remain here.
 *
 * Hexagonal handlers: see src/handlers/
 * - playback.handlers.ts (playback.start, playback.pause, PARAGRAPH_CLICKED, etc.)
 * - settings.handlers.ts (settings.get, settings.update, etc.)
 * - footer.handlers.ts (footer.action, footer.show, etc.)
 * - cache.handlers.ts (cache.getStats, cache.clear, etc.)
 * - prefetch.handlers.ts (prefetch.start, prefetch.stop, etc.)
 */
const messageHandlers: Record<string, MessageHandler> = {
  /**
   * Get buffered logs for display in the options page.
   * Called from options page "View Logs" button.
   */
  getLogs: async () => {
    try {
      if (!usageTracker.isEnabled() || !usageTracker.isInitialized()) {
        return { success: false, error: 'Telemetry not initialized' };
      }

      const events = await usageTracker.getBufferedLogs(100);
      const stats = await usageTracker.getStats();

      // Transform events to log viewer format
      const logs = events.map((event) => ({
        date: event.ts,
        level:
          event.event.startsWith('error') || event.event.includes('.error')
            ? 'error'
            : event.event.startsWith('console.warn')
              ? 'warn'
              : event.event.startsWith('console.debug')
                ? 'debug'
                : 'info',
        component: event.entrypoint || 'unknown',
        message: event.msg || event.event,
        metadata: event.data,
      }));

      return {
        success: true,
        logs,
        status: {
          bufferCount: stats.buffer.eventCount,
          bufferBytes: stats.buffer.totalBytes,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error('[Background] Get logs failed', { error });
      return { success: false, error: errorMessage };
    }
  },

  /**
   * Flush telemetry logs to the gateway.
   * Called from options page "Flush Now" button.
   */
  flushLogs: async () => {
    try {
      if (!usageTracker.isEnabled() || !usageTracker.isInitialized()) {
        return { success: false, error: 'Telemetry not initialized' };
      }

      await usageTracker.flush();
      const stats = await usageTracker.getStats();

      return {
        success: true,
        stats: {
          eventsSent: stats.shipper.totalEventsSent,
          eventsFailed: stats.shipper.totalEventsFailed,
          bufferCount: stats.buffer.eventCount,
          circuitOpen: stats.shipper.circuitOpen,
          lastError: stats.shipper.lastError,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error('[Background] Flush logs failed', { error });
      return { success: false, error: errorMessage };
    }
  },

  /**
   * Drop the buffered telemetry logs.
   * Called from the options page "Clear logs" button, which asks for
   * confirmation first and reports whatever comes back here.
   */
  clearLogs: async () => {
    try {
      if (!usageTracker.isEnabled() || !usageTracker.isInitialized()) {
        return { success: false, error: 'Telemetry not initialized' };
      }

      await usageTracker.clearBufferedLogs();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error('[Background] Clear logs failed', { error });
      return { success: false, error: errorMessage };
    }
  },

  // Roadmap Feature Handlers - These are domain handlers that haven't been
  // migrated to hexagonal yet. They use their own modular pattern.
  // Export handlers
  ...Object.fromEntries(
    Object.entries(exportHandlers).map(([key, handler]) => [
      key,
      async (data: Record<string, unknown>) => handler(data as never),
    ]),
  ),
  // Queue handlers
  ...Object.fromEntries(
    Object.entries(queueHandlers).map(([key, handler]) => [
      key,
      async (data: Record<string, unknown>) => handler(data as never),
    ]),
  ),
};

// ============================================
// Main Background Script
// ============================================

export default defineBackground(() => {
  log.info('Proso background service worker started');

  browser.runtime.onInstalled.addListener(async () => {
    void clearRetiredTelemetryState(browser.storage.local, globalThis.indexedDB, log.warn);

    // Create the "Read with Proso" context menu idempotently. removeAll() first
    // avoids "duplicate id" errors when onInstalled fires again on update.
    try {
      await browser.contextMenus.removeAll();
      browser.contextMenus.create({
        id: READ_SELECTION_MENU_ID,
        title: 'Read with Proso',
        contexts: ['selection'],
      });
      log.info('[Background] Context menu registered');
    } catch (error) {
      log.warn('[Background] Failed to register context menu', { error });
    }
  });

  // Initialize hexagonal architecture (034-hexagonal-architecture). The
  // readiness promise gates inbound messages (PROSO-90): the listener below
  // registers synchronously, but handler registration happens inside this
  // async init — a message arriving in that window used to be mis-answered
  // with "Unknown message type". The gate queues it until registration
  // settles; the .catch keeps the gate non-rejecting.
  const hexagonalReady = initHexagonalArchitecture()
    .then(() => {
      log.info('[Background] Hexagonal architecture initialized');
    })
    .catch((error) => {
      log.error('[Background] Failed to initialize hexagonal architecture', { error });
    });
  setMessageGate(hexagonalReady);

  // T021: Initialize audio cache on extension startup
  const cacheStore = getCacheStore();
  cacheStore
    .init()
    .then(() => {
      log.info('[Background] Audio cache initialized', {
        mode: cacheStore.isInMemoryMode ? 'in-memory' : 'IndexedDB',
      });
      const stats = cacheStore.getStats();
      log.info('[Background] Cache stats', {
        entries: stats.entries,
        size: stats.totalSize,
        hitRate: stats.hitRate,
      });
    })
    .catch((error) => {
      log.error('[Background] Failed to initialize audio cache', { error });
    });

  /**
   * Dispatch: Try hexagonal handler first, fall back to legacy messageHandlers.
   * Returns the response, or null if neither handler exists.
   */
  async function dispatchMessage(type: string, data: Record<string, unknown>): Promise<unknown> {
    // Try hexagonal handler first
    const hexResult = await dispatchToHexagonal(type, data);

    // T034: Check for discriminated error from hexagonal dispatch
    if (hexResult !== null) {
      if (
        hexResult &&
        typeof hexResult === 'object' &&
        '_hexError' in (hexResult as Record<string, unknown>)
      ) {
        const hexError = hexResult as { _hexError: boolean; error: string };
        log.warn('[Background] Hexagonal handler error', { type, error: hexError.error });
        return { success: false, error: hexError.error };
      }
      return hexResult;
    }

    // Fall back to legacy handler (getLogs, flushLogs, export, summarize, queue)
    const handler = messageHandlers[type];
    if (handler) {
      return handler(data);
    }

    return null;
  }

  // Set up message listener
  browser.runtime.onMessage.addListener(async (message, sender) => {
    // T007: Extract sender tab ID for per-tab state (Contract 7)
    const senderTabId = sender.tab?.id;

    // Handle messages with 'type' field (from popup)
    if (message && typeof message === 'object' && 'type' in message) {
      const { type, ...data } = message as { type: string; [key: string]: unknown };

      // Skip internal messages like playbackStateUpdate
      if (type === 'playbackStateUpdate') {
        return;
      }

      // PROSO-90: never mis-answer a message that arrived before handler
      // registration settled — wait for the gate instead.
      await waitForMessageGate();

      log.debug('[Background] Received message', { type });

      // T007: Inject sender tab ID into dispatch data
      const enrichedData = senderTabId ? { ...data, __tabId: senderTabId } : data;

      return dispatchMessage(type, enrichedData).then((result) => {
        if (result === null) {
          log.warn('[Background] Unknown message type', { type });
          logUnknownMessage(type);
          return unknownMessageResponse(type);
        }
        // Debug: log what we're returning to the caller
        if (type === 'settings.testApiKey') {
          log.debug('[Background] Returning testApiKey result', { result: JSON.stringify(result) });
        }
        return result;
      });
    }

    // Handle messages with 'action' field (legacy format from content script)
    if (message && typeof message === 'object' && 'action' in message) {
      const { action, ...data } = message as { action: string; [key: string]: unknown };

      // PROSO-90: same gate as the type branch — legacy actions dispatch
      // through the same registry and must not be mis-answered either.
      await waitForMessageGate();

      log.debug('[Background] Received legacy action', { action });

      // T007: Inject sender tab ID into dispatch data
      const enrichedData = senderTabId ? { ...data, __tabId: senderTabId } : data;

      // T068: Bridge legacy action names to canonical dot-notation handler
      // names. The map lives in src/handlers/legacy-bridge.ts so a test can
      // check every row still points at a registered handler.
      const handlerType = LEGACY_BRIDGE[action] ?? action;

      return dispatchMessage(handlerType, enrichedData).then((result) => {
        if (result === null) {
          // Return structured error for unknown actions
          logUnknownMessage(action);
          return unknownMessageResponse(action);
        }
        return result;
      });
    }

    // Ignore other messages (e.g., from other extensions)
    return;
  });

  log.info('Proso: Message handlers registered');

  // ============================================
  // Keyboard Shortcuts (browser.commands)
  // ============================================

  /**
   * Read the current playback status for the Alt+P toggle.
   * Returns null when the playback service is unavailable so the toggle falls
   * back to starting playback.
   */
  const getPlaybackStatus = (): string | null => {
    if (!isPlaybackServiceAvailable()) {
      return null;
    }
    try {
      return getPlaybackService().getState().status;
    } catch (error) {
      log.warn('[Background] Failed to read playback status for shortcut', { error });
      return null;
    }
  };

  browser.commands.onCommand.addListener((command) => {
    handleShortcutCommand(command, {
      dispatch: dispatchMessage,
      getStatus: getPlaybackStatus,
    }).catch((error) => {
      log.error('[Background] Shortcut command failed', { command, error });
    });
  });

  // ============================================
  // Context Menu ("Read with Proso")
  // ============================================

  browser.contextMenus.onClicked.addListener((info, tab) => {
    handleReadSelectionClick(info, tab, { dispatch: dispatchMessage }).catch((error) => {
      log.error('[Background] Context menu action failed', { error });
    });
  });

  // Cross-tab sync for reading queue (T075)
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    // Check if queue data changed
    if (changes[QUEUE_STORAGE_KEYS.ITEMS] || changes[QUEUE_STORAGE_KEYS.METADATA]) {
      log.debug('[Background] Queue storage changed, broadcasting to tabs');

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
        log.info('[Background] Initial cache cleanup', {
          entriesRemoved: result.entriesRemoved,
          bytesFreed: result.bytesFreed,
          durationMs: result.durationMs,
        });
      }
    } catch (error) {
      log.error('[Background] Initial cache cleanup failed', { error });
    }
  }, INITIAL_CLEANUP_DELAY_MS);

  // Schedule periodic cleanup (every hour)
  setInterval(async () => {
    try {
      const store = getCacheStore();

      // Run cleanup for stale entries
      const cleanupResult = await store.cleanup();
      if (cleanupResult.entriesRemoved > 0) {
        log.info('[Background] Periodic cache cleanup', {
          staleRemoved: cleanupResult.staleEntriesRemoved,
          corruptRemoved: cleanupResult.corruptEntriesRemoved,
          bytesFreed: cleanupResult.bytesFreed,
        });
      }

      // Check if eviction is needed
      const evictionResult = await store.evictIfNeeded();
      if (evictionResult.triggered && evictionResult.entriesEvicted > 0) {
        log.info('[Background] Periodic cache eviction', {
          entriesEvicted: evictionResult.entriesEvicted,
          bytesFreed: evictionResult.bytesFreed,
          reason: evictionResult.reason,
        });
      }
    } catch (error) {
      log.error('[Background] Periodic cache maintenance failed', { error });
    }
  }, PERIODIC_CLEANUP_INTERVAL_MS);

  log.info('[Background] Cache cleanup scheduled', {
    initialDelay: `${INITIAL_CLEANUP_DELAY_MS / 1000}s`,
    periodicInterval: `${PERIODIC_CLEANUP_INTERVAL_MS / 1000 / 60}min`,
  });
});
