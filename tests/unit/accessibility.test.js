/**
 * Unit tests for VoxPage Accessibility Helper Module
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  initAccessibility,
  announce,
  updatePlayButtonState,
  announceStop,
  announceError,
  announceParagraph,
  setupRovingTabindex,
  updateTabSelection,
  setupButtonKeyboard,
  setButtonLabel,
  setupSliderAccessibility,
  setupTablist
} from '../../popup/components/accessibility.js';

describe('Accessibility Helper Module', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('initAccessibility', () => {
    it('creates polite announcer element', () => {
      initAccessibility();

      const announcer = document.getElementById('srAnnouncer');
      expect(announcer).not.toBeNull();
      expect(announcer.getAttribute('aria-live')).toBe('polite');
      expect(announcer.getAttribute('aria-atomic')).toBe('true');
      expect(announcer.className).toBe('sr-only');
    });

    it('creates assertive announcer element', () => {
      initAccessibility();

      const assertive = document.getElementById('srAnnouncerAssertive');
      expect(assertive).not.toBeNull();
      expect(assertive.getAttribute('aria-live')).toBe('assertive');
      expect(assertive.getAttribute('aria-atomic')).toBe('true');
    });

    it('reuses existing announcer elements', () => {
      initAccessibility();
      initAccessibility();

      const announcers = document.querySelectorAll('[aria-live="polite"]');
      expect(announcers.length).toBe(1);
    });
  });

  describe('announce', () => {
    beforeEach(() => {
      initAccessibility();
    });

    it('sets message on polite announcer by default', () => {
      announce('Test message');
      jest.advanceTimersByTime(50);

      const announcer = document.getElementById('srAnnouncer');
      expect(announcer.textContent).toBe('Test message');
    });

    it('sets message on assertive announcer when assertive is true', () => {
      announce('Urgent message', true);
      jest.advanceTimersByTime(50);

      const assertive = document.getElementById('srAnnouncerAssertive');
      expect(assertive.textContent).toBe('Urgent message');
    });

    it('clears message before setting new one', () => {
      const announcer = document.getElementById('srAnnouncer');
      announcer.textContent = 'Old message';

      announce('New message');

      expect(announcer.textContent).toBe('');

      jest.advanceTimersByTime(50);
      expect(announcer.textContent).toBe('New message');
    });

    it('auto-initializes if not initialized', () => {
      document.body.innerHTML = '';

      announce('Auto init test');
      jest.advanceTimersByTime(50);

      expect(document.getElementById('srAnnouncer')).not.toBeNull();
    });
  });

  describe('updatePlayButtonState', () => {
    let button;

    beforeEach(() => {
      initAccessibility();
      button = document.createElement('button');
      document.body.appendChild(button);
    });

    it('sets aria-pressed to true when playing', () => {
      updatePlayButtonState(button, true);

      expect(button.getAttribute('aria-pressed')).toBe('true');
      expect(button.getAttribute('aria-label')).toBe('Pause');
    });

    it('sets aria-pressed to false when paused', () => {
      updatePlayButtonState(button, false);

      expect(button.getAttribute('aria-pressed')).toBe('false');
      expect(button.getAttribute('aria-label')).toBe('Play');
    });

    it('announces state change', () => {
      updatePlayButtonState(button, true);
      jest.advanceTimersByTime(50);

      const announcer = document.getElementById('srAnnouncer');
      expect(announcer.textContent).toBe('Playing');
    });

    it('handles null button gracefully', () => {
      expect(() => updatePlayButtonState(null, true)).not.toThrow();
    });
  });

  describe('announceStop', () => {
    beforeEach(() => {
      initAccessibility();
    });

    it('announces "Stopped"', () => {
      announceStop();
      jest.advanceTimersByTime(50);

      const announcer = document.getElementById('srAnnouncer');
      expect(announcer.textContent).toBe('Stopped');
    });
  });

  describe('announceError', () => {
    beforeEach(() => {
      initAccessibility();
    });

    it('uses assertive announcer for errors', () => {
      announceError('Connection failed');
      jest.advanceTimersByTime(50);

      const assertive = document.getElementById('srAnnouncerAssertive');
      expect(assertive.textContent).toBe('Connection failed');
    });
  });

  describe('announceParagraph', () => {
    beforeEach(() => {
      initAccessibility();
    });

    it('announces current paragraph position', () => {
      announceParagraph(3, 10);
      jest.advanceTimersByTime(50);

      const announcer = document.getElementById('srAnnouncer');
      expect(announcer.textContent).toBe('Paragraph 3 of 10');
    });
  });

  describe('setupRovingTabindex', () => {
    let container;
    let tabs;

    beforeEach(() => {
      container = document.createElement('div');
      container.innerHTML = `
        <button role="tab">Tab 1</button>
        <button role="tab">Tab 2</button>
        <button role="tab">Tab 3</button>
      `;
      document.body.appendChild(container);
      tabs = container.querySelectorAll('[role="tab"]');
    });

    it('sets first tab to tabindex 0', () => {
      setupRovingTabindex(container);

      expect(tabs[0].getAttribute('tabindex')).toBe('0');
    });

    it('sets other tabs to tabindex -1', () => {
      setupRovingTabindex(container);

      expect(tabs[1].getAttribute('tabindex')).toBe('-1');
      expect(tabs[2].getAttribute('tabindex')).toBe('-1');
    });

    it('handles ArrowRight key', () => {
      setupRovingTabindex(container);
      tabs[0].focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      container.dispatchEvent(event);

      expect(tabs[1].getAttribute('tabindex')).toBe('0');
      expect(tabs[0].getAttribute('tabindex')).toBe('-1');
    });

    it('handles ArrowLeft key', () => {
      setupRovingTabindex(container);
      tabs[0].focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
      container.dispatchEvent(event);

      // Should wrap to last
      expect(tabs[2].getAttribute('tabindex')).toBe('0');
    });

    it('handles Home key', () => {
      setupRovingTabindex(container);
      tabs[2].focus();

      const event = new KeyboardEvent('keydown', { key: 'Home' });
      container.dispatchEvent(event);

      expect(tabs[0].getAttribute('tabindex')).toBe('0');
    });

    it('handles End key', () => {
      setupRovingTabindex(container);
      tabs[0].focus();

      const event = new KeyboardEvent('keydown', { key: 'End' });
      container.dispatchEvent(event);

      expect(tabs[2].getAttribute('tabindex')).toBe('0');
    });

    it('handles empty container gracefully', () => {
      const emptyContainer = document.createElement('div');
      expect(() => setupRovingTabindex(emptyContainer)).not.toThrow();
    });
  });

  describe('updateTabSelection', () => {
    let container;
    let tabs;

    beforeEach(() => {
      container = document.createElement('div');
      container.innerHTML = `
        <button role="tab" aria-selected="false">Tab 1</button>
        <button role="tab" aria-selected="false">Tab 2</button>
      `;
      document.body.appendChild(container);
      tabs = container.querySelectorAll('[role="tab"]');
    });

    it('sets aria-selected to true for selected tab', () => {
      updateTabSelection(container, tabs[1]);

      expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    });

    it('sets aria-selected to false for other tabs', () => {
      updateTabSelection(container, tabs[1]);

      expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    });

    it('updates tabindex correctly', () => {
      updateTabSelection(container, tabs[1]);

      expect(tabs[1].getAttribute('tabindex')).toBe('0');
      expect(tabs[0].getAttribute('tabindex')).toBe('-1');
    });
  });

  describe('setupButtonKeyboard', () => {
    let container;
    let button;

    beforeEach(() => {
      container = document.createElement('div');
      button = document.createElement('button');
      button.onclick = jest.fn();
      container.appendChild(button);
      document.body.appendChild(container);
    });

    it('triggers click on Enter key', () => {
      setupButtonKeyboard(container);
      button.focus();

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true
      });
      Object.defineProperty(event, 'target', { value: button });
      container.dispatchEvent(event);

      expect(button.onclick).toHaveBeenCalled();
    });

    it('triggers click on Space key', () => {
      setupButtonKeyboard(container);
      button.focus();

      const event = new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true
      });
      Object.defineProperty(event, 'target', { value: button });
      container.dispatchEvent(event);

      expect(button.onclick).toHaveBeenCalled();
    });
  });

  describe('setButtonLabel', () => {
    it('sets aria-label on button', () => {
      const button = document.createElement('button');

      setButtonLabel(button, 'Settings');

      expect(button.getAttribute('aria-label')).toBe('Settings');
    });

    it('handles null button gracefully', () => {
      expect(() => setButtonLabel(null, 'Label')).not.toThrow();
    });

    it('handles empty label', () => {
      const button = document.createElement('button');

      setButtonLabel(button, '');

      expect(button.hasAttribute('aria-label')).toBe(false);
    });
  });

  describe('setupSliderAccessibility', () => {
    let slider;

    beforeEach(() => {
      slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0.5';
      slider.max = '2';
      slider.value = '1';
      document.body.appendChild(slider);
    });

    it('sets aria-label on slider', () => {
      setupSliderAccessibility(slider, 'Playback Speed');

      expect(slider.getAttribute('aria-label')).toBe('Playback Speed');
    });

    it('sets aria-valuemin and aria-valuemax', () => {
      setupSliderAccessibility(slider, 'Speed');

      expect(slider.getAttribute('aria-valuemin')).toBe('0.5');
      expect(slider.getAttribute('aria-valuemax')).toBe('2');
    });

    it('sets aria-valuenow and aria-valuetext', () => {
      setupSliderAccessibility(slider, 'Speed');

      expect(slider.getAttribute('aria-valuenow')).toBe('1');
      expect(slider.getAttribute('aria-valuetext')).toBe('1x speed');
    });

    it('updates values on input', () => {
      setupSliderAccessibility(slider, 'Speed');

      slider.value = '1.5';
      slider.dispatchEvent(new Event('input'));

      expect(slider.getAttribute('aria-valuenow')).toBe('1.5');
      expect(slider.getAttribute('aria-valuetext')).toBe('1.5x speed');
    });

    it('handles null slider gracefully', () => {
      expect(() => setupSliderAccessibility(null, 'Label')).not.toThrow();
    });
  });

  describe('setupTablist', () => {
    let container;

    beforeEach(() => {
      container = document.createElement('div');
      container.innerHTML = `
        <button class="provider-tab">Provider 1</button>
        <button class="provider-tab active">Provider 2</button>
      `;
      document.body.appendChild(container);
    });

    it('sets role="tablist" on container', () => {
      setupTablist(container, 'Select Provider');

      expect(container.getAttribute('role')).toBe('tablist');
    });

    it('sets aria-label on container', () => {
      setupTablist(container, 'Select Provider');

      expect(container.getAttribute('aria-label')).toBe('Select Provider');
    });

    it('sets role="tab" on each tab', () => {
      setupTablist(container, 'Select Provider');

      const tabs = container.querySelectorAll('.provider-tab');
      tabs.forEach(tab => {
        expect(tab.getAttribute('role')).toBe('tab');
      });
    });

    it('sets aria-selected correctly based on active class', () => {
      setupTablist(container, 'Select Provider');

      const tabs = container.querySelectorAll('.provider-tab');
      expect(tabs[0].getAttribute('aria-selected')).toBe('false');
      expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    });

    it('sets tabindex correctly based on active class', () => {
      setupTablist(container, 'Select Provider');

      const tabs = container.querySelectorAll('.provider-tab');
      expect(tabs[0].getAttribute('tabindex')).toBe('-1');
      expect(tabs[1].getAttribute('tabindex')).toBe('0');
    });
  });
});
