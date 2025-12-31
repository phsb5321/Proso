/**
 * VoxPage Onboarding Component
 * Shows first-time user guidance with tooltip highlighting the play button
 */

const STORAGE_KEY = 'ui';

/**
 * Check if onboarding has been completed
 * @returns {Promise<boolean>}
 */
export async function isOnboardingComplete() {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY]?.onboardingComplete === true;
  } catch (error) {
    console.error('Error checking onboarding status:', error);
    return false;
  }
}

/**
 * Mark onboarding as complete
 * @returns {Promise<void>}
 */
export async function completeOnboarding() {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY);
    const uiState = result[STORAGE_KEY] || {};
    uiState.onboardingComplete = true;
    await browser.storage.local.set({ [STORAGE_KEY]: uiState });

    // Also notify background script
    try {
      await browser.runtime.sendMessage({ action: 'setOnboardingComplete' });
    } catch (e) {
      // Background might not have this handler yet
    }
  } catch (error) {
    console.error('Error completing onboarding:', error);
  }
}

/**
 * Show the onboarding tooltip
 * @param {HTMLElement} targetElement - Element to highlight (usually play button)
 * @returns {HTMLElement} - The overlay element (for cleanup)
 */
export function showOnboardingTooltip(targetElement) {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.id = 'onboardingOverlay';

  // Create tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'onboarding-tooltip';
  tooltip.setAttribute('role', 'dialog');
  tooltip.setAttribute('aria-labelledby', 'onboarding-title');
  tooltip.setAttribute('aria-describedby', 'onboarding-text');

  tooltip.innerHTML = `
    <h2 id="onboarding-title" class="onboarding-title">Welcome to VoxPage!</h2>
    <p id="onboarding-text" class="onboarding-text">
      Click the play button to have any webpage read aloud to you.
      Select text first for "Selection" mode, or read the whole page with "Full Page" mode.
    </p>
    <button id="onboardingDismiss" class="onboarding-dismiss">
      Got it!
    </button>
  `;

  // Position tooltip above the target element
  const positionTooltip = () => {
    const rect = targetElement.getBoundingClientRect();
    const tooltipHeight = 160; // Approximate height

    tooltip.style.left = '50%';
    tooltip.style.transform = 'translateX(-50%)';
    tooltip.style.top = `${rect.top - tooltipHeight - 20}px`;
  };

  overlay.appendChild(tooltip);
  document.body.appendChild(overlay);

  positionTooltip();

  // Highlight the target element above the overlay
  targetElement.style.position = 'relative';
  targetElement.style.zIndex = 'var(--z-overlay-content)';

  // Setup dismiss handler
  const dismissBtn = document.getElementById('onboardingDismiss');
  const handleDismiss = async () => {
    await completeOnboarding();
    hideOnboardingTooltip();
  };

  dismissBtn.addEventListener('click', handleDismiss);

  // Also dismiss when clicking overlay (outside tooltip)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      handleDismiss();
    }
  });

  // Handle Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      handleDismiss();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  // Focus the dismiss button for keyboard users
  dismissBtn.focus();

  return overlay;
}

/**
 * Hide the onboarding tooltip
 */
export function hideOnboardingTooltip() {
  const overlay = document.getElementById('onboardingOverlay');
  if (overlay) {
    // Reset any highlighted element
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
      playBtn.style.position = '';
      playBtn.style.zIndex = '';
    }

    overlay.remove();
  }
}

/**
 * Initialize onboarding - check status and show tooltip if needed
 * @param {HTMLElement} playButton - The play button element to highlight
 * @returns {Promise<boolean>} - Whether onboarding was shown
 */
export async function initOnboarding(playButton) {
  const isComplete = await isOnboardingComplete();

  if (!isComplete && playButton) {
    // Small delay to ensure UI is fully rendered
    setTimeout(() => {
      showOnboardingTooltip(playButton);
    }, 300);
    return true;
  }

  return false;
}
