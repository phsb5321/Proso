// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Scroll Spy Utility
 * Tracks which section is currently in view and updates sidebar active state
 *
 * @module utils/options/scroll-spy
 * @description FR-005 - Scroll-spy for sidebar active state
 */

export interface ScrollSpyOptions {
  /** CSS selector for sections to observe */
  sectionSelector: string;
  /** CSS selector for nav links that correspond to sections */
  navLinkSelector: string;
  /** Threshold for intersection (0-1) */
  threshold?: number;
  /** Root margin for IntersectionObserver */
  rootMargin?: string;
  /** Callback when active section changes */
  onActiveChange?: (sectionId: string | null) => void;
}

export interface ScrollSpyInstance {
  /** Start observing sections */
  start: () => void;
  /** Stop observing and cleanup */
  destroy: () => void;
  /** Get currently active section ID */
  getActiveSection: () => string | null;
  /** Manually set active section (e.g., after programmatic scroll) */
  setActiveSection: (sectionId: string) => void;
}

/**
 * Create a scroll spy instance
 * Uses IntersectionObserver for efficient section visibility tracking
 */
export function createScrollSpy(options: ScrollSpyOptions): ScrollSpyInstance {
  const {
    sectionSelector,
    navLinkSelector,
    threshold = 0.2,
    rootMargin = '-10% 0px -70% 0px',
    onActiveChange,
  } = options;

  let observer: IntersectionObserver | null = null;
  let activeSection: string | null = null;
  let isManuallySet = false;
  let manualSetTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Update active state on nav links
   */
  function updateActiveLink(sectionId: string | null): void {
    const navLinks = document.querySelectorAll(navLinkSelector);

    navLinks.forEach((link) => {
      const href = link.getAttribute('href');
      const isActive = href === `#${sectionId}`;

      link.classList.toggle('active', isActive);
      link.setAttribute('aria-current', isActive ? 'true' : 'false');
    });

    activeSection = sectionId;

    if (onActiveChange) {
      onActiveChange(sectionId);
    }
  }

  /**
   * Handle intersection changes
   */
  function handleIntersection(entries: IntersectionObserverEntry[]): void {
    // If section was manually set, ignore intersection updates briefly
    if (isManuallySet) return;

    // Find the most visible section
    let mostVisible: IntersectionObserverEntry | null = null;

    for (const entry of entries) {
      if (entry.isIntersecting) {
        if (!mostVisible || entry.intersectionRatio > mostVisible.intersectionRatio) {
          mostVisible = entry;
        }
      }
    }

    if (mostVisible) {
      const sectionId = (mostVisible.target as HTMLElement).id;
      if (sectionId && sectionId !== activeSection) {
        updateActiveLink(sectionId);
      }
    }
  }

  /**
   * Start observing sections
   */
  function start(): void {
    const sections = document.querySelectorAll(sectionSelector);

    if (sections.length === 0) {
      console.warn('ScrollSpy: No sections found matching selector:', sectionSelector);
      return;
    }

    // Create IntersectionObserver
    observer = new IntersectionObserver(handleIntersection, {
      threshold: [0, threshold, 0.5, 1],
      rootMargin,
    });

    // Observe all sections
    sections.forEach((section) => {
      if (section.id) {
        observer?.observe(section);
      }
    });

    // Set initial active based on URL hash or first section
    const hash = window.location.hash.slice(1);
    if (hash && document.getElementById(hash)) {
      updateActiveLink(hash);
    } else {
      const firstSection = sections[0] as HTMLElement;
      if (firstSection?.id) {
        updateActiveLink(firstSection.id);
      }
    }
  }

  /**
   * Stop observing and cleanup
   */
  function destroy(): void {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    if (manualSetTimeout) {
      clearTimeout(manualSetTimeout);
      manualSetTimeout = null;
    }

    activeSection = null;
  }

  /**
   * Get currently active section ID
   */
  function getActiveSection(): string | null {
    return activeSection;
  }

  /**
   * Manually set active section (e.g., after programmatic scroll)
   * This temporarily ignores intersection updates to prevent flicker
   */
  function setActiveSection(sectionId: string): void {
    // Clear any existing timeout
    if (manualSetTimeout) {
      clearTimeout(manualSetTimeout);
    }

    isManuallySet = true;
    updateActiveLink(sectionId);

    // Resume intersection tracking after scroll settles
    manualSetTimeout = setTimeout(() => {
      isManuallySet = false;
    }, 1000);
  }

  return {
    start,
    destroy,
    getActiveSection,
    setActiveSection,
  };
}
