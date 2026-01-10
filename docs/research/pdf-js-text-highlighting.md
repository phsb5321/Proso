# PDF.js Text Layer and Highlighting Research

**Agent 3: PDF.js + Highlighting Researcher**
**Date:** 2026-01-09

## Executive Summary

This document provides comprehensive research on PDF.js text layer architecture and strategies for robust text highlighting in Firefox's built-in PDF viewer. Based on analysis of PDF.js source code and VoxPage's current implementation, this research identifies both opportunities and limitations for paragraph/word-level highlighting.

---

## 1. PDF.js Text Layer Architecture

### 1.1 How PDF.js Renders the Text Layer

PDF.js creates a **text layer** that overlays the rendered canvas, enabling text selection and search. The architecture consists of:

**Key Components:**

| Component | File | Purpose |
|-----------|------|---------|
| `TextLayer` | `src/display/text_layer.js` | Core class that processes text content and creates DOM spans |
| `TextLayerBuilder` | `web/text_layer_builder.js` | Builds and manages the text layer for each page |
| `TextHighlighter` | `web/text_highlighter.js` | Handles find/search highlighting |
| `PDFFindController` | `web/pdf_find_controller.js` | Search and match management |

**Rendering Flow:**

```
PDFPageProxy.getTextContent()
        ↓
   TextContent { items[], styles{} }
        ↓
   TextLayer.render()
        ↓
   DOM: div.textLayer > span (per text item)
```

**Source Reference:** `mozilla/pdf.js/src/display/text_layer.js`

```javascript
// Each text item becomes a span with positioning via CSS transforms
const textDiv = document.createElement("span");
textDiv.textContent = geom.str;
textDiv.dir = geom.dir;
divStyle.left = `${((100 * left) / this.#pageWidth).toFixed(2)}%`;
divStyle.top = `${((100 * top) / this.#pageHeight).toFixed(2)}%`;
```

### 1.2 Span Structure and Text Fragmentation

**Key Finding:** PDF.js creates **one `<span>` per text item** from the PDF content stream, NOT per word or paragraph.

The fragmentation depends on:
- PDF creation software behavior
- Font changes within text
- Kerning/spacing adjustments
- Text positioning commands in PDF

**Typical DOM Structure:**

```html
<div class="textLayer">
  <span style="left: 5.21%; top: 3.47%; --font-height: 12px;">The </span>
  <span style="left: 8.12%; top: 3.47%; --font-height: 12px;">quick </span>
  <span style="left: 12.34%; top: 3.47%; --font-height: 12px;">brown </span>
  <span style="left: 17.89%; top: 3.47%; --font-height: 12px;">fox</span>
  <!-- Often a single word is split across multiple spans! -->
</div>
```

**Critical Issue:** A single word like "highlighting" might be split into:
- `"high"` (one span)
- `"lighting"` (another span)

This happens due to:
1. PDF internal text positioning commands
2. Kerning adjustments
3. Font substitution mid-word

### 1.3 Text Layer Virtualization

**Finding:** PDF.js does **NOT** virtualize text layer spans within a page. However:

- Pages are lazily rendered (only visible pages have text layers)
- Maximum of `100,000` text divs per page (hardcoded limit)
- Text layers are destroyed when pages are hidden

**Source Reference:**
```javascript
const MAX_TEXT_DIVS_TO_RENDER = 100000;
// ...
if (textDivs.length > MAX_TEXT_DIVS_TO_RENDER) {
  warn("Ignoring additional textDivs for performance reasons.");
  this.#disableProcessItems = true;
  return;
}
```

### 1.4 Page Rendering Lifecycle

```
Page becomes visible
        ↓
pdfPage.render() - Canvas rendering
        ↓
textLayerBuilder.render() - Text layer creation
        ↓
TextLayer streams textContentSource
        ↓
Spans appended to DOM progressively
        ↓
endOfContent div appended
        ↓
highlighter.enable() called
```

**Important:** Text layer rendering is **asynchronous** and may complete after canvas rendering.

---

## 2. Text Matching Challenges

### 2.1 Why Text is Split Across Multiple Spans

PDFs store text as **positioned character sequences**, not semantic words. A PDF authoring tool might emit:

```
BT
/F1 12 Tf
100 700 Td
(The qu) Tj
2.5 0 Td
(ick brown) Tj
ET
```

This creates two text items with a 2.5-unit gap between them, resulting in:
- Span 1: "The qu"
- Span 2: "ick brown"

**Causes:**
1. **Kerning:** Precise letter positioning
2. **Justified text:** Space adjustments
3. **Ligatures:** Font substitutions
4. **PDF generators:** LibreOffice, Word, etc. have different behaviors
5. **Copy-paste artifacts:** Complex layouts

### 2.2 Whitespace Normalization Issues

**PDF.js Approach:**
```javascript
// From pdf_find_controller.js
normalized = text.normalize("NFD");
// Newlines replaced with spaces
// Multiple spaces collapsed
```

**VoxPage's Current Approach:**
```javascript
// From pdf-highlight.ts
function normalizeText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}
```

**Recommendation:** Use **NFKC** (Compatibility Composition) rather than NFD for matching, as it:
- Collapses ligatures (ﬁ → fi)
- Normalizes fullwidth characters
- Handles more edge cases

### 2.3 Unicode Normalization

PDF.js uses extensive Unicode handling in `pdf_find_controller.js`:

```javascript
const CHARACTERS_TO_NORMALIZE = {
  "\u2010": "-", // Hyphen
  "\u2018": "'", // Left single quotation mark
  "\u2019": "'", // Right single quotation mark
  "\u201C": '"', // Left double quotation mark
  "\u201D": '"', // Right double quotation mark
  "\u00BC": "1/4", // Vulgar fraction one quarter
  // ... many more
};
```

**Recommendation:** VoxPage should adopt similar normalization for robust matching.

### 2.4 Font Substitution Effects on Text

When fonts are substituted:
- Glyph widths may differ
- Character ordering may change (ligatures)
- Some characters may be missing

**Impact on Highlighting:**
- Bounding boxes calculated from original font may not match rendered text
- Character offsets may be incorrect

---

## 3. Robust Matching Strategies

### 3.1 Current VoxPage Implementation Analysis

**Location:** `src/utils/content/pdf-highlight.ts`

**Approach:** Sliding window with prefix fallback

```javascript
// Current algorithm:
// 1. Iterate through all spans in all text layers
// 2. Accumulate text into runningText
// 3. Check if normalizedParagraph is contained in normalizedRunning
// 4. If window gets too large, slide it forward
```

**Strengths:**
- Handles text spanning multiple spans
- Fuzzy matching via normalization
- Prefix fallback for partial matches

**Weaknesses:**
- O(n*m) complexity where n=spans, m=paragraph length
- No early termination on page boundaries
- May match wrong location if text appears multiple times
- Does not use bounding box information

### 3.2 Recommended Sliding Window Algorithm

```typescript
interface SpanMatch {
  spans: HTMLSpanElement[];
  startIndex: number;  // Character offset in first span
  endIndex: number;    // Character offset in last span
  confidence: number;  // 0-1 match quality
}

function findMatchingSpans(
  paragraphText: string,
  pageNumber: number,
  boundingBox?: BoundingBox
): SpanMatch | null {
  const textLayer = getTextLayerForPage(pageNumber);
  if (!textLayer) return null;
  
  const normalizedTarget = normalizeForSearch(paragraphText);
  const spans = Array.from(textLayer.querySelectorAll('span'));
  
  // Build character-to-span index
  const charMap: Array<{span: HTMLSpanElement; localOffset: number}> = [];
  for (const span of spans) {
    const text = span.textContent || '';
    for (let i = 0; i < text.length; i++) {
      charMap.push({ span, localOffset: i });
    }
  }
  
  // Concatenate and normalize all text
  const fullText = spans.map(s => s.textContent || '').join('');
  const normalizedFull = normalizeForSearch(fullText);
  
  // Find match position
  const matchIndex = normalizedFull.indexOf(normalizedTarget);
  if (matchIndex === -1) {
    return fuzzyMatch(normalizedTarget, normalizedFull, charMap);
  }
  
  // Map back to spans
  const matchEnd = matchIndex + normalizedTarget.length;
  const matchedSpans = new Set<HTMLSpanElement>();
  for (let i = matchIndex; i < matchEnd && i < charMap.length; i++) {
    matchedSpans.add(charMap[i].span);
  }
  
  return {
    spans: Array.from(matchedSpans),
    startIndex: charMap[matchIndex]?.localOffset ?? 0,
    endIndex: charMap[matchEnd - 1]?.localOffset ?? 0,
    confidence: 1.0
  };
}
```

### 3.3 Fuzzy Matching Approaches

For OCR'd or poorly structured PDFs:

**Option 1: Levenshtein Distance**
```typescript
function fuzzyMatch(target: string, source: string, threshold = 0.85): number {
  // Find best matching substring using sliding window + edit distance
  const targetLen = target.length;
  let bestScore = 0;
  let bestIndex = -1;
  
  for (let i = 0; i <= source.length - targetLen; i++) {
    const substr = source.substring(i, i + targetLen);
    const distance = levenshteinDistance(target, substr);
    const similarity = 1 - (distance / targetLen);
    if (similarity > bestScore) {
      bestScore = similarity;
      bestIndex = i;
    }
  }
  
  return bestScore >= threshold ? bestIndex : -1;
}
```

**Option 2: N-gram Matching**
```typescript
function ngramMatch(target: string, source: string, n = 3): number {
  const targetGrams = new Set(ngrams(target, n));
  const sourceGrams = ngrams(source, n);
  
  // Jaccard similarity
  let matches = 0;
  for (const gram of sourceGrams) {
    if (targetGrams.has(gram)) matches++;
  }
  
  return matches / targetGrams.size;
}
```

**Recommendation:** Use exact matching first, fall back to fuzzy only when needed. Fuzzy matching is expensive.

### 3.4 Handling Multi-Page Content

**Challenge:** Paragraphs may span page boundaries.

**Current VoxPage Approach:** Paragraphs are extracted per-page, so each paragraph has a single `pageNumber`.

**Recommendation:** 
1. Keep current paragraph-per-page boundary
2. For highlighting, focus on the page where paragraph starts
3. If paragraph continues to next page, accept partial highlighting

### 3.5 Performance Considerations

| Document Size | Spans (est.) | Recommended Approach |
|---------------|--------------|---------------------|
| < 10 pages | < 5,000 | Full DOM traversal OK |
| 10-100 pages | 5,000-50,000 | Page-targeted search |
| > 100 pages | > 50,000 | Index + lazy matching |

**Performance Optimizations:**

1. **Pre-compute text index** when PDF is loaded:
```typescript
interface PageTextIndex {
  fullText: string;
  normalizedText: string;
  spanOffsets: number[]; // Starting char offset of each span
}
```

2. **Target specific page** using bounding box:
```typescript
if (boundingBox?.pageNumber) {
  // Only search that page's text layer
  const textLayer = document.querySelector(
    `.page[data-page-number="${boundingBox.pageNumber}"] .textLayer`
  );
}
```

3. **Use requestIdleCallback** for non-critical highlighting updates.

---

## 4. Fallback Behavior

### 4.1 When Text Layer is Missing

**Detection:**
```typescript
function hasTextLayer(): boolean {
  return document.querySelector('.textLayer span') !== null;
}
```

**Causes:**
- Page not yet rendered (lazy loading)
- Scanned PDF without OCR
- Image-only PDF

**Fallback Strategy:**
```typescript
if (!hasTextLayer()) {
  // Option 1: Use canvas overlay highlighting (draw rectangle)
  highlightWithCanvasOverlay(boundingBox);
  
  // Option 2: Scroll to page and show visual indicator
  scrollToPage(boundingBox.pageNumber);
  showPageIndicator(boundingBox.pageNumber);
  
  // Option 3: Wait for text layer to appear
  observeTextLayerAppearance(boundingBox.pageNumber, () => {
    highlightPDFParagraph(text, index);
  });
}
```

### 4.2 OCR'd PDFs with Poor Text Quality

**Detection (already in VoxPage):**
```typescript
const SCANNED_THRESHOLD_CHARS_PER_PAGE = 100;
const isScanned = avgCharsPerPage < SCANNED_THRESHOLD_CHARS_PER_PAGE;
```

**Characteristics:**
- Text exists but quality varies
- Character recognition errors (l vs 1, O vs 0)
- Word spacing issues
- Missing punctuation

**Recommendations:**
1. Lower matching threshold for OCR'd PDFs
2. Use phonetic/fuzzy matching
3. Fall back to bounding box highlighting when text matching fails
4. Consider showing "approximate match" indicator

### 4.3 Scanned PDFs Without Text Layer

**Assessment: NOT FEASIBLE for browser extension**

**Options:**

| Option | Feasibility | Notes |
|--------|-------------|-------|
| Browser OCR (tesseract.js) | Low | Too slow, high memory |
| Server-side OCR | Medium | Requires backend infrastructure |
| User instruction | High | Inform user to use OCR'd version |
| Bounding box only | High | Highlight approximate region |

**Recommended Fallback:**
```typescript
if (isScannedWithoutText) {
  // Inform user
  showNotification(
    'This PDF appears to be scanned. Text highlighting may be limited. ' +
    'For best results, use a PDF with searchable text.'
  );
  
  // Use bounding box overlay
  highlightBoundingBox(paragraph.boundingBox);
}
```

### 4.4 Complex Layouts (Multi-Column, Tables)

**Challenges:**
- Reading order unclear
- Columns may interleave at line level
- Tables have non-linear text flow

**PDF.js Behavior:**
- Returns text in PDF content stream order
- May not match visual reading order

**VoxPage's Current Handling:**
- Paragraph grouper uses Y-position gaps
- Works well for single-column
- May create incorrect paragraph breaks for multi-column

**Recommendations:**
1. Detect multi-column layout (analyze X-position distribution)
2. For tables, consider each cell a potential paragraph
3. Accept some paragraph boundary inaccuracy in complex layouts
4. Use bounding box for scroll-to-paragraph even if text match fails

---

## 5. Word-Level Highlighting Feasibility

### 5.1 Challenges with Word Boundaries in PDF.js

**Critical Challenge:** PDF.js spans do NOT correspond to words.

Example: "The quick brown fox" might be:
```html
<span>The qui</span><span>ck brown fo</span><span>x</span>
```

**Word boundary detection requires:**
1. Concatenating all span text
2. Tokenizing into words
3. Mapping word positions back to spans
4. Handling words that span multiple spans

### 5.2 Character-Level vs Word-Level Granularity

| Approach | Accuracy | Performance | Complexity |
|----------|----------|-------------|------------|
| Span-level | Low | High | Low |
| Word-level | Medium | Medium | Medium |
| Character-level | High | Low | High |

**For TTS word highlighting with timestamps:**
- Need character offsets from TTS provider
- Map offsets to DOM positions
- Update highlight in real-time

### 5.3 CSS Custom Highlight API Compatibility

**Browser Support:**
- Firefox: Supported (≥120)
- Chrome: Supported (≥105)
- Safari: Supported (≥16.4)

**Feasibility: HIGH**

**Implementation Pattern:**
```typescript
// Already used in VoxPage's highlight.ts
if (typeof CSS !== 'undefined' && typeof (CSS as any).highlights !== 'undefined') {
  const range = document.createRange();
  range.setStart(textNode, charOffset);
  range.setEnd(textNode, charOffset + charLength);
  
  const highlight = new Highlight(range);
  CSS.highlights.set('voxpage-word', highlight);
}
```

**CSS Styling:**
```css
::highlight(voxpage-word) {
  background-color: var(--voxpage-word-highlight-color, #ffeb3b);
  color: inherit;
}
```

### 5.4 Performance Impact

**Concerns:**
- Creating Range objects for every word: O(n) per paragraph
- Updating CSS.highlights frequently during playback
- TreeWalker traversal for multi-span words

**Benchmarks (estimated):**
- 100-word paragraph: < 5ms to create all ranges
- Highlight update: < 1ms
- Full paragraph re-highlight: < 10ms

**Assessment: FEASIBLE** with proper implementation

### 5.5 Recommended Word Highlighting Strategy

```typescript
interface WordHighlightManager {
  // Pre-compute word positions when paragraph is highlighted
  prepareWordHighlighting(paragraphSpans: HTMLSpanElement[]): void;
  
  // Called during TTS playback with character offset
  highlightWordAtOffset(charOffset: number, charLength: number): void;
  
  // Clear current word highlight
  clearWordHighlight(): void;
}

class PDFWordHighlighter implements WordHighlightManager {
  private wordMap: Map<number, Range> = new Map();
  private currentRange: Range | null = null;
  
  prepareWordHighlighting(spans: HTMLSpanElement[]): void {
    // Build full text and character-to-node mapping
    const textNodes: Array<{node: Text; start: number; end: number}> = [];
    let offset = 0;
    
    for (const span of spans) {
      const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
      let node: Text | null;
      while ((node = walker.nextNode() as Text)) {
        const len = node.textContent?.length || 0;
        textNodes.push({ node, start: offset, end: offset + len });
        offset += len;
      }
    }
    
    // Store for later lookup
    this.textNodes = textNodes;
  }
  
  highlightWordAtOffset(charOffset: number, charLength: number): void {
    const range = this.createRangeForOffset(charOffset, charLength);
    if (!range) return;
    
    if (CSS.highlights) {
      CSS.highlights.set('voxpage-word', new Highlight(range));
    }
  }
}
```

---

## 6. Pagination and Scroll

### 6.1 How to Handle Page Changes

**PDF.js Page Structure:**
```html
<div id="viewer" class="pdfViewer">
  <div class="page" data-page-number="1">
    <canvas class="canvasWrapper"></canvas>
    <div class="textLayer">...</div>
  </div>
  <div class="page" data-page-number="2">...</div>
</div>
```

**Page Change Detection:**
```typescript
// Option 1: MutationObserver on textLayer
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      // Text layer appeared - re-attempt highlighting
      onTextLayerReady(pageNumber);
    }
  }
});

// Option 2: IntersectionObserver on pages
const pageObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      const pageNum = entry.target.getAttribute('data-page-number');
      onPageVisible(parseInt(pageNum, 10));
    }
  }
});
```

### 6.2 Lazy Page Rendering Effects

**Behavior:**
- Only visible pages (+ small buffer) have text layers
- Scrolling reveals new pages, destroying old ones
- Text layer may appear AFTER canvas

**Impact on VoxPage:**
- Cannot highlight text on non-rendered pages
- Must wait for text layer before highlighting
- Need to re-highlight if user scrolls away and back

**Strategy:**
```typescript
async function ensurePageRendered(pageNumber: number): Promise<void> {
  const page = document.querySelector(`.page[data-page-number="${pageNumber}"]`);
  if (!page) return;
  
  // Check if text layer exists
  const textLayer = page.querySelector('.textLayer');
  if (textLayer && textLayer.children.length > 0) {
    return; // Already rendered
  }
  
  // Scroll page into view to trigger rendering
  page.scrollIntoView({ block: 'center' });
  
  // Wait for text layer to appear
  await new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (page.querySelector('.textLayer span')) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(page, { childList: true, subtree: true });
    
    // Timeout after 5 seconds
    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, 5000);
  });
}
```

### 6.3 Scroll-to-Paragraph Behavior

**Current VoxPage Implementation:**
```typescript
export function scrollToPDFHighlight(): void {
  const firstHighlight = document.querySelector(`.${PDF_HIGHLIGHT_CLASS}`);
  if (firstHighlight) {
    firstHighlight.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }
}
```

**Improvement Recommendations:**

1. **Use bounding box for initial scroll** (before text layer available):
```typescript
function scrollToPagePosition(pageNumber: number, yPosition: number): void {
  const page = document.querySelector(`.page[data-page-number="${pageNumber}"]`);
  if (!page) return;
  
  const pageRect = page.getBoundingClientRect();
  const targetY = pageRect.top + (yPosition * page.clientHeight);
  
  window.scrollTo({
    top: window.scrollY + targetY - window.innerHeight / 2,
    behavior: 'smooth'
  });
}
```

2. **Handle fixed headers** (PDF viewer toolbar):
```css
.textLayer span.voxpage-highlight {
  scroll-margin-top: 60px; /* Height of PDF viewer toolbar */
}
```

3. **Respect reduced motion preference:**
```typescript
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
element.scrollIntoView({
  behavior: prefersReducedMotion ? 'instant' : 'smooth',
  block: 'center'
});
```

### 6.4 Large Document Handling

**Challenges:**
- 500+ page documents common
- Memory pressure from pre-computed indices
- Slow initial scan

**Strategies:**

1. **On-demand paragraph extraction:**
   - Only extract visible pages + buffer
   - Lazy-extract as user scrolls
   
2. **Paragraph index persistence:**
   - Store extracted paragraphs in IndexedDB
   - Keyed by PDF URL hash
   - Invalidate when PDF changes

3. **Progressive loading:**
   - Start TTS with first N pages
   - Extract more pages during playback
   - Handle page boundary crossings

---

## 7. Specific Recommendations for VoxPage

### 7.1 Improvements to `pdf-highlight.ts`

**Priority 1: Use Page Targeting**
```typescript
export function highlightPDFParagraph(
  paragraphText: string,
  paragraphIndex: number,
  boundingBox?: BoundingBox  // Add this parameter
): HTMLElement | null {
  // Target specific page if bounding box available
  const targetPage = boundingBox?.pageNumber;
  const textLayers = targetPage 
    ? [document.querySelector(`.page[data-page-number="${targetPage}"] .textLayer`)]
    : Array.from(document.querySelectorAll('.textLayer'));
  // ...
}
```

**Priority 2: Pre-compute Character Offsets**
```typescript
interface SpanInfo {
  span: HTMLSpanElement;
  text: string;
  normalizedText: string;
  startOffset: number; // Global character offset
}

function buildSpanIndex(textLayer: Element): SpanInfo[] {
  const spans = Array.from(textLayer.querySelectorAll('span'));
  const index: SpanInfo[] = [];
  let offset = 0;
  
  for (const span of spans) {
    const text = span.textContent || '';
    index.push({
      span: span as HTMLSpanElement,
      text,
      normalizedText: normalizeText(text),
      startOffset: offset
    });
    offset += text.length;
  }
  
  return index;
}
```

**Priority 3: Improve Match Precision**
```typescript
// Use exact position matching when bounding box available
function findSpansInBoundingBox(
  spans: HTMLSpanElement[],
  boundingBox: BoundingBox
): HTMLSpanElement[] {
  return spans.filter(span => {
    const rect = span.getBoundingClientRect();
    const page = span.closest('.page');
    if (!page) return false;
    
    const pageRect = page.getBoundingClientRect();
    const relY = (rect.top - pageRect.top) / pageRect.height;
    
    // Check if span Y position is within bounding box (with tolerance)
    const boxTop = boundingBox.y / pageRect.height;
    const boxBottom = (boundingBox.y + boundingBox.height) / pageRect.height;
    
    return relY >= boxTop - 0.01 && relY <= boxBottom + 0.01;
  });
}
```

### 7.2 Architecture Recommendations

**Add PDF Highlight Port:**
```typescript
// src/ports/pdf-highlight.port.ts
export interface PDFHighlightPort {
  /**
   * Highlight paragraph text in PDF viewer
   */
  highlightParagraph(params: {
    text: string;
    index: number;
    pageNumber: number;
    boundingBox?: BoundingBox;
  }): Promise<{ success: boolean; element: HTMLElement | null }>;
  
  /**
   * Highlight word within current paragraph
   */
  highlightWord(params: {
    charOffset: number;
    charLength: number;
  }): void;
  
  /**
   * Clear all PDF highlights
   */
  clearHighlights(): void;
  
  /**
   * Check if current page has text layer
   */
  hasTextLayer(pageNumber: number): boolean;
}
```

### 7.3 Feasibility Summary

| Feature | Feasibility | Confidence | Notes |
|---------|-------------|------------|-------|
| Paragraph highlighting | **HIGH** | 90% | Current impl works, needs optimization |
| Word highlighting | **MEDIUM-HIGH** | 75% | Requires word tokenization + CSS Highlights |
| Character-level precision | **MEDIUM** | 65% | Depends on span fragmentation |
| Scanned PDF support | **LOW** | 20% | No viable browser OCR solution |
| Multi-column layout | **MEDIUM** | 50% | Bounding box fallback viable |
| Large document (500+ pages) | **HIGH** | 85% | With lazy loading + caching |

---

## 8. References

### 8.1 PDF.js Source Files
- `src/display/text_layer.js` - Core text layer rendering
- `web/text_layer_builder.js` - Page-level text layer management
- `web/text_highlighter.js` - Find/search highlighting
- `web/pdf_find_controller.js` - Search and match logic

### 8.2 MDN Documentation
- [CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API)
- [Range API](https://developer.mozilla.org/en-US/docs/Web/API/Range)

### 8.3 PDF.js Wiki
- [Frequently Asked Questions](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)

### 8.4 Related VoxPage Files
- `src/utils/content/pdf-highlight.ts` - Current PDF highlighting
- `src/utils/content/highlight.ts` - General highlighting with CSS Highlights API
- `src/utils/pdf/extractor.ts` - PDF text extraction
- `src/utils/pdf/paragraph-grouper.ts` - Paragraph detection

---

## 9. Conclusion

VoxPage's current PDF highlighting approach is **fundamentally sound** but can be improved with:

1. **Page targeting** - Use bounding box to target specific pages
2. **Pre-computed indices** - Build character-to-span mapping once
3. **CSS Custom Highlight API** - Already used for word highlighting
4. **Graceful fallbacks** - Bounding box overlay when text matching fails

Word-level highlighting in PDFs is **feasible** but requires careful handling of span fragmentation. The CSS Custom Highlight API provides good browser support and performance characteristics.

For scanned PDFs without text layers, browser-based OCR is **not feasible** for a Firefox extension. The recommended approach is to detect this condition and inform the user while providing bounding-box-based visual indicators.
