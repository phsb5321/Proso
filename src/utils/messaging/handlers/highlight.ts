/**
 * Highlight Message Handlers
 * Handles paragraph and word highlighting messages
 *
 * @module utils/messaging/handlers/highlight
 */

import type { VoxPageProtocol } from '../protocol';
import type { HighlightParagraphParams, HighlightWordParams } from '../types';
import { highlightParagraphParamsSchema, highlightWordParamsSchema } from '../schemas';

/**
 * Highlight paragraph handler
 */
export async function handleHighlightParagraph(
  params: HighlightParagraphParams
): Promise<VoxPageProtocol['highlight.paragraph']['response']> {
  const validated = highlightParagraphParamsSchema.parse(params);

  // TODO Phase 4: Delegate to HighlightManager.highlightParagraph()

  return {
    success: true,
    paragraphIndex: validated.paragraphIndex,
  };
}

/**
 * Highlight word handler
 */
export async function handleHighlightWord(
  params: HighlightWordParams
): Promise<VoxPageProtocol['highlight.word']['response']> {
  const validated = highlightWordParamsSchema.parse(params);

  // TODO Phase 4: Delegate to HighlightManager.highlightWord()

  return {
    success: true,
    wordIndex: validated.wordIndex,
  };
}

/**
 * Clear highlights handler
 */
export async function handleHighlightClear(): Promise<VoxPageProtocol['highlight.clear']['response']> {
  // TODO Phase 4: Delegate to HighlightManager.clearHighlights()

  return {
    success: true,
  };
}

/**
 * Get highlight state handler
 */
export async function handleHighlightGetState(): Promise<VoxPageProtocol['highlight.getState']['response']> {
  // TODO Phase 4: Delegate to HighlightManager.getState()

  return {
    currentParagraphIndex: null,
    currentWordIndex: null,
    highlightEnabled: true,
  };
}
