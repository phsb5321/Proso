// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Persistent Highlight Manager
 *
 * Manages user-created persistent text highlights using W3C Web Annotation
 * TextQuoteSelectors. Handles text selection detection, highlight rendering,
 * re-anchoring on page load, and orphan detection.
 *
 * Part of 045-pdf-removal-page-reader Phase 4: User Story 2 (Highlights)
 *
 * @module utils/content/persistent-highlight
 */

import {
  createFromSelection,
  anchor,
  type TextQuoteSelector,
} from '../../core/highlight';
import {
  type HighlightColor,
  HIGHLIGHT_COLOR_VALUES,
} from '../../utils/schemas/highlight.schema';

/**
 * Rendered highlight in the DOM
 */
interface RenderedHighlight {
  /** Highlight ID from storage */
  id: string;

  /** The Range covering the highlighted text */
  range: Range;

  /** Highlight elements (may span multiple nodes) */
  elements: HTMLElement[];

  /** Color of the highlight */
  color: HighlightColor;

  /** Whether this highlight failed to re-anchor */
  orphaned: boolean;
}

/**
 * Selection change callback
 */
type SelectionCallback = (selector: TextQuoteSelector | null) => void;

/**
 * Highlight action callback (for context menu)
 */
type HighlightActionCallback = (
  action: 'delete' | 'note' | 'changeColor',
  highlightId: string,
  data?: unknown,
) => void;

/**
 * Persistent Highlight Manager
 *
 * Handles:
 * - Text selection detection and TextQuoteSelector creation
 * - Visual highlight rendering with CSS
 * - Re-anchoring stored highlights on page load
 * - Orphan detection and user notification
 * - Context menu for highlight management
 */
export class PersistentHighlightManager {
  /** Currently rendered highlights */
  private renderedHighlights: Map<string, RenderedHighlight> = new Map();

  /** Selection change callback */
  private selectionCallback: SelectionCallback | null = null;

  /** Highlight action callback */
  private actionCallback: HighlightActionCallback | null = null;

  /** Debounce timer for selection changes */
  private selectionDebounceTimer: number | null = null;

  /** Context menu element */
  private contextMenu: HTMLElement | null = null;

  /** Currently active (clicked) highlight */
  private activeHighlightId: string | null = null;

  /** Minimum selection length to consider valid */
  private readonly MIN_SELECTION_LENGTH = 3;

  /** Debounce delay for selection changes (ms) */
  private readonly SELECTION_DEBOUNCE_MS = 150;

  constructor() {
    this.setupSelectionListener();
    this.injectHighlightStyles();
  }

  // ============================================================================
  // Text Selection Detection (T087, T088)
  // ============================================================================

  /**
   * Setup listener for text selection changes.
   * Detects when user selects text and creates TextQuoteSelector.
   */
  private setupSelectionListener(): void {
    // Listen for selection changes with debouncing
    document.addEventListener('selectionchange', () => {
      if (this.selectionDebounceTimer) {
        clearTimeout(this.selectionDebounceTimer);
      }

      this.selectionDebounceTimer = window.setTimeout(() => {
        this.handleSelectionChange();
        this.selectionDebounceTimer = null;
      }, this.SELECTION_DEBOUNCE_MS);
    });

    // Listen for mouseup to finalize selection
    document.addEventListener('mouseup', () => {
      // Small delay to let selection settle
      setTimeout(() => this.handleSelectionChange(), 10);
    });
  }

  /**
   * Handle selection change event.
   * Creates TextQuoteSelector from valid selections.
   */
  private handleSelectionChange(): void {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed) {
      this.notifySelectionChange(null);
      return;
    }

    const selectedText = selection.toString().trim();

    // Ignore very short selections
    if (selectedText.length < this.MIN_SELECTION_LENGTH) {
      this.notifySelectionChange(null);
      return;
    }

    // Check if selection is within an existing highlight (don't re-highlight)
    if (this.isSelectionInHighlight(selection)) {
      this.notifySelectionChange(null);
      return;
    }

    // Create TextQuoteSelector from selection
    const selector = createFromSelection(selection);
    this.notifySelectionChange(selector);
  }

  /**
   * Check if the current selection is inside an existing highlight.
   */
  private isSelectionInHighlight(selection: Selection): boolean {
    if (!selection.rangeCount) return false;

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;

    // Check if any parent element is a highlight
    let element =
      container instanceof HTMLElement ? container : container.parentElement;

    while (element) {
      if (element.classList.contains('proso-persistent-highlight')) {
        return true;
      }
      element = element.parentElement;
    }

    return false;
  }

  /**
   * Notify selection change callback.
   */
  private notifySelectionChange(selector: TextQuoteSelector | null): void {
    if (this.selectionCallback) {
      this.selectionCallback(selector);
    }
  }

  /**
   * Register callback for selection changes.
   */
  onSelectionChange(callback: SelectionCallback): void {
    this.selectionCallback = callback;
  }

  /**
   * Get current selection as TextQuoteSelector.
   * Returns null if no valid selection.
   */
  getCurrentSelection(): TextQuoteSelector | null {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return null;

    const selectedText = selection.toString().trim();
    if (selectedText.length < this.MIN_SELECTION_LENGTH) return null;

    return createFromSelection(selection);
  }

  /**
   * Clear the current text selection.
   */
  clearSelection(): void {
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
  }

  // ============================================================================
  // Visual Highlight Rendering (T089)
  // ============================================================================

  /**
   * Inject CSS styles for persistent highlights.
   */
  private injectHighlightStyles(): void {
    if (document.getElementById('proso-persistent-highlight-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'proso-persistent-highlight-styles';
    style.textContent = `
      /* Persistent Highlight Base Styles */
      .proso-persistent-highlight {
        cursor: pointer;
        border-radius: 2px;
        transition: background-color 0.2s ease, box-shadow 0.2s ease;
        position: relative;
      }

      .proso-persistent-highlight:hover {
        box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
      }

      /* Color variants */
      .proso-persistent-highlight[data-color="yellow"] {
        background-color: ${HIGHLIGHT_COLOR_VALUES.yellow};
      }
      .proso-persistent-highlight[data-color="green"] {
        background-color: ${HIGHLIGHT_COLOR_VALUES.green};
      }
      .proso-persistent-highlight[data-color="blue"] {
        background-color: ${HIGHLIGHT_COLOR_VALUES.blue};
      }
      .proso-persistent-highlight[data-color="pink"] {
        background-color: ${HIGHLIGHT_COLOR_VALUES.pink};
      }
      .proso-persistent-highlight[data-color="purple"] {
        background-color: ${HIGHLIGHT_COLOR_VALUES.purple};
      }

      /* Dark mode adjustments */
      @media (prefers-color-scheme: dark) {
        .proso-persistent-highlight[data-color="yellow"] {
          background-color: rgba(254, 240, 138, 0.4);
        }
        .proso-persistent-highlight[data-color="green"] {
          background-color: rgba(187, 247, 208, 0.4);
        }
        .proso-persistent-highlight[data-color="blue"] {
          background-color: rgba(191, 219, 254, 0.4);
        }
        .proso-persistent-highlight[data-color="pink"] {
          background-color: rgba(251, 207, 232, 0.4);
        }
        .proso-persistent-highlight[data-color="purple"] {
          background-color: rgba(221, 214, 254, 0.4);
        }
      }

      /* Orphaned highlight (failed re-anchoring) */
      .proso-persistent-highlight--orphaned {
        background-color: rgba(239, 68, 68, 0.2) !important;
        border: 1px dashed #ef4444;
      }

      /* Note indicator */
      .proso-persistent-highlight--has-note::after {
        content: "";
        position: absolute;
        top: -4px;
        right: -4px;
        width: 8px;
        height: 8px;
        background-color: #3b82f6;
        border-radius: 50%;
      }

      /* Context menu styles */
      .proso-highlight-context-menu {
        position: fixed;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        padding: 4px;
        z-index: 10000;
        min-width: 140px;
      }

      .proso-highlight-context-menu button {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 8px 12px;
        border: none;
        background: transparent;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        color: #374151;
        text-align: left;
      }

      .proso-highlight-context-menu button:hover {
        background-color: #f3f4f6;
      }

      .proso-highlight-context-menu button.danger {
        color: #ef4444;
      }

      .proso-highlight-context-menu button.danger:hover {
        background-color: #fef2f2;
      }

      .proso-highlight-color-picker {
        display: flex;
        gap: 4px;
        padding: 8px 12px;
        border-top: 1px solid #e5e7eb;
        margin-top: 4px;
      }

      .proso-highlight-color-btn {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid transparent;
        cursor: pointer;
        transition: transform 0.15s ease;
      }

      .proso-highlight-color-btn:hover {
        transform: scale(1.2);
      }

      .proso-highlight-color-btn.active {
        border-color: #374151;
      }

      @media (prefers-color-scheme: dark) {
        .proso-highlight-context-menu {
          background: #1f2937;
          border-color: #374151;
        }

        .proso-highlight-context-menu button {
          color: #e5e7eb;
        }

        .proso-highlight-context-menu button:hover {
          background-color: #374151;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .proso-persistent-highlight,
        .proso-highlight-color-btn {
          transition: none !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Render a highlight in the DOM.
   *
   * @param id - Highlight ID
   * @param selector - TextQuoteSelector for positioning
   * @param color - Highlight color
   * @param hasNote - Whether highlight has an attached note
   * @returns Success status
   */
  renderHighlight(
    id: string,
    selector: TextQuoteSelector,
    color: HighlightColor,
    hasNote = false,
  ): boolean {
    // Check if already rendered
    if (this.renderedHighlights.has(id)) {
      return true;
    }

    // Anchor the selector to find its position in the document
    const anchorResult = anchor(document, document.body, selector);

    if (anchorResult.ok) {
      const { range } = anchorResult.value;
      const elements = this.wrapRange(range, id, color, hasNote, false);

      this.renderedHighlights.set(id, {
        id,
        range,
        elements,
        color,
        orphaned: false,
      });

      return true;
    }

    // Anchoring failed - render as orphaned placeholder
    console.warn(`Proso: Failed to anchor highlight ${id}:`, anchorResult.error);
    return false;
  }

  /**
   * Wrap a Range with highlight elements.
   */
  private wrapRange(
    range: Range,
    id: string,
    color: HighlightColor,
    hasNote: boolean,
    orphaned: boolean,
  ): HTMLElement[] {
    const elements: HTMLElement[] = [];

    // Handle simple case: selection within single text node
    if (
      range.startContainer === range.endContainer &&
      range.startContainer.nodeType === Node.TEXT_NODE
    ) {
      const wrapper = this.createHighlightElement(id, color, hasNote, orphaned);
      range.surroundContents(wrapper);
      elements.push(wrapper);
      this.attachHighlightListeners(wrapper, id);
      return elements;
    }

    // Complex case: selection spans multiple nodes
    // Extract contents and wrap them
    const fragment = range.extractContents();
    const wrapper = this.createHighlightElement(id, color, hasNote, orphaned);

    // Process all text nodes in the fragment
    this.wrapTextNodes(fragment, wrapper, elements, id, color, hasNote, orphaned);

    range.insertNode(wrapper);
    elements.push(wrapper);
    this.attachHighlightListeners(wrapper, id);

    return elements;
  }

  /**
   * Recursively wrap text nodes in a document fragment.
   */
  private wrapTextNodes(
    node: Node,
    container: HTMLElement,
    elements: HTMLElement[],
    id: string,
    color: HighlightColor,
    hasNote: boolean,
    orphaned: boolean,
  ): void {
    const children = Array.from(node.childNodes);

    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) {
        // Wrap text node
        const span = this.createHighlightElement(id, color, hasNote, orphaned);
        span.textContent = child.textContent;
        container.appendChild(span);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        // Clone element and process its children
        const clone = (child as HTMLElement).cloneNode(false) as HTMLElement;
        container.appendChild(clone);
        this.wrapTextNodes(child, clone, elements, id, color, hasNote, orphaned);
      }
    }
  }

  /**
   * Create a highlight wrapper element.
   */
  private createHighlightElement(
    id: string,
    color: HighlightColor,
    hasNote: boolean,
    orphaned: boolean,
  ): HTMLElement {
    const el = document.createElement('mark');
    el.className = 'proso-persistent-highlight';
    el.dataset.highlightId = id;
    el.dataset.color = color;

    if (hasNote) {
      el.classList.add('proso-persistent-highlight--has-note');
    }

    if (orphaned) {
      el.classList.add('proso-persistent-highlight--orphaned');
    }

    return el;
  }

  /**
   * Attach click listeners to a highlight element.
   */
  private attachHighlightListeners(element: HTMLElement, id: string): void {
    // Right-click shows context menu
    element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(id, e.clientX, e.clientY);
    });

    // Click also shows context menu (for touch devices)
    element.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showContextMenu(id, e.clientX, e.clientY);
    });
  }

  /**
   * Remove a rendered highlight from the DOM.
   */
  removeHighlight(id: string): boolean {
    const rendered = this.renderedHighlights.get(id);
    if (!rendered) return false;

    for (const element of rendered.elements) {
      // Unwrap the element (replace with its contents)
      const parent = element.parentNode;
      if (parent) {
        while (element.firstChild) {
          parent.insertBefore(element.firstChild, element);
        }
        parent.removeChild(element);
      }
    }

    this.renderedHighlights.delete(id);
    return true;
  }

  /**
   * Update a highlight's color.
   */
  updateHighlightColor(id: string, color: HighlightColor): boolean {
    const rendered = this.renderedHighlights.get(id);
    if (!rendered) return false;

    for (const element of rendered.elements) {
      element.dataset.color = color;
    }

    rendered.color = color;
    return true;
  }

  /**
   * Clear all rendered highlights.
   */
  clearAllHighlights(): void {
    for (const [id] of this.renderedHighlights) {
      this.removeHighlight(id);
    }
    this.hideContextMenu();
  }

  // ============================================================================
  // Re-anchoring on Page Load (T090)
  // ============================================================================

  /**
   * Re-anchor and render all highlights for the current page.
   *
   * @param highlights - Array of highlights from storage
   * @returns Map of highlight ID to orphan status
   */
  async reanchorHighlights(
    highlights: Array<{
      id: string;
      selector: TextQuoteSelector;
      color: HighlightColor;
      hasNote: boolean;
    }>,
  ): Promise<Map<string, boolean>> {
    const orphanStatus = new Map<string, boolean>();

    for (const highlight of highlights) {
      const success = this.renderHighlight(
        highlight.id,
        highlight.selector,
        highlight.color,
        highlight.hasNote,
      );

      orphanStatus.set(highlight.id, !success);
    }

    return orphanStatus;
  }

  // ============================================================================
  // Orphan Detection (T091)
  // ============================================================================

  /**
   * Get list of orphaned highlight IDs.
   */
  getOrphanedHighlights(): string[] {
    const orphaned: string[] = [];

    for (const [id, rendered] of this.renderedHighlights) {
      if (rendered.orphaned) {
        orphaned.push(id);
      }
    }

    return orphaned;
  }

  /**
   * Mark a highlight as orphaned.
   */
  markAsOrphaned(id: string): void {
    const rendered = this.renderedHighlights.get(id);
    if (rendered) {
      rendered.orphaned = true;
      for (const element of rendered.elements) {
        element.classList.add('proso-persistent-highlight--orphaned');
      }
    }
  }

  // ============================================================================
  // Context Menu (T092)
  // ============================================================================

  /**
   * Create a menu button element.
   */
  private createMenuButton(
    text: string,
    action: string,
    isDanger = false,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.dataset.action = action;
    if (isDanger) {
      button.className = 'danger';
    }
    button.textContent = text;
    return button;
  }

  /**
   * Create a color picker button.
   */
  private createColorButton(color: HighlightColor): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'proso-highlight-color-btn';
    button.dataset.action = 'color';
    button.dataset.color = color;
    button.style.backgroundColor = HIGHLIGHT_COLOR_VALUES[color];
    button.title = color;
    return button;
  }

  /**
   * Show context menu for a highlight.
   */
  private showContextMenu(highlightId: string, x: number, y: number): void {
    this.hideContextMenu();
    this.activeHighlightId = highlightId;

    const menu = document.createElement('div');
    menu.className = 'proso-highlight-context-menu';

    // Add Note button
    const noteBtn = this.createMenuButton('Add Note', 'note');
    menu.appendChild(noteBtn);

    // Delete button
    const deleteBtn = this.createMenuButton('Delete', 'delete', true);
    menu.appendChild(deleteBtn);

    // Color picker section
    const colorPicker = document.createElement('div');
    colorPicker.className = 'proso-highlight-color-picker';

    const colors: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'purple'];
    for (const color of colors) {
      const colorBtn = this.createColorButton(color);
      colorPicker.appendChild(colorBtn);
    }

    menu.appendChild(colorPicker);

    // Position menu
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // Attach click listener to menu
    menu.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const button = target.closest('button');
      if (!button) return;

      const action = button.dataset.action;
      if (action === 'delete') {
        this.triggerAction('delete', highlightId);
      } else if (action === 'note') {
        this.triggerAction('note', highlightId);
      } else if (action === 'color') {
        const color = button.dataset.color as HighlightColor;
        this.triggerAction('changeColor', highlightId, color);
      }

      this.hideContextMenu();
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', this.handleOutsideClick);
    }, 0);

    document.body.appendChild(menu);
    this.contextMenu = menu;

    // Adjust position if menu goes off-screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 10}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 10}px`;
    }
  }

  /**
   * Handle click outside context menu.
   */
  private handleOutsideClick = (e: MouseEvent): void => {
    if (this.contextMenu && !this.contextMenu.contains(e.target as Node)) {
      this.hideContextMenu();
    }
  };

  /**
   * Hide context menu.
   */
  private hideContextMenu(): void {
    if (this.contextMenu) {
      this.contextMenu.remove();
      this.contextMenu = null;
      document.removeEventListener('click', this.handleOutsideClick);
    }
    this.activeHighlightId = null;
  }

  /**
   * Trigger highlight action.
   */
  private triggerAction(
    action: 'delete' | 'note' | 'changeColor',
    highlightId: string,
    data?: unknown,
  ): void {
    if (this.actionCallback) {
      this.actionCallback(action, highlightId, data);
    }
  }

  /**
   * Register callback for highlight actions.
   */
  onHighlightAction(callback: HighlightActionCallback): void {
    this.actionCallback = callback;
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Get count of rendered highlights.
   */
  getHighlightCount(): number {
    return this.renderedHighlights.size;
  }

  /**
   * Check if a highlight is rendered.
   */
  isHighlightRendered(id: string): boolean {
    return this.renderedHighlights.has(id);
  }

  /**
   * Get all rendered highlight IDs.
   */
  getRenderedHighlightIds(): string[] {
    return Array.from(this.renderedHighlights.keys());
  }
}

/**
 * Create a persistent highlight manager instance.
 */
export function createPersistentHighlightManager(): PersistentHighlightManager {
  return new PersistentHighlightManager();
}
