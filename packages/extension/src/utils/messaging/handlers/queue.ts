// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Queue Message Handlers for Proso
 * Handles reading queue requests from popup/content
 *
 * @module utils/messaging/handlers/queue
 */

import type { ProsoProtocol } from '../protocol';
import { type QueueStore, createQueueStore } from '../../queue/store';
import { type QueuePlayer, createQueuePlayer } from '../../queue/player';
import type { QueueItemStatus } from '../../queue/types';

// Singleton instances
let queueStore: QueueStore | null = null;
let queuePlayer: QueuePlayer | null = null;

/**
 * Get or create queue store instance
 */
function getQueueStore(): QueueStore {
  if (!queueStore) {
    queueStore = createQueueStore();
  }
  return queueStore;
}

/**
 * Get or create queue player instance
 */
function getQueuePlayer(): QueuePlayer {
  if (!queuePlayer) {
    queuePlayer = createQueuePlayer(getQueueStore(), {
      onItemStart: (item) => {
        // Broadcast to tabs that item started
        broadcastQueueEvent('itemStart', { item });
      },
      onItemComplete: (item) => {
        // Broadcast to tabs that item completed
        broadcastQueueEvent('itemComplete', { item });
      },
      onQueueComplete: () => {
        // Broadcast to tabs that queue finished
        broadcastQueueEvent('queueComplete', {});
      },
    });
  }
  return queuePlayer;
}

/**
 * Broadcast queue event to all tabs
 */
async function broadcastQueueEvent(event: string, data: Record<string, unknown>): Promise<void> {
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      try {
        await browser.tabs.sendMessage(tab.id, {
          type: 'queue.event',
          event,
          data,
        });
      } catch {
        // Ignore tabs that can't receive messages
      }
    }
  }
}

/**
 * Handle queue.add message
 * Adds article to reading queue
 */
export async function handleQueueAdd(
  request: ProsoProtocol['queue.add']['request'],
): Promise<ProsoProtocol['queue.add']['response']> {
  try {
    const item = await getQueueStore().add({
      url: request.url,
      title: request.title,
      excerpt: request.excerpt,
      author: request.author,
      faviconUrl: request.faviconUrl,
      language: request.language,
      estimatedReadTime: request.estimatedReadTime,
    });

    return {
      success: true,
      id: item.id,
      position: item.position,
    };
  } catch (error) {
    return {
      success: false,
      id: '',
      position: -1,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle queue.remove message
 * Removes article from queue
 */
export async function handleQueueRemove(
  request: ProsoProtocol['queue.remove']['request'],
): Promise<ProsoProtocol['queue.remove']['response']> {
  try {
    await getQueueStore().remove(request.id);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle queue.reorder message
 * Moves article to new position
 */
export async function handleQueueReorder(
  request: ProsoProtocol['queue.reorder']['request'],
): Promise<ProsoProtocol['queue.reorder']['response']> {
  try {
    const items = await getQueueStore().reorder(request.id, request.newPosition);
    return {
      success: true,
      items: items.map((item) => ({ id: item.id, position: item.position })),
    };
  } catch (error) {
    return {
      success: false,
      items: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle queue.updateStatus message
 * Updates article reading status
 */
export async function handleQueueUpdateStatus(
  request: ProsoProtocol['queue.updateStatus']['request'],
): Promise<ProsoProtocol['queue.updateStatus']['response']> {
  try {
    await getQueueStore().updateStatus(request.id, request.status as QueueItemStatus);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle queue.updateProgress message
 * Updates reading progress for article
 */
export async function handleQueueUpdateProgress(
  request: ProsoProtocol['queue.updateProgress']['request'],
): Promise<ProsoProtocol['queue.updateProgress']['response']> {
  try {
    await getQueueStore().updateProgress(request.id, request.progress, request.lastParagraphIndex);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle queue.clear message
 * Clears queue items by filter
 */
export async function handleQueueClear(
  request: ProsoProtocol['queue.clear']['request'],
): Promise<ProsoProtocol['queue.clear']['response']> {
  try {
    const removedCount = await getQueueStore().clear(request.filter);
    return {
      success: true,
      removedCount,
    };
  } catch (error) {
    return {
      success: false,
      removedCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle queue.getState message
 * Gets full queue state
 */
export async function handleQueueGetState(
  _request: ProsoProtocol['queue.getState']['request'],
): Promise<ProsoProtocol['queue.getState']['response']> {
  const state = await getQueueStore().getState();
  return {
    metadata: state.metadata,
    items: state.items,
  };
}

/**
 * Handle queue.getItem message
 * Gets single queue item by ID
 */
export async function handleQueueGetItem(
  request: ProsoProtocol['queue.getItem']['request'],
): Promise<ProsoProtocol['queue.getItem']['response']> {
  const item = await getQueueStore().getItem(request.id);

  if (!item) {
    return {
      success: false,
      error: 'Item not found',
    };
  }

  return {
    success: true,
    item,
  };
}

/**
 * Handle queue.play message
 * Starts playing queue from first pending item
 */
export async function handleQueuePlay(
  request: ProsoProtocol['queue.play']['request'],
): Promise<ProsoProtocol['queue.play']['response']> {
  try {
    const currentItem = await getQueuePlayer().play(request.startFromId);

    if (!currentItem) {
      return {
        success: false,
        error: 'No items to play',
      };
    }

    return {
      success: true,
      currentItem: {
        id: currentItem.id,
        url: currentItem.url,
        title: currentItem.title,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle queue.playNext message
 * Skips to next item in queue
 */
export async function handleQueuePlayNext(
  _request: ProsoProtocol['queue.playNext']['request'],
): Promise<ProsoProtocol['queue.playNext']['response']> {
  try {
    const { item, hasMore } = await getQueuePlayer().playNext();

    return {
      success: true,
      currentItem: item
        ? {
            id: item.id,
            url: item.url,
            title: item.title,
          }
        : undefined,
      hasMore,
    };
  } catch (error) {
    return {
      success: false,
      hasMore: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle queue.playPrevious message
 * Goes back to previous item
 */
export async function handleQueuePlayPrevious(
  _request: ProsoProtocol['queue.playPrevious']['request'],
): Promise<ProsoProtocol['queue.playPrevious']['response']> {
  try {
    const item = await getQueuePlayer().playPrevious();

    return {
      success: true,
      currentItem: item
        ? {
            id: item.id,
            url: item.url,
            title: item.title,
          }
        : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Queue handlers object for registration
 */
export const queueHandlers = {
  'queue.add': handleQueueAdd,
  'queue.remove': handleQueueRemove,
  'queue.reorder': handleQueueReorder,
  'queue.updateStatus': handleQueueUpdateStatus,
  'queue.updateProgress': handleQueueUpdateProgress,
  'queue.clear': handleQueueClear,
  'queue.getState': handleQueueGetState,
  'queue.getItem': handleQueueGetItem,
  'queue.play': handleQueuePlay,
  'queue.playNext': handleQueuePlayNext,
  'queue.playPrevious': handleQueuePlayPrevious,
};
