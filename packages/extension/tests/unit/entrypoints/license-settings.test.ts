import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createLicenseSettingsController } from '../../../src/entrypoints/options/license-settings';
import type { LicenseStatus } from '../../../src/utils/license/license-status';

const EMPTY_STATUS: LicenseStatus = {
  configured: false,
  maskedKey: null,
  tier: null,
  credits: null,
  serverReachable: false,
};

const PAID_STATUS: LicenseStatus = {
  configured: true,
  maskedKey: '•••• 4c2a',
  tier: 'pro',
  credits: { total: 500_000, remaining: 412_500 },
  serverReachable: true,
};

function renderWallet(): {
  key: HTMLInputElement;
  save: HTMLButtonElement;
  status: HTMLElement;
} {
  document.body.innerHTML = `
    <label for="licenseKey">Licence key</label>
    <input id="licenseKey" type="password">
    <button id="saveLicenseKey" type="button">Save & validate</button>
    <div id="licenseStatus"></div>
  `;
  return {
    key: document.getElementById('licenseKey') as HTMLInputElement,
    save: document.getElementById('saveLicenseKey') as HTMLButtonElement,
    status: document.getElementById('licenseStatus') as HTMLElement,
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitFor(done: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!done()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for licence settings state');
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

describe('licence settings public controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('hydrates a paid plan from masked background state without filling the key field', async () => {
    const elements = renderWallet();
    const sendMessage = jest.fn(async () => ({ success: true, status: PAID_STATUS }));
    const controller = createLicenseSettingsController({
      sendMessage,
      announceSaved: jest.fn(),
      reportError: jest.fn(),
    });

    await controller.loadStatus();

    expect(sendMessage).toHaveBeenCalledWith({ type: 'license.getStatus' });
    expect(elements.key.value).toBe('');
    expect(elements.status.textContent).toContain('Plan: Pro');
    expect(elements.status.textContent).toContain('412,500 of 500,000 credits remaining');
    expect(elements.status.classList).toContain('provider-card__status--success');
  });

  it.each([
    ['no response', async () => undefined],
    ['a rejected round trip', async () => Promise.reject(new Error('raw-key-must-not-appear'))],
  ])(
    'reports an unreadable status for %s without reflecting error detail',
    async (_name, reply) => {
      const elements = renderWallet();
      const reportError = jest.fn();
      const controller = createLicenseSettingsController({
        sendMessage: jest.fn(reply),
        announceSaved: jest.fn(),
        reportError,
      });

      await controller.loadStatus();

      expect(elements.status.textContent).toBe(
        'The licence status could not be read from the extension.',
      );
      expect(elements.status.textContent).not.toContain('raw-key-must-not-appear');
      expect(elements.status.classList).toContain('provider-card__status--error');
    },
  );

  it('submits the trimmed key by click, clears it on success, and restores the button', async () => {
    const elements = renderWallet();
    const announceSaved = jest.fn();
    const sendMessage = jest.fn(async () => ({ success: true, status: PAID_STATUS }));
    createLicenseSettingsController({ sendMessage, announceSaved, reportError: jest.fn() });
    elements.key.value = '  candidate-key  ';

    elements.save.click();
    await waitFor(() => announceSaved.mock.calls.length === 1);

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'license.validate',
      licenseKey: 'candidate-key',
    });
    expect(elements.key.value).toBe('');
    expect(elements.key.type).toBe('password');
    expect(elements.key.hasAttribute('aria-invalid')).toBe(false);
    expect(elements.status.textContent).toContain('Licence validated.');
    expect(elements.status.textContent).toContain('•••• 4c2a');
    expect(elements.status.classList).toContain('provider-card__status--success');
    expect(elements.save.disabled).toBe(false);
    expect(elements.save.hasAttribute('aria-busy')).toBe(false);
    expect(elements.save.textContent).toBe('Save & validate');
  });

  it('submits with Enter and keeps the candidate visible when validation fails', async () => {
    const elements = renderWallet();
    const sendMessage = jest.fn(async () => ({
      success: false as const,
      error: { message: 'The server does not recognise this key.' },
      status: EMPTY_STATUS,
    }));
    createLicenseSettingsController({
      sendMessage,
      announceSaved: jest.fn(),
      reportError: jest.fn(),
    });
    elements.key.value = 'unknown-candidate';

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    elements.key.dispatchEvent(event);
    await waitFor(() => elements.key.getAttribute('aria-invalid') === 'true');

    expect(event.defaultPrevented).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'license.validate',
      licenseKey: 'unknown-candidate',
    });
    expect(elements.key.value).toBe('unknown-candidate');
    expect(elements.status.textContent).toContain('Nothing was saved.');
    expect(elements.status.classList).toContain('provider-card__status--error');
  });

  it.each([
    ['no response', async () => undefined],
    ['a rejected round trip', async () => Promise.reject(new Error('candidate-key'))],
  ])('fails closed for %s and never renders rejected detail', async (_name, reply) => {
    const elements = renderWallet();
    const reportError = jest.fn();
    createLicenseSettingsController({
      sendMessage: jest.fn(reply),
      announceSaved: jest.fn(),
      reportError,
    });
    elements.key.value = 'candidate-key';

    elements.save.click();
    await waitFor(() => !elements.save.disabled && elements.status.textContent !== 'Validating…');

    expect(elements.key.value).toBe('candidate-key');
    expect(elements.status.textContent).toBe('The extension did not answer the licence check.');
    expect(elements.status.textContent).not.toContain('candidate-key');
    if (_name === 'a rejected round trip') {
      expect(elements.key.getAttribute('aria-invalid')).toBe('true');
      expect(reportError).toHaveBeenCalledWith('Error validating licence key');
    }
  });

  it('coalesces repeated public activations while one validation is pending', async () => {
    const elements = renderWallet();
    const pending = deferred<unknown>();
    const sendMessage = jest.fn(() => pending.promise);
    createLicenseSettingsController({
      sendMessage,
      announceSaved: jest.fn(),
      reportError: jest.fn(),
    });
    elements.key.value = 'candidate-key';

    elements.save.click();
    elements.save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    elements.key.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitFor(() => elements.save.disabled);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(elements.save.textContent).toBe('Validating…');
    expect(elements.save.getAttribute('aria-busy')).toBe('true');

    pending.resolve({ success: true, status: PAID_STATUS });
    await waitFor(() => !elements.save.disabled);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('fails loudly when the public wallet controls are absent', () => {
    document.body.innerHTML = '<main></main>';
    expect(() =>
      createLicenseSettingsController({
        sendMessage: jest.fn(async () => undefined),
        announceSaved: jest.fn(),
        reportError: jest.fn(),
      }),
    ).toThrow('Required element not found: licenseKey');
  });
});
