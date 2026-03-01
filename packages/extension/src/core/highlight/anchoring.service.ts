// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Highlight Anchoring Service
 *
 * Implements W3C Web Annotation text re-anchoring algorithm.
 * Uses TextQuoteSelector with fuzzy matching for robust re-anchoring
 * after DOM changes.
 *
 * @module core/highlight/anchoring.service
 */

import type { Result } from '../shared/result';
import { Ok, Err, isErr } from '../shared/result';
import type { TextQuoteSelector } from '../../utils/schemas/highlight.schema';
import { normalizeText } from './text-quote-selector';

/**
 * Anchoring error types
 */
export type AnchoringError =
  | { type: 'NOT_FOUND'; message: string }
  | { type: 'AMBIGUOUS'; message: string; candidateCount: number }
  | { type: 'LOW_CONFIDENCE'; message: string; confidence: number }
  | { type: 'DOM_ERROR'; message: string };

/**
 * Anchor position in the document
 */
export interface AnchorPosition {
  /** Start offset in the document text */
  startOffset: number;

  /** End offset in the document text */
  endOffset: number;

  /** Confidence score (0-1) */
  confidence: number;

  /** The matched text */
  matchedText: string;
}

/**
 * Anchor result with DOM range
 */
export interface AnchorResult {
  /** DOM Range for highlighting */
  range: Range;

  /** Position information */
  position: AnchorPosition;
}

/**
 * Match candidate during search
 */
interface MatchCandidate {
  startOffset: number;
  endOffset: number;
  matchedText: string;
  similarity: number;
}

/**
 * Anchoring configuration
 */
export interface AnchoringConfig {
  /** Minimum similarity threshold (0-1, default: 0.8) */
  minSimilarity: number;

  /** Maximum candidates to consider (default: 10) */
  maxCandidates: number;

  /** Context weight in scoring (0-1, default: 0.3) */
  contextWeight: number;
}

const DEFAULT_CONFIG: AnchoringConfig = {
  minSimilarity: 0.8,
  maxCandidates: 10,
  contextWeight: 0.3,
};

/**
 * Calculate Levenshtein distance between two strings.
 *
 * Uses Wagner-Fischer algorithm with O(mn) time and O(min(m,n)) space.
 */
export function levenshteinDistance(a: string, b: string): number {
  // Normalize inputs
  const s1 = normalizeText(a);
  const s2 = normalizeText(b);

  // Optimize for common cases
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  // Ensure s1 is the shorter string for space optimization
  const [shorter, longer] = s1.length <= s2.length ? [s1, s2] : [s2, s1];

  // Single-row DP approach
  let prevRow = Array.from({ length: shorter.length + 1 }, (_, i) => i);
  let currRow = new Array(shorter.length + 1);

  for (let j = 1; j <= longer.length; j++) {
    currRow[0] = j;

    for (let i = 1; i <= shorter.length; i++) {
      const cost = shorter[i - 1] === longer[j - 1] ? 0 : 1;

      currRow[i] = Math.min(
        prevRow[i] + 1,      // deletion
        currRow[i - 1] + 1,  // insertion
        prevRow[i - 1] + cost // substitution
      );
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[shorter.length];
}

/**
 * Calculate similarity ratio between two strings (0-1).
 *
 * Uses 1 - (distance / maxLength) formula.
 */
export function similarityRatio(a: string, b: string): number {
  const s1 = normalizeText(a);
  const s2 = normalizeText(b);

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const distance = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);

  return 1 - distance / maxLen;
}

/**
 * Find all occurrences of a pattern in text with fuzzy matching.
 */
function findFuzzyMatches(
  text: string,
  pattern: string,
  minSimilarity: number,
  windowSize: number,
): MatchCandidate[] {
  const normalizedText = normalizeText(text);
  const normalizedPattern = normalizeText(pattern);
  const candidates: MatchCandidate[] = [];

  // Slide a window through the text
  const patternLen = normalizedPattern.length;
  const searchLen = Math.max(1, Math.floor(patternLen * 0.5));
  const maxOffset = normalizedText.length - searchLen;

  for (let i = 0; i <= maxOffset; i++) {
    // Try different window sizes around the pattern length
    for (let size = patternLen - windowSize; size <= patternLen + windowSize; size++) {
      if (size < 1 || i + size > normalizedText.length) continue;

      const candidate = normalizedText.slice(i, i + size);
      const similarity = similarityRatio(candidate, normalizedPattern);

      if (similarity >= minSimilarity) {
        candidates.push({
          startOffset: i,
          endOffset: i + size,
          matchedText: text.slice(i, i + size),
          similarity,
        });
      }
    }
  }

  // Remove overlapping candidates, keeping highest similarity
  return deduplicateCandidates(candidates);
}

/**
 * Remove overlapping candidates, keeping highest similarity.
 */
function deduplicateCandidates(candidates: MatchCandidate[]): MatchCandidate[] {
  // Sort by similarity (descending)
  const sorted = [...candidates].sort((a, b) => b.similarity - a.similarity);
  const kept: MatchCandidate[] = [];

  for (const candidate of sorted) {
    // Check if overlaps with any kept candidate
    const overlaps = kept.some(
      (k) => !(candidate.endOffset <= k.startOffset || candidate.startOffset >= k.endOffset)
    );

    if (!overlaps) {
      kept.push(candidate);
    }
  }

  return kept;
}

/**
 * Score a match candidate using context.
 */
function scoreWithContext(
  candidate: MatchCandidate,
  selector: TextQuoteSelector,
  fullText: string,
  contextWeight: number,
): number {
  let score = candidate.similarity;

  // Add context matching
  if (selector.prefix) {
    const textBefore = fullText.slice(
      Math.max(0, candidate.startOffset - selector.prefix.length),
      candidate.startOffset
    );
    const prefixSim = similarityRatio(textBefore, selector.prefix);
    score += prefixSim * contextWeight;
  }

  if (selector.suffix) {
    const textAfter = fullText.slice(
      candidate.endOffset,
      candidate.endOffset + selector.suffix.length
    );
    const suffixSim = similarityRatio(textAfter, selector.suffix);
    score += suffixSim * contextWeight;
  }

  // Normalize score
  const maxScore = 1 + (selector.prefix ? contextWeight : 0) + (selector.suffix ? contextWeight : 0);
  return score / maxScore;
}

/**
 * Anchor a TextQuoteSelector to a position in text.
 *
 * Uses fuzzy matching with prefix/suffix context for robust matching.
 *
 * @param text - Full document text
 * @param selector - TextQuoteSelector to anchor
 * @param config - Anchoring configuration
 * @returns Result with anchor position or error
 */
export function anchorToText(
  text: string,
  selector: TextQuoteSelector,
  config: Partial<AnchoringConfig> = {},
): Result<AnchorPosition, AnchoringError> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // First try exact match
  const normalizedText = normalizeText(text);
  const normalizedExact = normalizeText(selector.exact);
  const exactIndex = normalizedText.indexOf(normalizedExact);

  if (exactIndex !== -1) {
    // Exact match found
    const matchedText = text.slice(exactIndex, exactIndex + selector.exact.length);

    return Ok({
      startOffset: exactIndex,
      endOffset: exactIndex + selector.exact.length,
      confidence: 1,
      matchedText,
    });
  }

  // Fuzzy match with context
  const windowSize = Math.ceil(selector.exact.length * 0.2); // 20% tolerance
  const candidates = findFuzzyMatches(
    text,
    selector.exact,
    cfg.minSimilarity,
    windowSize,
  );

  if (candidates.length === 0) {
    return Err({
      type: 'NOT_FOUND',
      message: `No matches found for text: "${selector.exact.slice(0, 50)}..."`,
    });
  }

  // Score candidates with context
  const scored = candidates
    .map((c) => ({
      ...c,
      confidence: scoreWithContext(c, selector, text, cfg.contextWeight),
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, cfg.maxCandidates);

  const best = scored[0];

  if (best.confidence < cfg.minSimilarity) {
    return Err({
      type: 'LOW_CONFIDENCE',
      message: `Best match has low confidence: ${best.confidence.toFixed(2)}`,
      confidence: best.confidence,
    });
  }

  // Check for ambiguous matches (multiple high-confidence candidates)
  const highConfidence = scored.filter((c) => c.confidence >= cfg.minSimilarity);
  if (highConfidence.length > 1 && highConfidence[1].confidence > cfg.minSimilarity * 0.95) {
    return Err({
      type: 'AMBIGUOUS',
      message: 'Multiple high-confidence matches found',
      candidateCount: highConfidence.length,
    });
  }

  return Ok({
    startOffset: best.startOffset,
    endOffset: best.endOffset,
    confidence: best.confidence,
    matchedText: best.matchedText,
  });
}

/**
 * Create a DOM Range from an anchor position.
 *
 * Walks the DOM tree to find the correct text nodes.
 *
 * @param document - Document object
 * @param container - Container element to search in
 * @param position - Anchor position from anchorToText
 * @returns Result with DOM Range or error
 */
export function createRangeFromPosition(
  document: Document,
  container: Element,
  position: AnchorPosition,
): Result<Range, AnchoringError> {
  try {
    const range = document.createRange();
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null,
    );

    let currentOffset = 0;
    let startNode: Text | null = null;
    let startNodeOffset = 0;
    let endNode: Text | null = null;
    let endNodeOffset = 0;

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const nodeLength = node.length;
      const nodeEnd = currentOffset + nodeLength;

      // Check for start position
      if (!startNode && position.startOffset >= currentOffset && position.startOffset < nodeEnd) {
        startNode = node;
        startNodeOffset = position.startOffset - currentOffset;
      }

      // Check for end position
      if (!endNode && position.endOffset > currentOffset && position.endOffset <= nodeEnd) {
        endNode = node;
        endNodeOffset = position.endOffset - currentOffset;
      }

      currentOffset = nodeEnd;

      if (startNode && endNode) break;
    }

    if (!startNode || !endNode) {
      return Err({
        type: 'DOM_ERROR',
        message: 'Could not locate text nodes for anchor position',
      });
    }

    range.setStart(startNode, startNodeOffset);
    range.setEnd(endNode, endNodeOffset);

    return Ok(range);
  } catch (error) {
    return Err({
      type: 'DOM_ERROR',
      message: error instanceof Error ? error.message : 'Unknown DOM error',
    });
  }
}

/**
 * Full anchoring: find position and create DOM Range.
 *
 * @param document - Document object
 * @param container - Container element to search in
 * @param selector - TextQuoteSelector to anchor
 * @param config - Anchoring configuration
 * @returns Result with anchor result or error
 */
export function anchor(
  document: Document,
  container: Element,
  selector: TextQuoteSelector,
  config: Partial<AnchoringConfig> = {},
): Result<AnchorResult, AnchoringError> {
  // Get text content
  const text = container.textContent ?? '';

  // Find position
  const positionResult = anchorToText(text, selector, config);
  if (isErr(positionResult)) {
    return Err(positionResult.error);
  }

  // Create Range
  const rangeResult = createRangeFromPosition(document, container, positionResult.value);
  if (isErr(rangeResult)) {
    return Err(rangeResult.error);
  }

  return Ok({
    range: rangeResult.value,
    position: positionResult.value,
  });
}

/**
 * Batch anchor multiple selectors.
 *
 * Returns results for each selector, including failures.
 */
export function anchorAll(
  document: Document,
  container: Element,
  selectors: TextQuoteSelector[],
  config: Partial<AnchoringConfig> = {},
): Map<number, Result<AnchorResult, AnchoringError>> {
  const results = new Map<number, Result<AnchorResult, AnchoringError>>();

  for (let i = 0; i < selectors.length; i++) {
    results.set(i, anchor(document, container, selectors[i], config));
  }

  return results;
}

/**
 * Create AnchoringService instance with bound configuration.
 */
export function createAnchoringService(config: Partial<AnchoringConfig> = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return {
    anchor: (document: Document, container: Element, selector: TextQuoteSelector) =>
      anchor(document, container, selector, cfg),

    anchorToText: (text: string, selector: TextQuoteSelector) =>
      anchorToText(text, selector, cfg),

    anchorAll: (document: Document, container: Element, selectors: TextQuoteSelector[]) =>
      anchorAll(document, container, selectors, cfg),

    similarityRatio,
    levenshteinDistance,
  };
}

export type AnchoringService = ReturnType<typeof createAnchoringService>;
