// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Provider Card Component
 * Displays a single API provider configuration card with test and save functionality
 *
 * @module entrypoints/options/components/provider-card
 * @description FR-015, FR-010 - Provider cards with branding and status
 */

export interface ProviderConfig {
  id: string;
  name: string;
  description: string;
  keyPlaceholder: string;
  docsUrl: string;
  brandColor: string;
  testSupported: boolean;
}

export interface ProviderCardState {
  apiKey: string;
  isVisible: boolean;
  testStatus: 'idle' | 'testing' | 'success' | 'error';
  testMessage: string;
  isDirty: boolean;
}

/**
 * Provider configurations with branding
 */
export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'High-quality voices with natural speech patterns',
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    brandColor: '#10a37f',
    testSupported: true,
  },
  elevenlabs: {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    description: 'Premium voice cloning and multilingual support',
    keyPlaceholder: 'xi-...',
    docsUrl: 'https://elevenlabs.io/api',
    brandColor: '#5e5ce6',
    testSupported: true,
  },
  cartesia: {
    id: 'cartesia',
    name: 'Cartesia',
    description: 'Fast, low-latency voice synthesis',
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://cartesia.ai/docs',
    brandColor: '#ff6b35',
    testSupported: true,
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast inference with LPU technology',
    keyPlaceholder: 'gsk_...',
    docsUrl: 'https://console.groq.com/keys',
    brandColor: '#f55036',
    testSupported: true,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'AI assistant for content processing',
    keyPlaceholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    brandColor: '#cc785c',
    testSupported: false,
  },
};

/**
 * Create a provider card element
 */
export function createProviderCard(
  config: ProviderConfig,
  initialKey = '',
  callbacks: {
    onTest: (providerId: string, apiKey: string) => Promise<{ success: boolean; message: string }>;
    onSave: (providerId: string, apiKey: string) => Promise<void>;
  },
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'provider-card';
  card.dataset.provider = config.id;
  card.style.setProperty('--provider-color', config.brandColor);

  // Header with provider name and badge
  const header = document.createElement('div');
  header.className = 'provider-card__header';

  const badge = document.createElement('span');
  badge.className = `voxpage-badge voxpage-badge--${config.id}`;
  badge.textContent = config.name;
  header.appendChild(badge);

  const description = document.createElement('p');
  description.className = 'provider-card__description';
  description.textContent = config.description;

  // Input wrapper
  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'provider-card__input-wrapper';

  const input = document.createElement('input');
  input.type = 'password';
  input.id = `${config.id}Key`;
  input.className = 'voxpage-input provider-card__input';
  input.placeholder = config.keyPlaceholder;
  input.value = initialKey;
  input.autocomplete = 'off';
  input.spellcheck = false;

  // Toggle visibility button
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className =
    'voxpage-button voxpage-button--ghost voxpage-button--icon provider-card__toggle';
  toggleBtn.setAttribute('aria-label', 'Toggle API key visibility');
  toggleBtn.dataset.target = input.id;

  const eyeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  eyeIcon.setAttribute('class', 'eye-icon');
  eyeIcon.setAttribute('viewBox', '0 0 24 24');
  eyeIcon.setAttribute('fill', 'none');
  eyeIcon.setAttribute('stroke', 'currentColor');
  eyeIcon.setAttribute('stroke-width', '2');

  const eyePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  eyePath.setAttribute('d', 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z');
  const eyeCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  eyeCircle.setAttribute('cx', '12');
  eyeCircle.setAttribute('cy', '12');
  eyeCircle.setAttribute('r', '3');

  eyeIcon.appendChild(eyePath);
  eyeIcon.appendChild(eyeCircle);
  toggleBtn.appendChild(eyeIcon);

  inputWrapper.appendChild(input);
  inputWrapper.appendChild(toggleBtn);

  // Actions row
  const actions = document.createElement('div');
  actions.className = 'provider-card__actions';

  // Test button (if supported)
  if (config.testSupported) {
    const testBtn = document.createElement('button');
    testBtn.type = 'button';
    testBtn.className = 'voxpage-button voxpage-button--secondary provider-card__test-btn';
    testBtn.textContent = 'Test';
    testBtn.dataset.provider = config.id;

    testBtn.addEventListener('click', async () => {
      const apiKey = input.value.trim();
      if (!apiKey) {
        updateStatus(card, 'error', 'Please enter an API key');
        return;
      }

      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';
      updateStatus(card, 'testing', 'Testing connection...');

      try {
        const result = await callbacks.onTest(config.id, apiKey);
        if (result.success) {
          updateStatus(card, 'success', result.message);
        } else {
          updateStatus(card, 'error', result.message);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Test failed';
        updateStatus(card, 'error', message);
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = 'Test';
      }
    });

    actions.appendChild(testBtn);
  }

  // Save button
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'voxpage-button voxpage-button--primary provider-card__save-btn';
  saveBtn.textContent = 'Save';
  saveBtn.dataset.provider = config.id;

  saveBtn.addEventListener('click', async () => {
    const apiKey = input.value.trim();
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      await callbacks.onSave(config.id, apiKey);
      updateStatus(card, 'success', 'Saved!');
      card.classList.remove('provider-card--dirty');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed';
      updateStatus(card, 'error', message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  });

  actions.appendChild(saveBtn);

  // Status indicator
  const status = document.createElement('div');
  status.className = 'provider-card__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  // Docs link
  const docsLink = document.createElement('a');
  docsLink.className = 'provider-card__docs-link';
  docsLink.href = config.docsUrl;
  docsLink.target = '_blank';
  docsLink.rel = 'noopener noreferrer';
  docsLink.textContent = 'Get API Key';

  // Event listeners
  toggleBtn.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    toggleBtn.setAttribute(
      'aria-label',
      input.type === 'password' ? 'Show API key' : 'Hide API key',
    );
  });

  // Track dirty state
  input.addEventListener('input', () => {
    card.classList.add('provider-card--dirty');
  });

  // Auto-trim on paste (T037)
  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text') || '';
    input.value = text.trim();
    card.classList.add('provider-card--dirty');
  });

  // Assemble card
  card.appendChild(header);
  card.appendChild(description);
  card.appendChild(inputWrapper);
  card.appendChild(actions);
  card.appendChild(status);
  card.appendChild(docsLink);

  return card;
}

/**
 * Update the status display on a provider card
 */
function updateStatus(
  card: HTMLElement,
  type: 'idle' | 'testing' | 'success' | 'error',
  message: string,
): void {
  const status = card.querySelector('.provider-card__status');
  if (!status) return;

  // Clear previous classes
  status.className = 'provider-card__status';

  if (type === 'idle') {
    status.textContent = '';
    return;
  }

  status.classList.add(`provider-card__status--${type}`);
  status.textContent = message;

  // Auto-hide success/error after 5 seconds
  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      status.textContent = '';
      status.className = 'provider-card__status';
    }, 5000);
  }
}

/**
 * Get the current API key value from a provider card
 */
export function getProviderCardValue(card: HTMLElement): string {
  const input = card.querySelector<HTMLInputElement>('.provider-card__input');
  return input?.value.trim() || '';
}

/**
 * Set the API key value on a provider card
 */
export function setProviderCardValue(card: HTMLElement, value: string): void {
  const input = card.querySelector<HTMLInputElement>('.provider-card__input');
  if (input) {
    input.value = value;
  }
}
