// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com/commercial

/**
 * Reading Queue Types for Proso
 * Zod-first type definitions for reading queue feature
 *
 * @module utils/queue/types
 */

import { z } from 'zod';

/**
 * Queue item status enum values
 */
export const QUEUE_ITEM_STATUSES = ['pending', 'reading', 'completed', 'archived'] as const;

/**
 * Queue item schema
 */
export const queueItemSchema = z.object({
  /** Unique ID (hash of URL) */
  id: z.string().min(8).max(64),
  /** Article URL */
  url: z.string().url(),
  /** Article title (truncated to 100 chars) */
  title: z.string().max(100),
  /** Domain extracted from URL */
  domain: z.string(),
  /** First 200 chars of article */
  excerpt: z.string().max(200).optional(),
  /** Author name if available */
  author: z.string().max(50).optional(),
  /** Favicon URL or data URL */
  faviconUrl: z.string().optional(),
  /** Detected language (ISO 639-1) */
  language: z.string().length(2).optional(),
  /** Estimated read time in minutes */
  estimatedReadTime: z.number().int().min(1).max(120).optional(),
  /** Timestamp when added */
  addedAt: z.number().int(),
  /** Position in queue (for ordering) */
  position: z.number().int().min(0),
  /** Reading status */
  status: z.enum(QUEUE_ITEM_STATUSES),
  /** Playback progress (0-100) */
  progress: z.number().min(0).max(100).default(0),
  /** Last paragraph index read */
  lastParagraphIndex: z.number().int().min(0).optional(),
});

/**
 * Queue metadata schema
 */
export const queueMetadataSchema = z.object({
  /** Schema version for migrations */
  version: z.number().int().min(1).default(1),
  /** Number of items in queue */
  count: z.number().int().min(0),
  /** Last modification timestamp */
  lastModified: z.number().int(),
  /** Total storage size in bytes */
  totalSize: z.number().int().min(0),
});

/**
 * Queue state schema (metadata + items)
 */
export const queueStateSchema = z.object({
  metadata: queueMetadataSchema,
  items: z.array(queueItemSchema),
});

/**
 * Queue action schema (discriminated union)
 */
export const queueActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('add'),
    item: queueItemSchema.omit({ id: true, position: true, addedAt: true }),
  }),
  z.object({
    type: z.literal('remove'),
    id: z.string(),
  }),
  z.object({
    type: z.literal('reorder'),
    id: z.string(),
    newPosition: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('updateStatus'),
    id: z.string(),
    status: z.enum(QUEUE_ITEM_STATUSES),
  }),
  z.object({
    type: z.literal('updateProgress'),
    id: z.string(),
    progress: z.number().min(0).max(100),
    lastParagraphIndex: z.number().int().min(0).optional(),
  }),
  z.object({
    type: z.literal('clear'),
    filter: z.enum(['all', 'completed', 'archived']).optional(),
  }),
]);

/**
 * Add item request schema
 */
export const addItemRequestSchema = z.object({
  url: z.string().url(),
  title: z.string().max(100),
  excerpt: z.string().max(200).optional(),
  author: z.string().max(50).optional(),
  faviconUrl: z.string().optional(),
  language: z.string().length(2).optional(),
  estimatedReadTime: z.number().int().min(1).max(120).optional(),
});

// Inferred TypeScript types
export type QueueItem = z.infer<typeof queueItemSchema>;
export type QueueMetadata = z.infer<typeof queueMetadataSchema>;
export type QueueState = z.infer<typeof queueStateSchema>;
export type QueueAction = z.infer<typeof queueActionSchema>;
export type QueueItemStatus = (typeof QUEUE_ITEM_STATUSES)[number];
export type AddItemRequest = z.infer<typeof addItemRequestSchema>;

/**
 * Queue event types for cross-tab sync
 */
export type QueueEventType =
  | 'add'
  | 'remove'
  | 'reorder'
  | 'updateStatus'
  | 'updateProgress'
  | 'clear';

/**
 * Queue update event payload
 */
export interface QueueUpdateEvent {
  action: QueueEventType;
  affectedIds: string[];
  metadata: {
    count: number;
    lastModified: number;
  };
}

/**
 * Queue storage keys
 */
export const QUEUE_STORAGE_KEYS = {
  METADATA: 'queue:metadata',
  ITEMS: 'queue:items',
  SETTINGS: 'queue:settings',
} as const;
