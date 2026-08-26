// SPDX-License-Identifier: MIT
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.

/**
 * List items belong to the article the reader hears.
 *
 * An article that introduces a list and then prints it — "The data engineering
 * lifecycle:" followed by Generate, Store, Ingest, Transform, Serve — was read
 * as if the list were not there: the lead-in paragraph, then the paragraph
 * AFTER the list. The reader announced "all five stages" without ever speaking
 * the five, because `<li>` was absent from the ordered candidate query and the
 * separate list pass dropped anything under 30 characters. A one-word list
 * item is the normal case, not an anomaly, so length cannot be the filter.
 *
 * The guard that replaces it is structural, and the second half of this file
 * is what stops the fix from over-correcting: navigation, footers and
 * link-saturated index lists are overwhelmingly `<li>` too, and none of them
 * may reach the reader. Threshold provenance:
 * `specs/210-reader-reads-lists/research.md`.
 *
 * @module tests/unit/content/extractor-list-items.test
 * @feature 210-reader-reads-lists
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import {
  extractText,
  getParagraphTexts,
  setExtractedParagraphs,
} from '../../../src/utils/content/extractor';

/** The screenshot's shape: heading, lead-in ending in a colon, list, paragraph. */
const LEAD_IN =
  'The core of this book was always two things stacked on top of each other. The data engineering lifecycle:';
const STAGES = ['Generate', 'Store', 'Ingest', 'Transform', 'Serve'];
const AFTER =
  'And the undercurrents running underneath all five stages, which is where most of the real work actually happens in practice.';
const FILLER =
  'This paragraph exists so the article container clears the five-hundred-character floor that every selector branch in the heuristic extractor requires before it will accept a container at all.';

const NAV_ITEMS = ['Home', 'Guides', 'Archive', 'About', 'Contact'];
const FOOTER_ITEMS = ['Privacy policy', 'Terms of use', 'Cookie settings'];

function articleBody(inner: string): string {
  return `
    <nav aria-label="Primary">
      <ul>${NAV_ITEMS.map((t) => `<li><a href="/${t.toLowerCase()}">${t}</a></li>`).join('')}</ul>
    </nav>
    <article>
      <h1>The data engineering lifecycle</h1>
      ${inner}
    </article>
    <footer>
      <ul>${FOOTER_ITEMS.map((t) => `<li><a href="/${t}">${t}</a></li>`).join('')}</ul>
    </footer>
  `;
}

const PROSE_LIST_ARTICLE = articleBody(`
  <p>${LEAD_IN}</p>
  <ul>${STAGES.map((t) => `<li>${t}</li>`).join('')}</ul>
  <p>${AFTER}</p>
  <p>${FILLER}</p>
`);

describe('article extraction of list items', () => {
  afterEach(() => {
    setExtractedParagraphs([]);
    document.body.replaceChildren();
  });

  it('reads a prose list, in document order, between the paragraphs around it', () => {
    document.body.innerHTML = PROSE_LIST_ARTICLE;

    // Guard the premise: below 500 characters the container branch never runs
    // and this would exercise a different extraction path than the reader's.
    expect(document.querySelector('article')?.textContent?.length ?? 0).toBeGreaterThan(500);

    extractText('article');
    const texts = getParagraphTexts();

    for (const stage of STAGES) {
      expect(texts).toContain(stage);
    }

    // Order is the actual symptom: appending list items after the paragraphs
    // would satisfy `toContain` while still reading the article wrong.
    const leadIn = texts.findIndex((t) => t.includes('The data engineering lifecycle:'));
    const after = texts.findIndex((t) => t.startsWith('And the undercurrents'));
    expect(leadIn).toBeGreaterThanOrEqual(0);
    expect(after).toBeGreaterThan(leadIn);
    expect(texts.slice(leadIn + 1, after)).toEqual(STAGES);
  });

  it('leaves navigation and footer list items unread', () => {
    document.body.innerHTML = PROSE_LIST_ARTICLE;

    extractText('article');
    const texts = getParagraphTexts();

    for (const item of [...NAV_ITEMS, ...FOOTER_ITEMS]) {
      expect(texts).not.toContain(item);
    }
  });

  it('leaves a link-saturated index list inside the article unread', () => {
    // "Related posts" and tag clouds sit in the content flow, carry no landmark
    // and are not short — only their link density tells them apart from prose.
    const related = ['Ingestion patterns for slow sources', 'A storage layer that survives growth'];
    document.body.innerHTML = articleBody(`
      <p>${LEAD_IN}</p>
      <ul>${STAGES.map((t) => `<li>${t}</li>`).join('')}</ul>
      <p>${AFTER}</p>
      <p>${FILLER}</p>
      <ul class="post-related">
        ${related.map((t) => `<li><a href="/p/${t.length}">${t}</a></li>`).join('')}
      </ul>
    `);

    extractText('article');
    const texts = getParagraphTexts();

    for (const stage of STAGES) {
      expect(texts).toContain(stage);
    }
    for (const item of related) {
      expect(texts).not.toContain(item);
    }
  });

  it('reads a list whose items carry an occasional inline link', () => {
    // The complement of the test above: a prose list is still prose when one
    // item links a term. A guard tuned tight enough to drop this one would
    // take genuine article content with it.
    const linked = [
      'Generate — the source systems the team does not own',
      'Store — see <a href="/storage">object storage</a> for the durable layer',
      'Serve — dashboards, models, and reverse ETL back into production',
    ];
    document.body.innerHTML = articleBody(`
      <p>${LEAD_IN}</p>
      <ul>${linked.map((t) => `<li>${t}</li>`).join('')}</ul>
      <p>${FILLER}</p>
    `);

    extractText('article');
    const texts = getParagraphTexts();

    expect(texts.some((t) => t.startsWith('Generate — the source systems'))).toBe(true);
    expect(texts.some((t) => t.startsWith('Store — see object storage'))).toBe(true);
  });

  it('reads the items of a nested list once, not twice', () => {
    // A wrapper `<li>` whose whole text is its sublist would be read first and
    // then repeated item by item.
    document.body.innerHTML = articleBody(`
      <p>${LEAD_IN}</p>
      <ul><li><ul>${STAGES.map((t) => `<li>${t}</li>`).join('')}</ul></li></ul>
      <p>${FILLER}</p>
    `);

    // Under the 500-character floor on purpose: this case covers the full-page
    // walker, the other path a reader reaches with a short article.
    expect(document.querySelector('article')?.textContent?.length ?? 0).toBeLessThan(500);

    extractText('article');
    const texts = getParagraphTexts();

    for (const stage of STAGES) {
      expect(texts).toContain(stage);
    }
    expect(texts).not.toContain(STAGES.join(''));
  });
});
