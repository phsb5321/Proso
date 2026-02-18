// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * VoxPage Schemas - Barrel Export
 *
 * Central export for all Zod schemas.
 *
 * @module utils/schemas
 */

// Highlight schemas
export {
  TextQuoteSelectorSchema,
  HighlightColorSchema,
  HighlightSchema,
  HIGHLIGHT_COLOR_VALUES,
  createHighlight,
  type TextQuoteSelector,
  type Highlight,
  type HighlightColor,
} from './highlight.schema';

// Article schemas
export {
  ParagraphSchema,
  ArticleSchema,
  splitIntoParagraphs,
  estimateReadingTime,
  type Paragraph,
  type Article,
} from './article.schema';

// Audio chunk schemas
export {
  AudioChunkSchema,
  generateAudioChunkId,
  generateTextHash,
  createAudioChunk,
  calculateCacheSize,
  type AudioChunk,
} from './audio-chunk.schema';

// Playback schemas
export {
  PlaybackStatusSchema,
  PlaybackStateSchema,
  PlaybackTransitions,
  createInitialPlaybackState,
  calculateProgress,
  type PlaybackStatus,
  type PlaybackState,
} from './playback.schema';
