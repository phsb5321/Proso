/**
 * PDF Paragraph Grouping Algorithm
 *
 * Feature: 033-pdf-reading-support
 * Task: T019
 *
 * Groups raw PDF text items into logical paragraphs based on
 * spatial analysis (Y position gaps, line heights).
 */

import type { BoundingBox, PDFParagraph, PDFTextItem } from './types';

/**
 * Threshold in page units for considering items on the same line.
 * Items within this Y distance are grouped together.
 */
const LINE_THRESHOLD = 5;

/**
 * Multiplier for detecting paragraph breaks.
 * If gap between lines exceeds lineHeight * this value, new paragraph starts.
 */
const PARA_GAP_MULTIPLIER = 1.5;

/**
 * Minimum characters for a valid paragraph.
 */
const MIN_PARAGRAPH_LENGTH = 3;

/**
 * Generate SHA-256 hash of text content.
 */
async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Represents a line of text items.
 */
interface TextLine {
  items: PDFTextItem[];
  y: number; // Average Y position
  minX: number;
  maxX: number;
  avgHeight: number;
}

/**
 * Sort text items by Y (descending, PDF Y is bottom-up) then X (ascending).
 */
function sortTextItems(items: PDFTextItem[]): PDFTextItem[] {
  return [...items].sort((a, b) => {
    const yA = a.transform[5];
    const yB = b.transform[5];
    const yDiff = yB - yA; // Descending Y (top of page first)

    // If Y positions are close, they're on the same line - sort by X
    if (Math.abs(yDiff) <= LINE_THRESHOLD) {
      return a.transform[4] - b.transform[4]; // Ascending X
    }

    return yDiff;
  });
}

/**
 * Group text items into lines based on Y position.
 */
function groupIntoLines(items: PDFTextItem[]): TextLine[] {
  if (items.length === 0) return [];

  const sorted = sortTextItems(items);
  const lines: TextLine[] = [];
  let currentLine: PDFTextItem[] = [sorted[0]];
  let currentY = sorted[0].transform[5];

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const itemY = item.transform[5];

    // Check if item is on the same line
    if (Math.abs(itemY - currentY) <= LINE_THRESHOLD) {
      currentLine.push(item);
    } else {
      // New line - save current and start fresh
      lines.push(createLine(currentLine));
      currentLine = [item];
      currentY = itemY;
    }
  }

  // Don't forget the last line
  if (currentLine.length > 0) {
    lines.push(createLine(currentLine));
  }

  return lines;
}

/**
 * Create a TextLine from a group of items.
 */
function createLine(items: PDFTextItem[]): TextLine {
  // Sort items by X position within the line
  const sortedItems = [...items].sort((a, b) => a.transform[4] - b.transform[4]);

  const ys = sortedItems.map((item) => item.transform[5]);
  const heights = sortedItems.map((item) => item.height || 12); // Default height

  // Calculate bounding values
  const minX = Math.min(...sortedItems.map((item) => item.transform[4]));
  const maxX = Math.max(
    ...sortedItems.map((item) => {
      const x = item.transform[4];
      const scale = Math.abs(item.transform[0]) || 1;
      return x + item.width * scale;
    }),
  );

  return {
    items: sortedItems,
    y: ys.reduce((a, b) => a + b, 0) / ys.length,
    minX,
    maxX,
    avgHeight: heights.reduce((a, b) => a + b, 0) / heights.length,
  };
}

/**
 * Concatenate text from a line's items.
 */
function lineToText(line: TextLine): string {
  const parts: string[] = [];

  for (let i = 0; i < line.items.length; i++) {
    const item = line.items[i];
    const str = item.str;

    if (str.trim().length === 0) {
      // Preserve explicit spaces
      if (str === ' ' && parts.length > 0) {
        // Only add space if last char isn't already a space
        const lastPart = parts[parts.length - 1];
        if (!lastPart.endsWith(' ')) {
          parts.push(' ');
        }
      }
      continue;
    }

    // Check if we need to add a space between items
    if (i > 0 && parts.length > 0) {
      const lastPart = parts[parts.length - 1];
      const prevItem = line.items[i - 1];

      // Add space if there's a gap between items and no trailing space
      if (!lastPart.endsWith(' ') && !str.startsWith(' ')) {
        const prevEnd =
          prevItem.transform[4] +
          prevItem.width * (Math.abs(prevItem.transform[0]) || 1);
        const currentStart = item.transform[4];
        const gap = currentStart - prevEnd;

        // If gap is significant (more than ~half a character width), add space
        const avgCharWidth = (prevItem.width * (Math.abs(prevItem.transform[0]) || 1)) /
          Math.max(prevItem.str.length, 1);
        if (gap > avgCharWidth * 0.3) {
          parts.push(' ');
        }
      }
    }

    parts.push(str);
  }

  return parts.join('');
}

/**
 * Group lines into paragraphs based on vertical gaps.
 */
function groupLinesIntoParagraphs(
  lines: TextLine[],
  pageNumber: number,
): Array<{ text: string; lines: TextLine[] }> {
  if (lines.length === 0) return [];

  const paragraphs: Array<{ text: string; lines: TextLine[] }> = [];
  let currentLines: TextLine[] = [lines[0]];

  for (let i = 1; i < lines.length; i++) {
    const prevLine = lines[i - 1];
    const currentLine = lines[i];

    // Calculate gap between lines (Y values decrease going down the page)
    const gap = prevLine.y - currentLine.y;
    const threshold = prevLine.avgHeight * PARA_GAP_MULTIPLIER;

    // Check for paragraph break
    const isNewParagraph = gap > threshold;

    if (isNewParagraph) {
      // Save current paragraph
      const text = currentLines.map(lineToText).join(' ').trim();
      if (text.length >= MIN_PARAGRAPH_LENGTH) {
        paragraphs.push({ text, lines: currentLines });
      }
      currentLines = [currentLine];
    } else {
      currentLines.push(currentLine);
    }
  }

  // Don't forget the last paragraph
  if (currentLines.length > 0) {
    const text = currentLines.map(lineToText).join(' ').trim();
    if (text.length >= MIN_PARAGRAPH_LENGTH) {
      paragraphs.push({ text, lines: currentLines });
    }
  }

  return paragraphs;
}

/**
 * Calculate bounding box for a paragraph from its lines.
 */
function calculateBoundingBox(lines: TextLine[], pageNumber: number): BoundingBox {
  const allMinX = Math.min(...lines.map((l) => l.minX));
  const allMaxX = Math.max(...lines.map((l) => l.maxX));
  const allMinY = Math.min(...lines.map((l) => l.y - l.avgHeight / 2));
  const allMaxY = Math.max(...lines.map((l) => l.y + l.avgHeight / 2));

  return {
    x: allMinX,
    y: allMinY,
    width: allMaxX - allMinX,
    height: allMaxY - allMinY,
    pageNumber,
  };
}

/**
 * Group text items from multiple pages into paragraphs.
 *
 * @param pageItems - Array of pages, each with items and page number
 * @returns Array of paragraphs in reading order
 */
export async function groupIntoParagraphs(
  pageItems: Array<{ items: PDFTextItem[]; pageNumber: number }>,
): Promise<PDFParagraph[]> {
  const paragraphs: PDFParagraph[] = [];
  let paragraphIndex = 0;

  for (const { items, pageNumber } of pageItems) {
    // Filter empty items
    const validItems = items.filter((item) => item.str.trim().length > 0);

    if (validItems.length === 0) continue;

    // Group into lines
    const lines = groupIntoLines(validItems);

    // Group lines into paragraphs
    const pageParagraphs = groupLinesIntoParagraphs(lines, pageNumber);

    // Create PDFParagraph objects
    for (const para of pageParagraphs) {
      const contentHash = await hashText(para.text);
      const boundingBox = calculateBoundingBox(para.lines, pageNumber);

      paragraphs.push({
        index: paragraphIndex++,
        text: para.text,
        pageNumber,
        boundingBox,
        contentHash,
      });
    }
  }

  return paragraphs;
}

/**
 * Detect if text is right-to-left based on items.
 */
export function detectTextDirection(items: PDFTextItem[]): 'ltr' | 'rtl' {
  if (items.length === 0) return 'ltr';

  const rtlCount = items.filter((item) => item.dir === 'rtl').length;
  const threshold = items.length / 2;

  return rtlCount > threshold ? 'rtl' : 'ltr';
}

/**
 * Merge adjacent paragraphs that appear to be split incorrectly.
 * Useful for handling PDFs with inconsistent line spacing.
 */
export function mergeSplitParagraphs(
  paragraphs: PDFParagraph[],
  maxMergeGap = 2,
): PDFParagraph[] {
  if (paragraphs.length <= 1) return paragraphs;

  const merged: PDFParagraph[] = [];
  let current = paragraphs[0];

  for (let i = 1; i < paragraphs.length; i++) {
    const next = paragraphs[i];

    // Check if paragraphs should be merged
    const samePage = current.pageNumber === next.pageNumber;
    const currentEndsWithLower =
      current.text.length > 0 &&
      current.text[current.text.length - 1].match(/[a-z,]/);
    const nextStartsWithLower =
      next.text.length > 0 && next.text[0].match(/[a-z]/);

    // Merge if on same page and text flows naturally
    if (samePage && currentEndsWithLower && nextStartsWithLower) {
      // Merge paragraphs
      current = {
        ...current,
        text: `${current.text} ${next.text}`,
        boundingBox: {
          x: Math.min(current.boundingBox.x, next.boundingBox.x),
          y: Math.min(current.boundingBox.y, next.boundingBox.y),
          width: Math.max(
            current.boundingBox.x + current.boundingBox.width,
            next.boundingBox.x + next.boundingBox.width,
          ) - Math.min(current.boundingBox.x, next.boundingBox.x),
          height:
            Math.max(
              current.boundingBox.y + current.boundingBox.height,
              next.boundingBox.y + next.boundingBox.height,
            ) - Math.min(current.boundingBox.y, next.boundingBox.y),
          pageNumber: current.pageNumber,
        },
        // Note: contentHash would need recalculating for merged paragraph
        contentHash: current.contentHash, // Keep original for now
      };
    } else {
      merged.push(current);
      current = next;
    }
  }

  merged.push(current);

  // Re-index merged paragraphs
  return merged.map((p, index) => ({ ...p, index }));
}
