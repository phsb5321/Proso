/**
 * PDF Reading State Persistence
 *
 * Feature: 033-pdf-reading-support
 * Task: T020
 *
 * Manages saving and restoring PDF reading positions using
 * browser.storage.local with LRU history management.
 */

import type { PDFHistory, PDFHistoryItem, PDFReadingState } from './types';
import { pdfHistoryDefaults } from '../config/defaults';

/**
 * Storage key prefix for individual PDF states.
 */
export const STORAGE_PREFIX = 'pdfState:';

/**
 * Storage key for reading history.
 */
export const HISTORY_KEY = 'pdfHistory';

/**
 * Maximum number of PDF states to keep.
 */
export const MAX_STATES = 100;

/**
 * Generate SHA-256 hash of URL for storage key.
 */
export async function hashUrl(url: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get the storage key for a PDF URL hash.
 */
function getStorageKey(urlHash: string): string {
  return `${STORAGE_PREFIX}${urlHash}`;
}

/**
 * Save reading state for a PDF.
 *
 * @param state - Reading state to save
 * @param title - Document title for history display
 */
export async function saveReadingState(
  state: PDFReadingState,
  title?: string,
): Promise<void> {
  const storageKey = getStorageKey(state.urlHash);

  // Save the state
  await browser.storage.local.set({
    [storageKey]: {
      ...state,
      lastReadAt: state.lastReadAt.toISOString(),
    },
  });

  // Update history
  await updateHistory(state.urlHash, title || state.url, state.lastReadAt);
}

/**
 * Get reading state for a PDF by URL.
 *
 * @param url - PDF URL
 * @returns Reading state if found, null otherwise
 */
export async function getReadingState(url: string): Promise<PDFReadingState | null> {
  const urlHash = await hashUrl(url);
  return getReadingStateByHash(urlHash);
}

/**
 * Get reading state by URL hash.
 *
 * @param urlHash - SHA-256 hash of PDF URL
 * @returns Reading state if found, null otherwise
 */
export async function getReadingStateByHash(
  urlHash: string,
): Promise<PDFReadingState | null> {
  const storageKey = getStorageKey(urlHash);
  const result = await browser.storage.local.get(storageKey);
  const stored = result[storageKey] as
    | (Omit<PDFReadingState, 'lastReadAt'> & { lastReadAt: string })
    | undefined;

  if (!stored) {
    return null;
  }

  // Convert lastReadAt string back to Date
  return {
    ...stored,
    lastReadAt: new Date(stored.lastReadAt),
  };
}

/**
 * Delete reading state for a PDF.
 *
 * @param urlHash - SHA-256 hash of PDF URL
 */
export async function deleteReadingState(urlHash: string): Promise<void> {
  const storageKey = getStorageKey(urlHash);
  await browser.storage.local.remove(storageKey);
}

/**
 * Get reading history.
 *
 * @returns PDF history with items sorted by most recent
 */
export async function getHistory(): Promise<PDFHistory> {
  const result = await browser.storage.local.get(HISTORY_KEY);
  const history = result[HISTORY_KEY] as PDFHistory | undefined;

  if (!history) {
    return {
      items: [],
      maxItems: pdfHistoryDefaults.maxItems,
    };
  }

  return history;
}

/**
 * Update reading history with a new or existing entry.
 * Moves entry to front (LRU order) and enforces maxItems limit.
 *
 * @param urlHash - PDF URL hash
 * @param title - Document title for display
 * @param lastReadAt - When the document was last read
 */
export async function updateHistory(
  urlHash: string,
  title: string,
  lastReadAt: Date,
): Promise<void> {
  const history = await getHistory();

  // Remove existing entry if present (to re-add at front)
  const filteredItems = history.items.filter((item) => item.urlHash !== urlHash);

  // Add new entry at front
  const newEntry: PDFHistoryItem = {
    urlHash,
    title,
    lastReadAt: lastReadAt.toISOString(),
  };

  filteredItems.unshift(newEntry);

  // Enforce max items limit
  const evicted: string[] = [];
  while (filteredItems.length > history.maxItems) {
    const removed = filteredItems.pop();
    if (removed) {
      evicted.push(removed.urlHash);
    }
  }

  // Save updated history
  await browser.storage.local.set({
    [HISTORY_KEY]: {
      items: filteredItems,
      maxItems: history.maxItems,
    },
  });

  // Clean up evicted states
  if (evicted.length > 0) {
    const keysToRemove = evicted.map((hash) => getStorageKey(hash));
    await browser.storage.local.remove(keysToRemove);
  }
}

/**
 * Remove an entry from history.
 *
 * @param urlHash - PDF URL hash to remove
 * @param deleteState - Also delete the reading state (default: true)
 */
export async function removeFromHistory(
  urlHash: string,
  deleteState = true,
): Promise<void> {
  const history = await getHistory();

  const filteredItems = history.items.filter((item) => item.urlHash !== urlHash);

  await browser.storage.local.set({
    [HISTORY_KEY]: {
      items: filteredItems,
      maxItems: history.maxItems,
    },
  });

  if (deleteState) {
    await deleteReadingState(urlHash);
  }
}

/**
 * Clear all reading history and states.
 */
export async function clearAllHistory(): Promise<void> {
  // Get all storage keys
  const allStorage = await browser.storage.local.get(null);
  const keysToRemove: string[] = [HISTORY_KEY];

  // Find all PDF state keys
  for (const key of Object.keys(allStorage)) {
    if (key.startsWith(STORAGE_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  await browser.storage.local.remove(keysToRemove);
}

/**
 * Get recently read PDFs for quick access.
 *
 * @param limit - Maximum number of items to return
 * @returns Array of recent history items
 */
export async function getRecentlyRead(limit = 10): Promise<PDFHistoryItem[]> {
  const history = await getHistory();
  return history.items.slice(0, limit);
}

/**
 * Check if a PDF has saved reading state.
 *
 * @param url - PDF URL
 * @returns True if state exists
 */
export async function hasReadingState(url: string): Promise<boolean> {
  const state = await getReadingState(url);
  return state !== null;
}

/**
 * Create a new reading state for a PDF.
 *
 * @param url - PDF URL
 * @param totalParagraphs - Total paragraphs in document
 * @returns New reading state (not yet saved)
 */
export async function createReadingState(
  url: string,
  totalParagraphs: number,
): Promise<PDFReadingState> {
  const urlHash = await hashUrl(url);

  return {
    url,
    urlHash,
    paragraphIndex: 0,
    pageNumber: 1,
    lastReadAt: new Date(),
    totalParagraphs,
  };
}

/**
 * Update reading position within an existing state.
 *
 * @param urlHash - PDF URL hash
 * @param paragraphIndex - New paragraph index
 * @param pageNumber - New page number
 */
export async function updateReadingPosition(
  urlHash: string,
  paragraphIndex: number,
  pageNumber: number,
): Promise<void> {
  const state = await getReadingStateByHash(urlHash);

  if (!state) {
    console.warn('VoxPage: Cannot update position - no state found for', urlHash);
    return;
  }

  const updatedState: PDFReadingState = {
    ...state,
    paragraphIndex,
    pageNumber,
    lastReadAt: new Date(),
  };

  await saveReadingState(updatedState);
}

/**
 * Get reading progress as a percentage.
 *
 * @param state - Reading state
 * @returns Progress percentage (0-100)
 */
export function getReadingProgress(state: PDFReadingState): number {
  if (state.totalParagraphs === 0) return 0;
  return Math.round((state.paragraphIndex / state.totalParagraphs) * 100);
}
