// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso Highlight Zod Schemas
 *
 * W3C Web Annotation compatible schemas for text highlights and selectors.
 *
 * @module utils/schemas/highlight.schema
 */

import { z } from 'zod';

/**
 * TextQuoteSelector schema - W3C selector for robust text re-anchoring
 *
 * @see https://www.w3.org/TR/annotation-model/#text-quote-selector
 */
export const TextQuoteSelectorSchema = z.object({
  type: z.literal('TextQuoteSelector'),
  /** The exact highlighted text (1-10000 chars) */
  exact: z.string().min(1).max(10000),
  /** Context before the quote (~32 chars recommended, max 64) */
  prefix: z.string().max(64).optional(),
  /** Context after the quote (~32 chars recommended, max 64) */
  suffix: z.string().max(64).optional(),
});

export type TextQuoteSelector = z.infer<typeof TextQuoteSelectorSchema>;

/**
 * Highlight color presets
 */
const HighlightColorSchema = z.enum(['yellow', 'green', 'blue', 'pink', 'purple']);

export type HighlightColor = z.infer<typeof HighlightColorSchema>;

/**
 * Default highlight colors for UI display
 */
export const HIGHLIGHT_COLOR_VALUES: Record<HighlightColor, string> = {
  yellow: '#fef08a', // yellow-200
  green: '#bbf7d0', // green-200
  blue: '#bfdbfe', // blue-200
  pink: '#fbcfe8', // pink-200
  purple: '#ddd6fe', // purple-200
};

/**
 * Highlight entity schema - User-created annotation on a page
 *
 * Follows W3C Web Annotation Data Model for interoperability.
 *
 * @see https://www.w3.org/TR/annotation-model/
 */
export const HighlightSchema = z.object({
  /** UUID v4 identifier */
  id: z.string().uuid(),

  /** Canonical page URL (without hash/query) */
  url: z.string().url(),

  /** W3C Web Annotation target */
  target: z.object({
    source: z.string().url(),
    selector: z.array(TextQuoteSelectorSchema).min(1),
  }),

  /** Optional user note (W3C TextualBody) */
  body: z
    .object({
      type: z.literal('TextualBody'),
      value: z.string(),
      format: z.literal('text/plain'),
    })
    .optional(),

  /** Display color */
  color: HighlightColorSchema,

  /** True if re-anchoring failed (needs user attention) */
  orphaned: z.boolean().default(false),

  /** ISO 8601 creation timestamp */
  created: z.string().datetime(),

  /** ISO 8601 last modified timestamp */
  modified: z.string().datetime().optional(),
});

export type Highlight = z.infer<typeof HighlightSchema>;

/**
 * Create a new highlight from selection
 */
export function createHighlight(params: {
  url: string;
  exact: string;
  prefix?: string;
  suffix?: string;
  color?: HighlightColor;
  note?: string;
}): Highlight {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const highlight: Highlight = {
    id,
    url: params.url,
    target: {
      source: params.url,
      selector: [
        {
          type: 'TextQuoteSelector',
          exact: params.exact,
          prefix: params.prefix,
          suffix: params.suffix,
        },
      ],
    },
    color: params.color ?? 'yellow',
    orphaned: false,
    created: now,
  };

  if (params.note) {
    highlight.body = {
      type: 'TextualBody',
      value: params.note,
      format: 'text/plain',
    };
  }

  return HighlightSchema.parse(highlight);
}
