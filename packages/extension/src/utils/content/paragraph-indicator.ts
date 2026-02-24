// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com/commercial

/**
 * Paragraph Indicator Module
 * Visual indicators showing cache status for each paragraph.
 * Displays checkmarks for cached paragraphs and loading states.
 *
 * Feature: 028-smart-audio-cache (User Story 2)
 *
 * @module utils/content/paragraph-indicator
 */

import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

/**
 * Paragraph status enum
 */
export const paragraphStatusSchema = z.enum(['cached', 'pending', 'loading', 'error', 'none']);
export type ParagraphStatus = z.infer<typeof paragraphStatusSchema>;

/**
 * Paragraph indicator state
 */
export interface ParagraphIndicatorState {
  paragraphIndex: number;
  status: ParagraphStatus;
  element: HTMLElement;
}

// ============================================================================
// Constants
// ============================================================================

const INDICATOR_CLASS = 'proso-indicator';
const INDICATOR_CACHED_CLASS = 'proso-indicator--cached';
const INDICATOR_LOADING_CLASS = 'proso-indicator--loading';
const INDICATOR_ERROR_CLASS = 'proso-indicator--error';

// SVG namespace
const SVG_NS = 'http://www.w3.org/2000/svg';

// ============================================================================
// SVG Icon Creators (using safe DOM methods)
// ============================================================================

/**
 * Create checkmark SVG icon using DOM methods (safe, no innerHTML)
 */
function createCachedIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const polyline = document.createElementNS(SVG_NS, 'polyline');
  polyline.setAttribute('points', '20 6 9 17 4 12');
  svg.appendChild(polyline);

  return svg;
}

/**
 * Create loading spinner SVG icon using DOM methods (safe, no innerHTML)
 */
function createLoadingIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.classList.add('proso-spin');

  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '10');
  svg.appendChild(circle);

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M12 6v6l4 2');
  svg.appendChild(path);

  return svg;
}

// ============================================================================
// ParagraphIndicator Class
// ============================================================================

/**
 * Manages visual indicators for paragraph cache status
 */
export class ParagraphIndicator {
  private indicators: Map<number, HTMLElement> = new Map();
  private styleInjected = false;

  constructor() {
    this.injectStyles();
  }

  /**
   * Add indicator to a paragraph element
   *
   * @param element - The paragraph DOM element
   * @param index - The paragraph index
   * @param status - Initial status
   */
  addIndicator(element: Element, index: number, status: ParagraphStatus = 'none'): void {
    if (this.indicators.has(index)) {
      this.updateIndicator(index, status);
      return;
    }

    const indicator = this.createIndicatorElement(index, status);
    (element as HTMLElement).style.position = 'relative';
    element.appendChild(indicator);
    this.indicators.set(index, indicator);
  }

  /**
   * Update indicator status for a paragraph
   *
   * @param index - Paragraph index
   * @param status - New status
   */
  updateIndicator(index: number, status: ParagraphStatus): void {
    const indicator = this.indicators.get(index);
    if (!indicator) {
      return;
    }

    // Update data attribute
    indicator.dataset.prosoStatus = status;

    // Update classes
    indicator.classList.remove(
      INDICATOR_CACHED_CLASS,
      INDICATOR_LOADING_CLASS,
      INDICATOR_ERROR_CLASS,
    );

    // Clear existing content
    while (indicator.firstChild) {
      indicator.removeChild(indicator.firstChild);
    }

    // Update icon and class based on status
    switch (status) {
      case 'cached':
        indicator.classList.add(INDICATOR_CACHED_CLASS);
        indicator.appendChild(createCachedIcon());
        indicator.setAttribute('aria-label', 'Cached (instant playback)');
        indicator.setAttribute('title', 'Cached - instant playback');
        break;
      case 'loading':
        indicator.classList.add(INDICATOR_LOADING_CLASS);
        indicator.appendChild(createLoadingIcon());
        indicator.setAttribute('aria-label', 'Loading...');
        indicator.setAttribute('title', 'Loading...');
        break;
      case 'error':
        indicator.classList.add(INDICATOR_ERROR_CLASS);
        indicator.textContent = '⚠';
        indicator.setAttribute('aria-label', 'Error loading');
        indicator.setAttribute('title', 'Error loading');
        break;
      case 'pending':
      case 'none':
      default:
        indicator.setAttribute('aria-label', '');
        indicator.setAttribute('title', '');
        break;
    }
  }

  /**
   * Remove indicator from a paragraph
   *
   * @param index - Paragraph index
   */
  removeIndicator(index: number): void {
    const indicator = this.indicators.get(index);
    if (indicator && indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
    this.indicators.delete(index);
  }

  /**
   * Remove all indicators
   */
  clearAll(): void {
    this.indicators.forEach((indicator) => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    });
    this.indicators.clear();
  }

  /**
   * Update indicators for multiple paragraphs at once
   *
   * @param statusMap - Map of paragraph index to status
   */
  batchUpdate(statusMap: Map<number, ParagraphStatus>): void {
    statusMap.forEach((status, index) => {
      this.updateIndicator(index, status);
    });
  }

  /**
   * Mark paragraphs as cached from an array of indices
   *
   * @param cachedIndices - Array of cached paragraph indices
   */
  markCached(cachedIndices: number[]): void {
    // First, reset all to 'none' or 'pending'
    this.indicators.forEach((_, index) => {
      this.updateIndicator(index, 'pending');
    });

    // Then mark cached ones
    cachedIndices.forEach((index) => {
      if (this.indicators.has(index)) {
        this.updateIndicator(index, 'cached');
      }
    });
  }

  /**
   * Get status of a specific paragraph
   */
  getStatus(index: number): ParagraphStatus | null {
    const indicator = this.indicators.get(index);
    if (!indicator) return null;
    return (indicator.dataset.prosoStatus as ParagraphStatus) || 'none';
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Create indicator element
   */
  private createIndicatorElement(index: number, status: ParagraphStatus): HTMLElement {
    const indicator = document.createElement('span');
    indicator.className = INDICATOR_CLASS;
    indicator.dataset.prosoIndex = String(index);
    indicator.dataset.prosoStatus = status;
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');

    if (status === 'cached') {
      indicator.classList.add(INDICATOR_CACHED_CLASS);
      indicator.appendChild(createCachedIcon());
      indicator.setAttribute('aria-label', 'Cached (instant playback)');
      indicator.setAttribute('title', 'Cached - instant playback');
    }

    return indicator;
  }

  /**
   * Inject indicator styles into the page
   */
  private injectStyles(): void {
    if (this.styleInjected) return;
    if (document.getElementById('proso-indicator-styles')) {
      this.styleInjected = true;
      return;
    }

    const style = document.createElement('style');
    style.id = 'proso-indicator-styles';
    style.textContent = `
      /* Paragraph Cache Status Indicator */
      .${INDICATOR_CLASS} {
        position: absolute !important;
        right: -24px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        width: 20px !important;
        height: 20px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 12px !important;
        color: #9CA3AF !important;
        pointer-events: none !important;
        opacity: 0 !important;
        transition: opacity 0.2s ease !important;
      }

      /* Show indicator on hover */
      .proso-selectable:hover .${INDICATOR_CLASS},
      .${INDICATOR_CLASS}.${INDICATOR_CACHED_CLASS} {
        opacity: 1 !important;
      }

      /* Cached indicator - checkmark */
      .${INDICATOR_CLASS}.${INDICATOR_CACHED_CLASS} {
        color: #10B981 !important;
      }

      .${INDICATOR_CLASS}.${INDICATOR_CACHED_CLASS} svg {
        stroke: #10B981 !important;
      }

      /* Loading indicator - spinning */
      .${INDICATOR_CLASS}.${INDICATOR_LOADING_CLASS} {
        color: #0D9488 !important;
        opacity: 1 !important;
      }

      .${INDICATOR_CLASS}.${INDICATOR_LOADING_CLASS} svg {
        stroke: #0D9488 !important;
        animation: proso-indicator-spin 1s linear infinite !important;
      }

      /* Error indicator */
      .${INDICATOR_CLASS}.${INDICATOR_ERROR_CLASS} {
        color: #EF4444 !important;
        opacity: 1 !important;
      }

      @keyframes proso-indicator-spin {
        from { transform: translateY(-50%) rotate(0deg); }
        to { transform: translateY(-50%) rotate(360deg); }
      }

      /* Dark mode */
      @media (prefers-color-scheme: dark) {
        .${INDICATOR_CLASS} {
          color: #6B7280 !important;
        }

        .${INDICATOR_CLASS}.${INDICATOR_CACHED_CLASS} {
          color: #34D399 !important;
        }

        .${INDICATOR_CLASS}.${INDICATOR_CACHED_CLASS} svg {
          stroke: #34D399 !important;
        }

        .${INDICATOR_CLASS}.${INDICATOR_LOADING_CLASS} {
          color: #14B8A6 !important;
        }

        .${INDICATOR_CLASS}.${INDICATOR_LOADING_CLASS} svg {
          stroke: #14B8A6 !important;
        }
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .${INDICATOR_CLASS}.${INDICATOR_LOADING_CLASS} svg {
          animation: none !important;
        }
      }
    `;

    document.head.appendChild(style);
    this.styleInjected = true;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Singleton instance for content script usage
 */
export const paragraphIndicator = new ParagraphIndicator();

console.log('Proso: utils/content/paragraph-indicator.ts loaded');
