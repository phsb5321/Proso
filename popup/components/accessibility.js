/**
 * VoxPage Accessibility Helper Module
 * Provides ARIA helpers, keyboard navigation, and screen reader announcements
 */

// Reference to the live region element
let announcer = null;
let assertiveAnnouncer = null;

/**
 * Initialize accessibility features
 * Creates the live region announcer elements
 */
export function initAccessibility() {
  // Create polite announcer for regular status updates
  announcer = document.getElementById('srAnnouncer');
  if (!announcer) {
    announcer = document.createElement('div');
    announcer.id = 'srAnnouncer';
    announcer.className = 'sr-only';
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    document.body.appendChild(announcer);
  }

  // Create assertive announcer for error messages
  assertiveAnnouncer = document.getElementById('srAnnouncerAssertive');
  if (!assertiveAnnouncer) {
    assertiveAnnouncer = document.createElement('div');
    assertiveAnnouncer.id = 'srAnnouncerAssertive';
    assertiveAnnouncer.className = 'sr-only';
    assertiveAnnouncer.setAttribute('aria-live', 'assertive');
    assertiveAnnouncer.setAttribute('aria-atomic', 'true');
    document.body.appendChild(assertiveAnnouncer);
  }
}

/**
 * Announce a message to screen readers
 * @param {string} message - The message to announce
 * @param {boolean} assertive - Whether to use assertive (interrupting) announcement
 */
export function announce(message, assertive = false) {
  const target = assertive ? assertiveAnnouncer : announcer;

  // Check if target exists and is still in the DOM
  if (!target || !document.body.contains(target)) {
    initAccessibility();
    announce(message, assertive);
    return;
  }

  // Clear and set with a small delay to ensure announcement
  target.textContent = '';
  setTimeout(() => {
    target.textContent = message;
  }, 50);
}

/**
 * Update play/pause button accessibility state
 * @param {HTMLElement} button - The play/pause button
 * @param {boolean} isPlaying - Current playing state
 */
export function updatePlayButtonState(button, isPlaying) {
  if (!button) return;

  button.setAttribute('aria-pressed', isPlaying.toString());
  button.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');

  // Announce state change
  announce(isPlaying ? 'Playing' : 'Paused');
}

/**
 * Announce playback stop
 */
export function announceStop() {
  announce('Stopped');
}

/**
 * Announce error message
 * @param {string} message - Error message to announce
 */
export function announceError(message) {
  announce(message, true);
}

/**
 * Announce paragraph change
 * @param {number} current - Current paragraph (1-based)
 * @param {number} total - Total paragraphs
 */
export function announceParagraph(current, total) {
  announce(`Paragraph ${current} of ${total}`);
}

/**
 * Setup roving tabindex for a tablist
 * @param {HTMLElement} container - The tablist container
 * @param {string} tabSelector - Selector for tab elements
 */
export function setupRovingTabindex(container, tabSelector = '[role="tab"]') {
  const tabs = container.querySelectorAll(tabSelector);
  if (tabs.length === 0) return;

  // Set initial tabindex
  tabs.forEach((tab, index) => {
    tab.setAttribute('tabindex', index === 0 ? '0' : '-1');
  });

  // Handle keyboard navigation
  container.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;

    const tabArray = Array.from(tabs);
    const currentIndex = tabArray.indexOf(document.activeElement);

    if (currentIndex === -1) return;

    e.preventDefault();
    let newIndex;

    switch (e.key) {
      case 'ArrowLeft':
        newIndex = currentIndex === 0 ? tabArray.length - 1 : currentIndex - 1;
        break;
      case 'ArrowRight':
        newIndex = currentIndex === tabArray.length - 1 ? 0 : currentIndex + 1;
        break;
      case 'Home':
        newIndex = 0;
        break;
      case 'End':
        newIndex = tabArray.length - 1;
        break;
    }

    // Update tabindex
    tabs.forEach((tab, index) => {
      tab.setAttribute('tabindex', index === newIndex ? '0' : '-1');
    });

    // Focus and activate
    tabArray[newIndex].focus();
    tabArray[newIndex].click();
  });
}

/**
 * Update tab selection state
 * @param {HTMLElement} container - The tablist container
 * @param {HTMLElement} selectedTab - The newly selected tab
 */
export function updateTabSelection(container, selectedTab) {
  const tabs = container.querySelectorAll('[role="tab"]');

  tabs.forEach(tab => {
    const isSelected = tab === selectedTab;
    tab.setAttribute('aria-selected', isSelected.toString());
    tab.setAttribute('tabindex', isSelected ? '0' : '-1');
  });
}

/**
 * Setup keyboard navigation for buttons
 * Ensures Enter and Space activate buttons properly
 * @param {HTMLElement} container - Container to setup navigation in
 */
export function setupButtonKeyboard(container) {
  container.addEventListener('keydown', (e) => {
    if (e.target.matches('button') && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.target.click();
    }
  });
}

/**
 * Add ARIA labels to icon-only buttons
 * @param {HTMLElement} button - Button element
 * @param {string} label - Accessible label
 */
export function setButtonLabel(button, label) {
  if (button && label) {
    button.setAttribute('aria-label', label);
  }
}

/**
 * Setup slider accessibility
 * @param {HTMLInputElement} slider - The range input element
 * @param {string} label - Accessible label for the slider
 */
export function setupSliderAccessibility(slider, label) {
  if (!slider) return;

  slider.setAttribute('aria-label', label);
  slider.setAttribute('aria-valuemin', slider.min);
  slider.setAttribute('aria-valuemax', slider.max);

  const updateValue = () => {
    slider.setAttribute('aria-valuenow', slider.value);
    slider.setAttribute('aria-valuetext', `${slider.value}x speed`);
  };

  updateValue();
  slider.addEventListener('input', updateValue);
}

/**
 * Add role and ARIA attributes to tablist
 * @param {HTMLElement} container - The tablist container
 * @param {string} label - Label for the tablist
 */
export function setupTablist(container, label) {
  container.setAttribute('role', 'tablist');
  container.setAttribute('aria-label', label);

  const tabs = container.querySelectorAll('.provider-tab');
  tabs.forEach((tab, index) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', tab.classList.contains('active') ? 'true' : 'false');
    tab.setAttribute('tabindex', tab.classList.contains('active') ? '0' : '-1');
  });
}
