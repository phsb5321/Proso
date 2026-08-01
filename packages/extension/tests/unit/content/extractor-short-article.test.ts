// SPDX-License-Identifier: MIT
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.

/**
 * Short-article paragraph extraction.
 *
 * Every selector branch in `extractArticleHeuristic()` requires a container
 * with more than 500 characters, so an article shorter than that falls through
 * to `extractFullPage()`, whose paragraph list comes from the content scorer.
 * While the scorer was read from a `window.Proso.contentScorer` global that
 * nothing ever assigned, that fallback returned prose with an EMPTY paragraph
 * list — the text was read aloud but nothing could be highlighted.
 *
 * @module tests/unit/content/extractor-short-article.test
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import {
  extractText,
  getExtractedParagraphs,
  getParagraphTexts,
  setExtractedParagraphs,
} from '../../../src/utils/content/extractor';

const TITLE = 'Reading Outcome Spine Fixture';
const PARAGRAPHS = [
  'Accessible reading tools should preserve attention while the spoken words remain visibly connected to the source text on the page.',
  'A reliable reader must also let people pause, resume, change speed, and move between paragraphs without ever losing their place.',
  'This third paragraph makes the fixture article long enough for the production extraction heuristic and confirms ordered navigation works.',
];

describe('article extraction below the 500-character container floor', () => {
  afterEach(() => {
    setExtractedParagraphs([]);
    document.body.replaceChildren();
  });

  it('returns highlightable paragraph elements, not just text', () => {
    document.body.innerHTML = `
      <article>
        <h1>${TITLE}</h1>
        ${PARAGRAPHS.map((text) => `<p>${text}</p>`).join('\n')}
      </article>
    `;

    // Guard the premise: if the fixture grows past the floor it stops covering
    // this path and the assertions below would pass for the wrong reason.
    const articleLength = document.querySelector('article')?.textContent?.length ?? 0;
    expect(articleLength).toBeLessThan(500);

    const text = extractText('article');
    const paragraphTexts = getParagraphTexts();

    expect(text).toContain(PARAGRAPHS[0]);
    for (const paragraph of PARAGRAPHS) {
      expect(paragraphTexts).toContain(paragraph);
    }
    expect(getExtractedParagraphs().length).toBe(paragraphTexts.length);
  });

  it('keeps paragraph texts aligned with their DOM elements', () => {
    document.body.innerHTML = `
      <article>
        <h1>${TITLE}</h1>
        ${PARAGRAPHS.map((text) => `<p>${text}</p>`).join('\n')}
      </article>
    `;

    extractText('article');

    // Highlighting indexes DOM elements by the paragraph index handed to TTS,
    // so the two lists must stay positionally identical. Assert the count
    // first: comparing two empty lists would otherwise pass vacuously.
    const elements = getExtractedParagraphs();
    const texts = getParagraphTexts();
    expect(elements.length).toBeGreaterThanOrEqual(PARAGRAPHS.length);
    expect(texts).toEqual(elements.map((el) => el.textContent?.trim() ?? ''));
  });
});
