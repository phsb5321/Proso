// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * VoxPage Background Script — Composition Root
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

// Roadmap feature handlers (023-feature-roadmap)
import { exportHandlers } from '../utils/messaging/handlers/export';
import { queueHandlers } from '../utils/messaging/handlers/queue';
import { summarizeHandlers } from '../utils/messaging/handlers/summarize';
import { QUEUE_STORAGE_KEYS } from '../utils/queue/types';

// Smart Audio Cache (028-smart-audio-cache)
import { getCacheStore } from '../utils/cache';

// Hexagonal Architecture (034-hexagonal-architecture)
import { dispatchToHexagonal, initHexagonalArchitecture } from '../background/init-hexagonal';

// Structured error responses (041-firefox-first-pivot T1.2)
import { unknownMessageResponse } from '../utils/messaging/error-response';
// Unknown message telemetry (041-firefox-first-pivot T1.3)
import { logUnknownMessage } from '../utils/telemetry';

// Usage observability (043-usage-observability-loki)
import { installConsoleCapture, installErrorCapture, usageTracker } from '../utils/telemetry/usage';

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
      console.error('[Background] Get logs failed:', error);
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
      console.error('[Background] Flush logs failed:', error);
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
  // Summarize handlers
  ...Object.fromEntries(
    Object.entries(summarizeHandlers).map(([key, handler]) => [
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
  console.log('VoxPage background service worker started');

  // Seed telemetry gateway config from build-time constants on install/update
  browser.runtime.onInstalled.addListener(async (details) => {
    try {
      const existing = await browser.storage.local.get([
        'telemetryGatewayUrl',
        'telemetryGatewayToken',
      ]);

      const updates: Record<string, string> = {};

      // Only seed if not already configured (don't overwrite user/options changes)
      if (!existing.telemetryGatewayUrl && __TELEMETRY_GATEWAY_URL__) {
        updates.telemetryGatewayUrl = __TELEMETRY_GATEWAY_URL__;
      }
      if (!existing.telemetryGatewayToken && __TELEMETRY_GATEWAY_TOKEN__) {
        updates.telemetryGatewayToken = __TELEMETRY_GATEWAY_TOKEN__;
      }

      if (Object.keys(updates).length > 0) {
        await browser.storage.local.set(updates);
        console.log(`[Background] Telemetry config seeded on ${details.reason}`);
      }
    } catch (error) {
      console.warn('[Background] Failed to seed telemetry config:', error);
    }
  });

  // Initialize usage observability (043-usage-observability-loki)
  // Gateway URL and token are loaded from storage or environment
  const initUsageTracker = async () => {
    try {
      // Get telemetry config from storage (set via options page)
      const result = await browser.storage.local.get([
        'telemetryEnabled',
        'telemetryGatewayUrl',
        'telemetryGatewayToken',
      ]);

      // Only initialize if telemetry is enabled
      if (result.telemetryEnabled === false) {
        console.log('[Background] Usage telemetry disabled by user');
        return;
      }

      // Use gateway config from storage (seeded by onInstalled handler)
      const gatewayUrl = result.telemetryGatewayUrl as string | undefined;
      const gatewayToken = result.telemetryGatewayToken as string | undefined;

      if (!gatewayUrl || !gatewayToken) {
        console.log('[Background] Telemetry gateway not configured, skipping');
        return;
      }

      await usageTracker.initialize({
        gatewayUrl,
        gatewayToken,
        entrypoint: 'background',
        enabled: true,
        debugMode: process.env.NODE_ENV !== 'production',
      });

      // Install global error capture
      installErrorCapture(usageTracker);

      // Install console capture to forward console logs to telemetry
      installConsoleCapture(usageTracker, {
        captureLog: true,
        captureDebug: true,
        captureInfo: true,
        captureWarn: true,
        captureError: true,
      });

      // Track background start event
      usageTracker.track('background.started');

      console.log('[Background] Usage telemetry initialized');
    } catch (error) {
      console.warn('[Background] Failed to initialize usage telemetry:', error);
    }
  };
  initUsageTracker();

  // Initialize hexagonal architecture (034-hexagonal-architecture)
  initHexagonalArchitecture()
    .then(() => {
      console.log('[Background] Hexagonal architecture initialized');
    })
    .catch((error) => {
      console.error('[Background] Failed to initialize hexagonal architecture:', error);
    });

  // T021: Initialize audio cache on extension startup
  const cacheStore = getCacheStore();
  cacheStore
    .init()
    .then(() => {
      console.log(
        '[Background] Audio cache initialized, mode:',
        cacheStore.isInMemoryMode ? 'in-memory' : 'IndexedDB',
      );
      const stats = cacheStore.getStats();
      console.log('[Background] Cache stats:', {
        entries: stats.entries,
        size: stats.totalSize,
        hitRate: stats.hitRate,
      });
    })
    .catch((error) => {
      console.error('[Background] Failed to initialize audio cache:', error);
    });

  /**
   * Dispatch: Try hexagonal handler first, fall back to legacy messageHandlers.
   * Returns the response, or null if neither handler exists.
   */
  async function dispatchMessage(type: string, data: Record<string, unknown>): Promise<unknown> {
    // Try hexagonal handler first
    const hexResult = await dispatchToHexagonal(type, data);
    if (hexResult !== null) {
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
  browser.runtime.onMessage.addListener((message, _sender) => {
    // Handle messages with 'type' field (from popup)
    if (message && typeof message === 'object' && 'type' in message) {
      const { type, ...data } = message as { type: string; [key: string]: unknown };

      // Skip internal messages like playbackStateUpdate
      if (type === 'playbackStateUpdate') {
        return;
      }

      console.log('[Background] Received message:', type);

      return dispatchMessage(type, data).then((result) => {
        if (result === null) {
          console.warn('[Background] Unknown message type:', type);
          logUnknownMessage(type);
          return unknownMessageResponse(type);
        }
        // Debug: log what we're returning to the caller
        if (type === 'settings.testApiKey') {
          console.log('[Background] Returning testApiKey result:', JSON.stringify(result));
        }
        return result;
      });
    }

    // Handle messages with 'action' field (legacy format from content script)
    if (message && typeof message === 'object' && 'action' in message) {
      const { action, ...data } = message as { action: string; [key: string]: unknown };
      console.log('[Background] Received legacy action:', action);

      return dispatchMessage(action, data).then((result) => {
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

  console.log('VoxPage: Message handlers registered');

  // Cross-tab sync for reading queue (T075)
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    // Check if queue data changed
    if (changes[QUEUE_STORAGE_KEYS.ITEMS] || changes[QUEUE_STORAGE_KEYS.METADATA]) {
      console.log('[Background] Queue storage changed, broadcasting to tabs');

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
        console.log('[Background] Initial cache cleanup:', {
          entriesRemoved: result.entriesRemoved,
          bytesFreed: result.bytesFreed,
          durationMs: result.durationMs,
        });
      }
    } catch (error) {
      console.error('[Background] Initial cache cleanup failed:', error);
    }
  }, INITIAL_CLEANUP_DELAY_MS);

  // Schedule periodic cleanup (every hour)
  setInterval(async () => {
    try {
      const store = getCacheStore();

      // Run cleanup for stale entries
      const cleanupResult = await store.cleanup();
      if (cleanupResult.entriesRemoved > 0) {
        console.log('[Background] Periodic cache cleanup:', {
          staleRemoved: cleanupResult.staleEntriesRemoved,
          corruptRemoved: cleanupResult.corruptEntriesRemoved,
          bytesFreed: cleanupResult.bytesFreed,
        });
      }

      // Check if eviction is needed
      const evictionResult = await store.evictIfNeeded();
      if (evictionResult.triggered && evictionResult.entriesEvicted > 0) {
        console.log('[Background] Periodic cache eviction:', {
          entriesEvicted: evictionResult.entriesEvicted,
          bytesFreed: evictionResult.bytesFreed,
          reason: evictionResult.reason,
        });
      }
    } catch (error) {
      console.error('[Background] Periodic cache maintenance failed:', error);
    }
  }, PERIODIC_CLEANUP_INTERVAL_MS);

  console.log('[Background] Cache cleanup scheduled:', {
    initialDelay: `${INITIAL_CLEANUP_DELAY_MS / 1000}s`,
    periodicInterval: `${PERIODIC_CLEANUP_INTERVAL_MS / 1000 / 60}min`,
  });
});
