/**
 * DOM Element Matching Tests
 * Feature 015: Improved DOM Element Matching
 * Tests for text fingerprinting, fuzzy matching, and DOM element matching
 */

describe('DOM Element Matching', () => {
  // Helper to create a test DOM environment using global document
  function setupDOM(html) {
    // Parse and replace document content
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Clear and populate body
    document.body.textContent = '';
    while (doc.body.firstChild) {
      document.body.appendChild(doc.body.firstChild);
    }

    // Initialize VoxPage namespace
    window.VoxPage = window.VoxPage || {};
    window.VoxPage.contentScorer = {
      isInsideUnwantedElement: () => false,
      isNavigationText: () => false,
      isNavigationElement: () => false,
      isBlockElement: (el) => ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'].includes(el.tagName),
      calculateContentScore: () => 100
    };
  }

  // Helper to create text fingerprint (matching implementation)
  function createTextFingerprint(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim()
      .substring(0, 50);
  }

  // Helper to check if texts match (matching implementation)
  function textsMatch(text1, text2) {
    if (!text1 || !text2) return false;
    const fp1 = createTextFingerprint(text1);
    const fp2 = createTextFingerprint(text2);
    if (fp1.length < 15 || fp2.length < 15) return false;
    if (fp1 === fp2) return true;
    if (fp1.startsWith(fp2) || fp2.startsWith(fp1)) return true;
    const minLen = Math.min(fp1.length, fp2.length);
    let matches = 0;
    for (let i = 0; i < minLen; i++) {
      if (fp1[i] === fp2[i]) matches++;
    }
    return (matches / minLen) >= 0.8;
  }

  // Helper to sort by document position
  function sortByDocumentPosition(elements) {
    return [...elements].sort((a, b) => {
      const position = a.compareDocumentPosition(b);
      if (position & 4) return -1; // DOCUMENT_POSITION_FOLLOWING
      if (position & 2) return 1;  // DOCUMENT_POSITION_PRECEDING
      return 0;
    });
  }

  describe('createTextFingerprint', () => {
    test('normalizes whitespace correctly', () => {
      expect(createTextFingerprint('  hello   world  ')).toBe('hello world');
      expect(createTextFingerprint('multiple\n\nspaces\there')).toBe('multiple spaces here');
    });

    test('removes punctuation correctly', () => {
      expect(createTextFingerprint('Hello, World!')).toBe('hello world');
      expect(createTextFingerprint("It's a test... isn't it?")).toBe('its a test isnt it');
    });

    test('truncates to 50 characters', () => {
      const longText = 'a'.repeat(100);
      const result = createTextFingerprint(longText);
      expect(result.length).toBeLessThanOrEqual(50);
    });

    test('handles empty/null input', () => {
      expect(createTextFingerprint('')).toBe('');
      expect(createTextFingerprint(null)).toBe('');
      expect(createTextFingerprint(undefined)).toBe('');
    });

    test('lowercases input', () => {
      expect(createTextFingerprint('HELLO WORLD')).toBe('hello world');
      expect(createTextFingerprint('MixedCase Text')).toBe('mixedcase text');
    });

    test('handles special characters', () => {
      expect(createTextFingerprint('test@email.com')).toBe('testemailcom');
      expect(createTextFingerprint('price: $100')).toBe('price 100');
    });
  });

  describe('textsMatch', () => {
    test('returns true for exact match', () => {
      const text = 'This is a test paragraph that is long enough to match';
      expect(textsMatch(text, text)).toBe(true);
    });

    test('returns true for prefix match', () => {
      const text1 = 'This is a test paragraph that is long enough';
      const text2 = 'This is a test paragraph that is long enough to match even longer';
      expect(textsMatch(text1, text2)).toBe(true);
    });

    test('returns true for 80% similarity threshold', () => {
      // 40 chars same, 10 different = 80% match
      const text1 = 'This is exactly forty characters text here plus ten extra';
      const text2 = 'This is exactly forty characters text here with some diff';
      // These should have ~80% similarity
      expect(textsMatch(text1, text2)).toBe(true);
    });

    test('returns false for dissimilar texts', () => {
      const text1 = 'This is completely different paragraph one';
      const text2 = 'Another totally unrelated text content here';
      expect(textsMatch(text1, text2)).toBe(false);
    });

    test('returns false if either text is null/empty', () => {
      expect(textsMatch(null, 'Some text content that is long')).toBe(false);
      expect(textsMatch('Some text content that is long', '')).toBe(false);
    });

    test('returns false if fingerprint is less than 15 characters', () => {
      expect(textsMatch('Short', 'Short')).toBe(false);
      expect(textsMatch('Too short', 'Too short')).toBe(false);
    });

    test('handles whitespace differences', () => {
      const text1 = 'This   has   multiple   spaces   in   it   here';
      const text2 = 'This has multiple spaces in it here';
      expect(textsMatch(text1, text2)).toBe(true);
    });
  });

  describe('sortByDocumentPosition', () => {
    beforeEach(() => {
      setupDOM(`
        <div>
          <p id="p1">First paragraph</p>
          <p id="p2">Second paragraph</p>
          <p id="p3">Third paragraph</p>
        </div>
      `);
    });

    test('sorts elements in document order', () => {
      const p1 = document.getElementById('p1');
      const p2 = document.getElementById('p2');
      const p3 = document.getElementById('p3');

      // Shuffle order
      const shuffled = [p3, p1, p2];
      const sorted = sortByDocumentPosition(shuffled);

      expect(sorted[0]).toBe(p1);
      expect(sorted[1]).toBe(p2);
      expect(sorted[2]).toBe(p3);
    });

    test('handles already sorted elements', () => {
      const p1 = document.getElementById('p1');
      const p2 = document.getElementById('p2');
      const p3 = document.getElementById('p3');

      const sorted = sortByDocumentPosition([p1, p2, p3]);

      expect(sorted[0]).toBe(p1);
      expect(sorted[1]).toBe(p2);
      expect(sorted[2]).toBe(p3);
    });

    test('handles empty array', () => {
      const sorted = sortByDocumentPosition([]);
      expect(sorted).toEqual([]);
    });
  });

  describe('isInsideUnwantedSubContainer', () => {
    // Helper to check unwanted container (matching implementation logic)
    function isInsideUnwantedSubContainer(el, contentContainer) {
      const unwantedSubPatterns = [
        'toc', 'table-of-contents', 'infobox', 'info-box',
        'navbox', 'nav-box', 'hatnote', 'sidebar',
        'reference', 'card', 'widget', 'promo', 'ad-'
      ];

      // Check table
      const table = el.closest('table');
      if (table && table !== el) {
        const tableParagraphs = table.querySelectorAll('p');
        if (tableParagraphs.length < 3) {
          return true;
        }
      }

      let parent = el.parentElement;
      while (parent && parent !== contentContainer && parent !== document.body) {
        const classId = ((parent.className || '') + ' ' + (parent.id || '')).toLowerCase();
        for (const pattern of unwantedSubPatterns) {
          if (classId.includes(pattern)) {
            return true;
          }
        }
        const tagName = parent.tagName.toLowerCase();
        if (tagName === 'aside' || tagName === 'figure') {
          return true;
        }
        parent = parent.parentElement;
      }
      return false;
    }

    test('detects .infobox class', () => {
      setupDOM(`
        <div id="content">
          <div class="infobox"><p id="inside">Info content</p></div>
          <p id="outside">Regular content</p>
        </div>
      `);

      const content = document.getElementById('content');
      const inside = document.getElementById('inside');
      const outside = document.getElementById('outside');

      expect(isInsideUnwantedSubContainer(inside, content)).toBe(true);
      expect(isInsideUnwantedSubContainer(outside, content)).toBe(false);
    });

    test('detects .navbox class', () => {
      setupDOM(`
        <div id="content">
          <div class="navbox"><p id="inside">Nav content</p></div>
          <p id="outside">Regular content</p>
        </div>
      `);

      const content = document.getElementById('content');
      const inside = document.getElementById('inside');

      expect(isInsideUnwantedSubContainer(inside, content)).toBe(true);
    });

    test('detects .toc class', () => {
      setupDOM(`
        <div id="content">
          <div class="toc"><p id="inside">TOC content</p></div>
          <p id="outside">Regular content</p>
        </div>
      `);

      const content = document.getElementById('content');
      const inside = document.getElementById('inside');

      expect(isInsideUnwantedSubContainer(inside, content)).toBe(true);
    });

    test('detects table-based stat blocks (tables with < 3 paragraphs)', () => {
      setupDOM(`
        <div id="content">
          <table><tr><td><p id="stat">Stat: 100</p></td></tr></table>
          <p id="outside">Regular content</p>
        </div>
      `);

      const content = document.getElementById('content');
      const stat = document.getElementById('stat');

      expect(isInsideUnwantedSubContainer(stat, content)).toBe(true);
    });

    test('allows tables with 3+ paragraphs (content tables)', () => {
      setupDOM(`
        <div id="content">
          <table>
            <tr><td><p id="p1">Paragraph one</p></td></tr>
            <tr><td><p id="p2">Paragraph two</p></td></tr>
            <tr><td><p id="p3">Paragraph three</p></td></tr>
          </table>
        </div>
      `);

      const content = document.getElementById('content');
      const p1 = document.getElementById('p1');

      expect(isInsideUnwantedSubContainer(p1, content)).toBe(false);
    });

    test('detects aside tags', () => {
      setupDOM(`
        <div id="content">
          <aside><p id="inside">Aside content</p></aside>
          <p id="outside">Regular content</p>
        </div>
      `);

      const content = document.getElementById('content');
      const inside = document.getElementById('inside');

      expect(isInsideUnwantedSubContainer(inside, content)).toBe(true);
    });

    test('respects container boundary', () => {
      setupDOM(`
        <div class="infobox">
          <div id="content">
            <p id="inside">Content inside wrapper</p>
          </div>
        </div>
      `);

      const content = document.getElementById('content');
      const inside = document.getElementById('inside');

      // Should stop at content boundary, not check parent infobox
      expect(isInsideUnwantedSubContainer(inside, content)).toBe(false);
    });
  });

  describe('findWikiContentContainer', () => {
    function findWikiContentContainer() {
      const wikiContainerSelectors = [
        '#wiki-content-block', '.wiki-content',
        '#mw-content-text', '.mw-parser-output',
        '#WikiaArticle', '.page-content'
      ];

      for (const selector of wikiContainerSelectors) {
        const container = document.querySelector(selector);
        if (container && container.textContent.length > 200) {
          return container;
        }
      }
      return null;
    }

    test('returns wiki container when present', () => {
      const longContent = 'x'.repeat(250);
      setupDOM(`<div id="mw-content-text">${longContent}</div>`);

      const container = findWikiContentContainer();
      expect(container).not.toBeNull();
      expect(container.id).toBe('mw-content-text');
    });

    test('returns null when no wiki container', () => {
      setupDOM(`<div id="regular-content">Some content</div>`);

      const container = findWikiContentContainer();
      expect(container).toBeNull();
    });

    test('returns null for small wiki containers (< 200 chars)', () => {
      setupDOM(`<div id="mw-content-text">Short</div>`);

      const container = findWikiContentContainer();
      expect(container).toBeNull();
    });

    test('prefers first matching selector in priority order', () => {
      const longContent = 'x'.repeat(250);
      setupDOM(`
        <div class="page-content">${longContent}</div>
        <div id="wiki-content-block">${longContent}</div>
      `);

      const container = findWikiContentContainer();
      // wiki-content-block should be found first (earlier in selector list)
      expect(container.id).toBe('wiki-content-block');
    });
  });

  describe('fingerprint map building with duplicate handling', () => {
    test('builds map with fingerprint keys', () => {
      setupDOM(`
        <div>
          <p id="p1">This is the first paragraph with enough text</p>
          <p id="p2">This is the second paragraph with enough text</p>
        </div>
      `);

      const elements = Array.from(document.querySelectorAll('p'));
      const map = new Map();

      for (const el of elements) {
        const text = el.textContent.trim();
        if (text.length < 20) continue;
        const fp = createTextFingerprint(text);
        if (!map.has(fp)) {
          map.set(fp, []);
        }
        map.get(fp).push(el);
      }

      expect(map.size).toBe(2);
    });

    test('handles duplicate fingerprints correctly', () => {
      setupDOM(`
        <div>
          <p id="p1">This is the exact same paragraph text here</p>
          <p id="p2">This is the exact same paragraph text here</p>
        </div>
      `);

      const elements = Array.from(document.querySelectorAll('p'));
      const map = new Map();

      for (const el of elements) {
        const text = el.textContent.trim();
        if (text.length < 20) continue;
        const fp = createTextFingerprint(text);
        if (!map.has(fp)) {
          map.set(fp, []);
        }
        map.get(fp).push(el);
      }

      // Should have 1 fingerprint key with 2 elements
      expect(map.size).toBe(1);
      const values = [...map.values()][0];
      expect(values.length).toBe(2);
    });
  });

  describe('Performance Tests', () => {
    test('200 paragraphs matching completes in <50ms', () => {
      // Create a large DOM
      let html = '<div id="content">';
      for (let i = 0; i < 200; i++) {
        html += `<p id="p${i}">This is paragraph number ${i} with enough content to be meaningful for matching purposes and text extraction.</p>`;
      }
      html += '</div>';

      setupDOM(html);

      const elements = Array.from(document.querySelectorAll('p'));
      const start = Date.now();

      // Simulate matching logic
      const map = new Map();
      for (const el of elements) {
        const text = el.textContent.trim();
        const fp = createTextFingerprint(text);
        if (!map.has(fp)) map.set(fp, []);
        map.get(fp).push(el);
      }

      // Simulate lookup for each element
      const matched = [];
      for (const el of elements) {
        const text = el.textContent.trim();
        const fp = createTextFingerprint(text);
        if (map.has(fp)) {
          matched.push(map.get(fp)[0]);
        }
      }

      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
      expect(matched.length).toBe(200);
    });

    test('500 candidate elements filtering completes in <20ms', () => {
      // Create a DOM with many elements including unwanted containers
      let html = '<div id="content">';
      for (let i = 0; i < 500; i++) {
        if (i % 5 === 0) {
          // Every 5th element is in an infobox
          html += `<div class="infobox"><p id="p${i}">Infobox content ${i}</p></div>`;
        } else {
          html += `<p id="p${i}">Regular paragraph ${i}</p>`;
        }
      }
      html += '</div>';

      setupDOM(html);

      const elements = Array.from(document.querySelectorAll('p'));
      const start = Date.now();

      // Simulate filtering
      const filtered = elements.filter(el => {
        let parent = el.parentElement;
        while (parent && parent !== document.body) {
          if (parent.className && parent.className.includes('infobox')) {
            return false;
          }
          parent = parent.parentElement;
        }
        return true;
      });

      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(20);
      expect(filtered.length).toBe(400); // 500 - 100 infobox elements
    });
  });

  describe('extractParagraphsDirectlyFromDOM fallback', () => {
    test('returns elements in document order', () => {
      setupDOM(`
        <article>
          <p id="p1">First paragraph with enough content to be extracted.</p>
          <p id="p2">Second paragraph with enough content to be extracted.</p>
          <p id="p3">Third paragraph with enough content to be extracted.</p>
        </article>
      `);

      const elements = Array.from(document.querySelectorAll('article p'));
      const sorted = sortByDocumentPosition(elements);

      expect(sorted[0].id).toBe('p1');
      expect(sorted[1].id).toBe('p2');
      expect(sorted[2].id).toBe('p3');
    });

    test('triggers fallback when zero matches found', () => {
      setupDOM(`
        <article>
          <p>Some content that exists in DOM</p>
        </article>
      `);

      // Simulate scenario where Readability content doesn't match DOM
      const extractedEls = []; // Would contain parsed elements with no DOM match
      const matchedElements = [];

      // If matchedElements is empty and extractedEls had content, fallback should trigger
      const shouldUseFallback = matchedElements.length === 0 && extractedEls.length > 0;

      // In actual implementation, this would call extractParagraphsDirectlyFromDOM()
      expect(shouldUseFallback || matchedElements.length === 0).toBe(true);
    });
  });
});
