/**
 * Usage Event Buffer
 *
 * IndexedDB-backed ring buffer for storing events before shipping to Loki.
 * Features:
 * - Persists across browser restarts
 * - Ring buffer behavior (evicts oldest when full)
 * - TTL-based expiration
 * - Size-based limits
 *
 * @module utils/telemetry/usage/buffer
 */

import type { UsageEvent, BufferStats, BufferConfig, StoredEvent } from './types';
import { DEFAULT_BUFFER_CONFIG } from './types';

/**
 * IndexedDB object store names.
 */
const EVENTS_STORE = 'events';
const META_STORE = 'meta';

/**
 * Metadata keys.
 */
const STATS_KEY = 'stats';

/**
 * Buffer metadata stored in IndexedDB.
 */
interface BufferMeta {
  totalBytes: number;
  eventCount: number;
  droppedCount: number;
  lastFlushAt: number;
}

/**
 * Default metadata.
 */
const DEFAULT_META: BufferMeta = {
  totalBytes: 0,
  eventCount: 0,
  droppedCount: 0,
  lastFlushAt: 0,
};

/**
 * IndexedDB-backed event buffer with ring buffer behavior.
 */
export class UsageBuffer {
  private db: IDBDatabase | null = null;
  private config: BufferConfig;
  private initialized = false;
  private meta: BufferMeta = { ...DEFAULT_META };
  /** Lock to prevent race condition between flush() and close() */
  private flushing = false;

  constructor(config: Partial<BufferConfig> = {}) {
    this.config = { ...DEFAULT_BUFFER_CONFIG, ...config };
  }

  /**
   * Initialize the buffer by opening IndexedDB.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.db = await this.openDatabase();
      await this.loadMeta();
      await this.cleanup(); // Clean expired events on startup
      this.initialized = true;
    } catch (error) {
      console.error('[UsageBuffer] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Open the IndexedDB database.
   */
  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not available'));
        return;
      }

      const request = indexedDB.open(this.config.dbName, 1);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create events store with auto-increment key
        if (!db.objectStoreNames.contains(EVENTS_STORE)) {
          const eventsStore = db.createObjectStore(EVENTS_STORE, {
            keyPath: 'id',
            autoIncrement: true,
          });
          // Index for TTL cleanup
          eventsStore.createIndex('storedAt', 'storedAt', { unique: false });
          // Index for priority flush (errors first)
          eventsStore.createIndex('level', 'event.level', { unique: false });
        }

        // Create meta store for statistics
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Load metadata from IndexedDB.
   */
  private async loadMeta(): Promise<void> {
    if (!this.db) return;

    try {
      const tx = this.db.transaction(META_STORE, 'readonly');
      const store = tx.objectStore(META_STORE);
      const request = store.get(STATS_KEY);

      const result = await this.promisifyRequest<(BufferMeta & { key: string }) | undefined>(
        request,
      );
      if (result) {
        this.meta = {
          totalBytes: result.totalBytes,
          eventCount: result.eventCount,
          droppedCount: result.droppedCount,
          lastFlushAt: result.lastFlushAt,
        };
      }
    } catch (error) {
      console.warn('[UsageBuffer] Failed to load meta:', error);
    }
  }

  /**
   * Save metadata to IndexedDB.
   */
  private async saveMeta(): Promise<void> {
    if (!this.db) return;

    try {
      const tx = this.db.transaction(META_STORE, 'readwrite');
      const store = tx.objectStore(META_STORE);
      await this.promisifyRequest(store.put({ key: STATS_KEY, ...this.meta }));
    } catch (error) {
      console.warn('[UsageBuffer] Failed to save meta:', error);
    }
  }

  /**
   * Add an event to the buffer.
   * Returns true if added, false if dropped.
   */
  async add(event: UsageEvent): Promise<boolean> {
    if (!this.db || !this.initialized) {
      // Silently drop events during startup - this is expected
      return false;
    }

    const sizeBytes = this.calculateEventSize(event);
    const storedEvent: Omit<StoredEvent, 'id'> = {
      event,
      sizeBytes,
      storedAt: Date.now(),
    };

    // Check if we need to make room
    while (this.meta.totalBytes + sizeBytes > this.config.maxBytes) {
      const evicted = await this.evictOldest();
      if (!evicted) {
        // Nothing to evict, can't add
        this.meta.droppedCount++;
        await this.saveMeta();
        return false;
      }
    }

    try {
      const tx = this.db.transaction(EVENTS_STORE, 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);
      await this.promisifyRequest(store.add(storedEvent));

      this.meta.totalBytes += sizeBytes;
      this.meta.eventCount++;
      await this.saveMeta();

      return true;
    } catch (error) {
      console.error('[UsageBuffer] Failed to add event:', error);
      return false;
    }
  }

  /**
   * Evict the oldest event to make room.
   */
  private async evictOldest(): Promise<boolean> {
    if (!this.db) return false;

    try {
      const tx = this.db.transaction(EVENTS_STORE, 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);
      const index = store.index('storedAt');

      // Get the oldest event
      const cursor = await this.promisifyRequest(index.openCursor());
      if (!cursor) return false;

      const storedEvent = cursor.value as StoredEvent;
      await this.promisifyRequest(store.delete(storedEvent.id!));

      this.meta.totalBytes -= storedEvent.sizeBytes;
      this.meta.eventCount--;
      this.meta.droppedCount++;

      return true;
    } catch (error) {
      console.error('[UsageBuffer] Failed to evict:', error);
      return false;
    }
  }

  /**
   * Flush events from the buffer.
   * Returns up to `count` events and removes them from the buffer.
   */
  async flush(count: number): Promise<UsageEvent[]> {
    if (!this.db || !this.initialized) {
      return [];
    }

    // Prevent concurrent flush and protect against close() race
    if (this.flushing) {
      return [];
    }
    this.flushing = true;

    const events: UsageEvent[] = [];
    const idsToDelete: number[] = [];
    let bytesToRemove = 0;

    try {
      // Read events
      const tx = this.db.transaction(EVENTS_STORE, 'readonly');
      const store = tx.objectStore(EVENTS_STORE);
      const index = store.index('storedAt');

      let remaining = count;
      const cursorRequest = index.openCursor();

      await new Promise<void>((resolve, reject) => {
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor || remaining <= 0) {
            resolve();
            return;
          }

          const storedEvent = cursor.value as StoredEvent;
          events.push(storedEvent.event);
          idsToDelete.push(storedEvent.id!);
          bytesToRemove += storedEvent.sizeBytes;
          remaining--;

          cursor.continue();
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
      });

      // Delete flushed events
      if (idsToDelete.length > 0) {
        // Defensive check: db may have been closed during async cursor iteration
        if (!this.db) {
          console.warn(
            '[UsageBuffer] Database closed during flush, events will be re-read on next flush',
          );
          return [];
        }
        const deleteTx = this.db.transaction(EVENTS_STORE, 'readwrite');
        const deleteStore = deleteTx.objectStore(EVENTS_STORE);

        for (const id of idsToDelete) {
          deleteStore.delete(id);
        }

        await this.promisifyTransaction(deleteTx);

        this.meta.totalBytes -= bytesToRemove;
        this.meta.eventCount -= idsToDelete.length;
        this.meta.lastFlushAt = Date.now();
        await this.saveMeta();
      }

      return events;
    } catch (error) {
      console.error('[UsageBuffer] Failed to flush:', error);
      return [];
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Peek at buffered events without removing them.
   * Returns up to `count` events, oldest first.
   */
  async peek(count: number): Promise<UsageEvent[]> {
    if (!this.db || !this.initialized) {
      return [];
    }

    const events: UsageEvent[] = [];

    try {
      const tx = this.db.transaction(EVENTS_STORE, 'readonly');
      const store = tx.objectStore(EVENTS_STORE);
      const index = store.index('storedAt');

      let remaining = count;
      const cursorRequest = index.openCursor();

      await new Promise<void>((resolve, reject) => {
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor || remaining <= 0) {
            resolve();
            return;
          }

          const storedEvent = cursor.value as StoredEvent;
          events.push(storedEvent.event);
          remaining--;

          cursor.continue();
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
      });

      return events;
    } catch (error) {
      console.error('[UsageBuffer] Failed to peek:', error);
      return [];
    }
  }

  /**
   * Get buffer statistics.
   */
  async getStats(): Promise<BufferStats> {
    const now = Date.now();
    let oldestEventAgeMs = 0;

    if (this.db && this.meta.eventCount > 0) {
      try {
        const tx = this.db.transaction(EVENTS_STORE, 'readonly');
        const store = tx.objectStore(EVENTS_STORE);
        const index = store.index('storedAt');
        const cursor = await this.promisifyRequest(index.openCursor());

        if (cursor) {
          const oldest = cursor.value as StoredEvent;
          oldestEventAgeMs = now - oldest.storedAt;
        }
      } catch {
        // Ignore errors
      }
    }

    return {
      eventCount: this.meta.eventCount,
      totalBytes: this.meta.totalBytes,
      maxBytes: this.config.maxBytes,
      percentFull: (this.meta.totalBytes / this.config.maxBytes) * 100,
      oldestEventAgeMs,
      droppedCount: this.meta.droppedCount,
    };
  }

  /**
   * Cleanup expired events.
   * Returns the number of events removed.
   */
  async cleanup(): Promise<number> {
    if (!this.db) return 0;

    const cutoff = Date.now() - this.config.maxAgeMs;
    let removed = 0;
    let bytesRemoved = 0;

    try {
      const tx = this.db.transaction(EVENTS_STORE, 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);
      const index = store.index('storedAt');

      const range = IDBKeyRange.upperBound(cutoff);
      const cursorRequest = index.openCursor(range);

      await new Promise<void>((resolve, reject) => {
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) {
            resolve();
            return;
          }

          const storedEvent = cursor.value as StoredEvent;
          bytesRemoved += storedEvent.sizeBytes;
          removed++;
          cursor.delete();
          cursor.continue();
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
      });

      if (removed > 0) {
        this.meta.totalBytes -= bytesRemoved;
        this.meta.eventCount -= removed;
        await this.saveMeta();
      }

      return removed;
    } catch (error) {
      console.error('[UsageBuffer] Cleanup failed:', error);
      return 0;
    }
  }

  /**
   * Clear all events from the buffer.
   */
  async clear(): Promise<void> {
    if (!this.db) return;

    try {
      const tx = this.db.transaction(EVENTS_STORE, 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);
      await this.promisifyRequest(store.clear());

      this.meta = { ...DEFAULT_META };
      await this.saveMeta();
    } catch (error) {
      console.error('[UsageBuffer] Failed to clear:', error);
    }
  }

  /**
   * Get the count of buffered events.
   */
  getEventCount(): number {
    return this.meta.eventCount;
  }

  /**
   * Check if buffer is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Close the database connection.
   * If a flush is in progress, the close will still proceed but events
   * will be preserved in IndexedDB for recovery on next initialization.
   */
  close(): void {
    if (this.flushing) {
      console.warn(
        '[UsageBuffer] Closing while flush in progress, events will persist in IndexedDB',
      );
    }
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  /**
   * Calculate the approximate size of an event in bytes.
   */
  private calculateEventSize(event: UsageEvent): number {
    try {
      return new TextEncoder().encode(JSON.stringify(event)).length;
    } catch {
      // Fallback: rough estimate
      return JSON.stringify(event).length * 2;
    }
  }

  /**
   * Promisify an IDBRequest.
   */
  private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Promisify an IDBTransaction.
   */
  private promisifyTransaction(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
  }
}
