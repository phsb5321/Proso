/**
 * Extracted Content Entity
 *
 * Data structures for content extraction results.
 *
 * @module core/content-extraction/extracted-content
 */

/**
 * Paragraph type classification.
 */
export type ParagraphType = 'paragraph' | 'heading' | 'list';

/**
 * Extracted paragraph with metadata.
 */
export interface Paragraph {
  readonly text: string;
  readonly index: number;
  readonly type: ParagraphType;
  readonly characterCount: number;
}

/**
 * Result of content extraction.
 */
export interface ExtractedContent {
  readonly paragraphs: readonly Paragraph[];
  readonly totalCharacters: number;
  readonly extractionTimeMs: number;
  readonly sourceUrl: string;
  readonly title: string | null;
}

/**
 * Content relevance score.
 */
export interface ContentScore {
  readonly score: number;
  readonly paragraphCount: number;
  readonly linkDensity: number;
  readonly headingCount: number;
}

/**
 * Create an empty extracted content result.
 */
export function createEmptyContent(sourceUrl: string): ExtractedContent {
  return {
    paragraphs: [],
    totalCharacters: 0,
    extractionTimeMs: 0,
    sourceUrl,
    title: null,
  };
}

/**
 * Create a paragraph from text.
 */
export function createParagraph(
  text: string,
  index: number,
  type: ParagraphType = 'paragraph',
): Paragraph {
  return {
    text,
    index,
    type,
    characterCount: text.length,
  };
}

/**
 * Create extracted content from paragraphs.
 */
export function createExtractedContent(
  paragraphs: readonly Paragraph[],
  sourceUrl: string,
  title: string | null,
  extractionTimeMs: number,
): ExtractedContent {
  const totalCharacters = paragraphs.reduce((sum, p) => sum + p.characterCount, 0);

  return {
    paragraphs,
    totalCharacters,
    extractionTimeMs,
    sourceUrl,
    title,
  };
}

/**
 * Get just the text from extracted content.
 */
export function getTextArray(content: ExtractedContent): readonly string[] {
  return content.paragraphs.map((p) => p.text);
}

/**
 * Get paragraph at index, or null if out of bounds.
 */
export function getParagraphAt(content: ExtractedContent, index: number): Paragraph | null {
  if (index < 0 || index >= content.paragraphs.length) {
    return null;
  }
  return content.paragraphs[index];
}

/**
 * Calculate estimated reading time in seconds.
 */
export function estimateReadingTime(content: ExtractedContent, wordsPerMinute = 150): number {
  // Rough estimate: average 5 characters per word
  const wordCount = content.totalCharacters / 5;
  return (wordCount / wordsPerMinute) * 60;
}

/**
 * Calculate estimated TTS duration in seconds.
 */
export function estimateTTSDuration(
  content: ExtractedContent,
  wordsPerMinute = 150,
  speed = 1.0,
): number {
  const baseTime = estimateReadingTime(content, wordsPerMinute);
  return baseTime / speed;
}
