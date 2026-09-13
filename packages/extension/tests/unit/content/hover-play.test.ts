// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  HOVERABLE_CLASS,
  hasUnmarkedProse,
  isAmbientExtractionCandidate,
  markHoverAffordance,
  shouldIgnoreParagraphClick,
} from '../../../src/utils/content/hover-play';

describe('isAmbientExtractionCandidate', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('rejects a page with no body', () => {
    const empty = { body: null } as unknown as Document;
    expect(isAmbientExtractionCandidate(empty)).toBe(false);
  });

  it('rejects a text-poor page (login shell)', () => {
    document.body.innerHTML = '<p>Sign in</p>';
    expect(isAmbientExtractionCandidate(document)).toBe(false);
  });

  it('accepts a text-rich article page', () => {
    const paragraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(5);
    document.body.innerHTML = `<main><p>${paragraph}</p><p>${paragraph}</p></main>`;
    expect(isAmbientExtractionCandidate(document)).toBe(true);
  });

  it('rejects script and style payloads without readable prose', () => {
    const payload = 'x'.repeat(1_000);
    document.body.innerHTML = `<script>${payload}</script><style>${payload}</style><p>Sign in</p>`;
    expect(isAmbientExtractionCandidate(document)).toBe(false);
  });

  it('rejects navigation prose that is not reading content', () => {
    const navigation = 'Navigation item with enough repeated text to cross the threshold. '.repeat(
      10,
    );
    document.body.innerHTML = `<nav><p>${navigation}</p></nav><main><p>Sign in</p></main>`;
    expect(isAmbientExtractionCandidate(document)).toBe(false);
  });
});

describe('markHoverAffordance', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('marks every paragraph with the hover class', () => {
    document.body.innerHTML = '<main><p id="a">one</p><p id="b">two</p></main>';
    const paragraphs = [...document.querySelectorAll('p')];

    const marked = markHoverAffordance(paragraphs);

    expect(marked).toBe(2);
    expect(document.getElementById('a')?.classList.contains(HOVERABLE_CLASS)).toBe(true);
    expect(document.getElementById('b')?.classList.contains(HOVERABLE_CLASS)).toBe(true);
  });

  it('does not duplicate the class or touch other attributes', () => {
    document.body.innerHTML = '<p id="a" class="keep">one</p>';
    const paragraph = document.getElementById('a') as Element;

    markHoverAffordance([paragraph]);
    const afterFirst = paragraph.className;
    markHoverAffordance([paragraph]);

    expect(afterFirst).toContain('keep');
    expect(paragraph.className).toBe(afterFirst);
  });
});

describe('shouldIgnoreParagraphClick', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('ignores clicks on a link inside a paragraph', () => {
    document.body.innerHTML = '<p>read <a id="link" href="/x">more</a></p>';
    const target = document.getElementById('link') as Element;
    expect(shouldIgnoreParagraphClick(target, null)).toBe(true);
  });

  it('ignores clicks on buttons and form controls', () => {
    document.body.innerHTML = '<p><button id="btn">go</button><input id="in"/></p>';
    for (const id of ['btn', 'in']) {
      const target = document.getElementById(id) as Element;
      expect(shouldIgnoreParagraphClick(target, null)).toBe(true);
    }
  });

  it('honors explicit contenteditable state', () => {
    document.body.innerHTML =
      '<p><span id="editable" contenteditable="true">edit</span>' +
      '<span id="static" contenteditable="false">read</span></p>';
    expect(shouldIgnoreParagraphClick(document.getElementById('editable') as Element, null)).toBe(
      true,
    );
    expect(shouldIgnoreParagraphClick(document.getElementById('static') as Element, null)).toBe(
      false,
    );
  });

  it('ignores the terminating click of a drag text-selection', () => {
    document.body.innerHTML = '<p id="p">some prose</p>';
    const target = document.getElementById('p') as Element;
    const selection = { isCollapsed: false };
    expect(shouldIgnoreParagraphClick(target, selection as unknown as Selection)).toBe(true);
  });

  it('allows a plain click on paragraph text with a collapsed selection', () => {
    document.body.innerHTML = '<p id="p">some prose</p>';
    const target = document.getElementById('p') as Element;
    expect(shouldIgnoreParagraphClick(target, { isCollapsed: true } as unknown as Selection)).toBe(
      false,
    );
    expect(shouldIgnoreParagraphClick(target, null)).toBe(false);
  });
});

describe('hasUnmarkedProse', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  /** A MutationRecord is only read for `addedNodes` here. */
  const added = (...nodes: Node[]): MutationRecord[] =>
    [{ addedNodes: nodes as unknown as NodeList }] as unknown as MutationRecord[];

  it('is false for an empty batch', () => {
    expect(hasUnmarkedProse([])).toBe(false);
  });

  it('is true for a routed article the affordance has not reached', () => {
    const article = document.createElement('div');
    article.innerHTML = '<p>A paragraph a client-side router just brought in.</p>';
    expect(hasUnmarkedProse(added(article))).toBe(true);
  });

  it('is true for a bare prose element added on its own', () => {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Appended directly to the article.';
    expect(hasUnmarkedProse(added(paragraph))).toBe(true);
  });

  it('is false once every added paragraph is already marked', () => {
    const article = document.createElement('div');
    article.innerHTML = `<p class="${HOVERABLE_CLASS}">Already hoverable.</p>`;
    expect(hasUnmarkedProse(added(article))).toBe(false);
  });

  it('is false for the word spans the highlighter writes while reading', () => {
    const paragraph = document.createElement('p');
    paragraph.className = HOVERABLE_CLASS;
    const word = document.createElement('span');
    word.className = 'proso-w';
    paragraph.appendChild(word);
    expect(hasUnmarkedProse(added(word))).toBe(false);
  });

  it('is false for text nodes and other non-elements', () => {
    expect(hasUnmarkedProse(added(document.createTextNode('bare text')))).toBe(false);
  });
});
