// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  HOVERABLE_CLASS,
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
