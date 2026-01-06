// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Sidebar Navigation Component
 * Provides sticky navigation for options page sections
 *
 * @module entrypoints/options/components/sidebar
 * @description FR-002 - Sidebar navigation, FR-005 - Active state indication
 */

export interface SidebarSection {
  id: string;
  label: string;
  icon?: string;
}

export interface SidebarOptions {
  /** Container element ID to insert sidebar */
  containerId: string;
  /** Section definitions */
  sections: SidebarSection[];
  /** Callback when nav link is clicked */
  onNavigate?: (sectionId: string) => void;
}

/**
 * Default sections for the options page
 */
export const DEFAULT_SECTIONS: SidebarSection[] = [
  { id: 'quick-settings', label: 'Quick Settings' },
  { id: 'api-keys', label: 'API Keys' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'reading-queue', label: 'Reading Queue' },
  { id: 'keyboard-shortcuts', label: 'Shortcuts' },
  { id: 'developer', label: 'Developer' },
];

/**
 * Create and initialize the sidebar navigation
 */
export function createSidebar(options: SidebarOptions): HTMLElement {
  const { containerId, sections, onNavigate } = options;

  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Sidebar container not found: ${containerId}`);
  }

  // Create sidebar element
  const sidebar = document.createElement('aside');
  sidebar.className = 'voxpage-sidebar';
  sidebar.setAttribute('role', 'navigation');
  sidebar.setAttribute('aria-label', 'Settings navigation');

  // Create nav element
  const nav = document.createElement('nav');
  nav.className = 'voxpage-sidebar__nav';

  // Create nav list
  const navList = document.createElement('ul');
  navList.className = 'voxpage-sidebar__list';
  navList.setAttribute('role', 'list');

  // Create nav items
  sections.forEach((section, index) => {
    const listItem = document.createElement('li');
    listItem.className = 'voxpage-sidebar__item';

    const link = document.createElement('a');
    link.className = 'voxpage-sidebar__link';
    link.href = `#${section.id}`;
    link.textContent = section.label;
    link.setAttribute('data-section', section.id);

    // ARIA attributes
    if (index === 0) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'true');
    } else {
      link.setAttribute('aria-current', 'false');
    }

    // Click handler
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (onNavigate) {
        onNavigate(section.id);
      }
    });

    listItem.appendChild(link);
    navList.appendChild(listItem);
  });

  nav.appendChild(navList);
  sidebar.appendChild(nav);

  // Insert sidebar into container
  container.insertBefore(sidebar, container.firstChild);

  return sidebar;
}

/**
 * Update sidebar active state
 */
export function updateSidebarActive(sectionId: string): void {
  const links = document.querySelectorAll('.voxpage-sidebar__link');

  links.forEach(link => {
    const linkSection = link.getAttribute('data-section');
    const isActive = linkSection === sectionId;

    link.classList.toggle('active', isActive);
    link.setAttribute('aria-current', isActive ? 'true' : 'false');
  });
}

/**
 * Setup keyboard navigation for sidebar
 * FR-029 - Keyboard navigation support
 */
export function setupSidebarKeyboardNav(): void {
  const sidebar = document.querySelector('.voxpage-sidebar__list');
  if (!sidebar) return;

  sidebar.addEventListener('keydown', (e: Event) => {
    const event = e as KeyboardEvent;
    const links = Array.from(sidebar.querySelectorAll('.voxpage-sidebar__link')) as HTMLElement[];
    const currentIndex = links.findIndex(link => link === document.activeElement);

    if (currentIndex === -1) return;

    let nextIndex: number | null = null;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        nextIndex = Math.min(currentIndex + 1, links.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case 'Home':
        event.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        nextIndex = links.length - 1;
        break;
    }

    if (nextIndex !== null && nextIndex !== currentIndex) {
      links[nextIndex].focus();
    }
  });
}
