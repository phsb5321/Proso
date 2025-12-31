/**
 * Unit tests for VoxPage Onboarding Component
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  isOnboardingComplete,
  completeOnboarding,
  showOnboardingTooltip,
  hideOnboardingTooltip,
  initOnboarding
} from '../../popup/components/onboarding.js';

describe('Onboarding Component', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';

    // Reset mocks
    jest.clearAllMocks();
    browser.storage.local.get.mockResolvedValue({});
    browser.storage.local.set.mockResolvedValue(undefined);
    browser.runtime.sendMessage.mockResolvedValue(undefined);
  });

  describe('isOnboardingComplete', () => {
    it('returns false when storage is empty', async () => {
      browser.storage.local.get.mockResolvedValue({});

      const result = await isOnboardingComplete();

      expect(result).toBe(false);
      expect(browser.storage.local.get).toHaveBeenCalledWith('ui');
    });

    it('returns false when onboardingComplete is not set', async () => {
      browser.storage.local.get.mockResolvedValue({ ui: {} });

      const result = await isOnboardingComplete();

      expect(result).toBe(false);
    });

    it('returns true when onboardingComplete is true', async () => {
      browser.storage.local.get.mockResolvedValue({
        ui: { onboardingComplete: true }
      });

      const result = await isOnboardingComplete();

      expect(result).toBe(true);
    });

    it('returns false on storage error', async () => {
      browser.storage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await isOnboardingComplete();

      expect(result).toBe(false);
    });
  });

  describe('completeOnboarding', () => {
    it('sets onboardingComplete to true in storage', async () => {
      browser.storage.local.get.mockResolvedValue({});

      await completeOnboarding();

      expect(browser.storage.local.set).toHaveBeenCalledWith({
        ui: { onboardingComplete: true }
      });
    });

    it('preserves existing ui state', async () => {
      browser.storage.local.get.mockResolvedValue({
        ui: { theme: 'dark' }
      });

      await completeOnboarding();

      expect(browser.storage.local.set).toHaveBeenCalledWith({
        ui: { theme: 'dark', onboardingComplete: true }
      });
    });

    it('sends message to background script', async () => {
      browser.storage.local.get.mockResolvedValue({});

      await completeOnboarding();

      expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'setOnboardingComplete'
      });
    });

    it('handles background message error gracefully', async () => {
      browser.storage.local.get.mockResolvedValue({});
      browser.runtime.sendMessage.mockRejectedValue(new Error('No handler'));

      // Should not throw
      await expect(completeOnboarding()).resolves.not.toThrow();
    });
  });

  describe('showOnboardingTooltip', () => {
    let targetElement;

    beforeEach(() => {
      targetElement = document.createElement('button');
      targetElement.id = 'playBtn';
      targetElement.getBoundingClientRect = jest.fn(() => ({
        top: 200,
        left: 100,
        width: 56,
        height: 56
      }));
      document.body.appendChild(targetElement);
    });

    it('creates overlay element', () => {
      showOnboardingTooltip(targetElement);

      const overlay = document.getElementById('onboardingOverlay');
      expect(overlay).not.toBeNull();
      expect(overlay.className).toBe('onboarding-overlay');
    });

    it('creates tooltip with correct structure', () => {
      showOnboardingTooltip(targetElement);

      const tooltip = document.querySelector('.onboarding-tooltip');
      expect(tooltip).not.toBeNull();
      expect(tooltip.getAttribute('role')).toBe('dialog');
      expect(tooltip.querySelector('.onboarding-title')).not.toBeNull();
      expect(tooltip.querySelector('.onboarding-text')).not.toBeNull();
      expect(tooltip.querySelector('.onboarding-dismiss')).not.toBeNull();
    });

    it('positions tooltip above target element', () => {
      showOnboardingTooltip(targetElement);

      const tooltip = document.querySelector('.onboarding-tooltip');
      expect(tooltip.style.left).toBe('50%');
      expect(tooltip.style.transform).toBe('translateX(-50%)');
    });

    it('highlights target element with z-index', () => {
      showOnboardingTooltip(targetElement);

      expect(targetElement.style.position).toBe('relative');
      expect(targetElement.style.zIndex).toBe('var(--z-overlay-content)');
    });

    it('focuses dismiss button for keyboard accessibility', () => {
      const focusSpy = jest.spyOn(HTMLElement.prototype, 'focus');

      showOnboardingTooltip(targetElement);

      expect(focusSpy).toHaveBeenCalled();
      focusSpy.mockRestore();
    });

    it('returns the overlay element', () => {
      const result = showOnboardingTooltip(targetElement);

      expect(result).toBe(document.getElementById('onboardingOverlay'));
    });
  });

  describe('hideOnboardingTooltip', () => {
    beforeEach(() => {
      // Create overlay
      const overlay = document.createElement('div');
      overlay.id = 'onboardingOverlay';
      document.body.appendChild(overlay);

      // Create play button with styles
      const playBtn = document.createElement('button');
      playBtn.id = 'playBtn';
      playBtn.style.position = 'relative';
      playBtn.style.zIndex = 'var(--z-overlay-content)';
      document.body.appendChild(playBtn);
    });

    it('removes overlay from DOM', () => {
      hideOnboardingTooltip();

      expect(document.getElementById('onboardingOverlay')).toBeNull();
    });

    it('resets play button styles', () => {
      hideOnboardingTooltip();

      const playBtn = document.getElementById('playBtn');
      expect(playBtn.style.position).toBe('');
      expect(playBtn.style.zIndex).toBe('');
    });

    it('handles missing overlay gracefully', () => {
      document.getElementById('onboardingOverlay').remove();

      expect(() => hideOnboardingTooltip()).not.toThrow();
    });

    it('handles missing play button gracefully', () => {
      document.getElementById('playBtn').remove();

      expect(() => hideOnboardingTooltip()).not.toThrow();
    });
  });

  describe('initOnboarding', () => {
    let playButton;

    beforeEach(() => {
      jest.useFakeTimers();

      playButton = document.createElement('button');
      playButton.id = 'playBtn';
      playButton.getBoundingClientRect = jest.fn(() => ({
        top: 200, left: 100, width: 56, height: 56
      }));
      document.body.appendChild(playButton);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns true and shows tooltip when not complete', async () => {
      browser.storage.local.get.mockResolvedValue({});

      const result = await initOnboarding(playButton);

      expect(result).toBe(true);

      // Fast-forward timer
      jest.advanceTimersByTime(300);

      expect(document.getElementById('onboardingOverlay')).not.toBeNull();
    });

    it('returns false when already complete', async () => {
      browser.storage.local.get.mockResolvedValue({
        ui: { onboardingComplete: true }
      });

      const result = await initOnboarding(playButton);

      expect(result).toBe(false);

      jest.advanceTimersByTime(300);

      expect(document.getElementById('onboardingOverlay')).toBeNull();
    });

    it('returns false when no play button provided', async () => {
      browser.storage.local.get.mockResolvedValue({});

      const result = await initOnboarding(null);

      expect(result).toBe(false);
    });
  });
});
