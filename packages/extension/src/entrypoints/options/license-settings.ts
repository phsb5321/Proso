import { browser } from 'wxt/browser';
import {
  type LicenseStatus,
  describeLicenseAccepted,
  describeLicenseFailure,
  describeLicenseStatus,
  isPaidTier,
} from '../../utils/license/license-status';
import { createLogger } from '../../utils/logging/logger';
import { toast } from './components/toast';

const log = createLogger('options');

interface LicenseSettingsElements {
  readonly key: HTMLInputElement;
  readonly save: HTMLButtonElement;
  readonly status: HTMLElement;
}

type LicenseSettingsRequest =
  | { readonly type: 'license.getStatus' }
  | { readonly type: 'license.validate'; readonly licenseKey: string };

type LicenseStatusResponse = { readonly success: true; readonly status: LicenseStatus };
type LicenseValidationResponse =
  | LicenseStatusResponse
  | {
      readonly success: false;
      readonly error: { readonly message: string };
      readonly status: LicenseStatus;
    };

interface LicenseSettingsDependencies {
  readonly sendMessage: (message: LicenseSettingsRequest) => Promise<unknown>;
  readonly announceSaved: () => void;
  readonly reportError: (message: string) => void;
}

export interface LicenseSettingsController {
  /** Hydrate only the masked/plan status; the raw stored key never reaches the page. */
  loadStatus(): Promise<void>;
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id) as T | null;
  if (!element) throw new Error(`Required element not found: ${id}`);
  return element;
}

function getElements(): LicenseSettingsElements {
  return {
    key: requiredElement<HTMLInputElement>('licenseKey'),
    save: requiredElement<HTMLButtonElement>('saveLicenseKey'),
    status: requiredElement<HTMLElement>('licenseStatus'),
  };
}

/**
 * Wire the public paid-account controls before the rest of settings hydration.
 *
 * The closure owns the in-flight lock, so two events on this page cannot race.
 * Cross-page serialization remains at the background handler, where it protects
 * separate settings tabs too.
 */
export function createLicenseSettingsController(
  overrides: Partial<LicenseSettingsDependencies> = {},
): LicenseSettingsController {
  const elements = getElements();
  const dependencies: LicenseSettingsDependencies = {
    sendMessage: (message) => browser.runtime.sendMessage(message),
    announceSaved: () => toast.success('Licence key saved'),
    // Runtime errors are intentionally not attached: an adapter error may echo
    // the submitted credential, and logs are not a safe place for that detail.
    reportError: (message) => log.error(message),
    ...overrides,
  };
  let validationInFlight = false;

  const showStatus = (message: string, type: 'success' | 'error' | 'loading' | 'idle'): void => {
    elements.status.textContent = message;
    elements.status.className =
      type === 'idle'
        ? 'provider-card__status'
        : `provider-card__status provider-card__status--${type}`;
  };

  const loadStatus = async (): Promise<void> => {
    try {
      const response = (await dependencies.sendMessage({ type: 'license.getStatus' })) as
        | LicenseStatusResponse
        | undefined;
      if (!response?.success) {
        showStatus('The licence status could not be read from the extension.', 'error');
        return;
      }
      showStatus(
        describeLicenseStatus(response.status),
        response.status.configured && isPaidTier(response.status.tier) ? 'success' : 'idle',
      );
    } catch {
      dependencies.reportError('Error loading licence status');
      showStatus('The licence status could not be read from the extension.', 'error');
    }
  };

  const validateAndSave = async (): Promise<void> => {
    if (validationInFlight) return;
    validationInFlight = true;
    const key = elements.key.value.trim();
    const label = elements.save.textContent;

    elements.save.disabled = true;
    elements.save.setAttribute('aria-busy', 'true');
    elements.key.removeAttribute('aria-invalid');
    elements.save.textContent = 'Validating…';
    showStatus('Validating…', 'loading');

    try {
      const response = (await dependencies.sendMessage({
        type: 'license.validate',
        licenseKey: key,
      })) as LicenseValidationResponse | undefined;

      if (!response) {
        showStatus('The extension did not answer the licence check.', 'error');
        return;
      }

      if (response.success) {
        elements.key.value = '';
        elements.key.type = 'password';
        showStatus(describeLicenseAccepted(response.status), 'success');
        dependencies.announceSaved();
        return;
      }

      elements.key.setAttribute('aria-invalid', 'true');
      showStatus(describeLicenseFailure(response.error.message, response.status), 'error');
    } catch {
      dependencies.reportError('Error validating licence key');
      elements.key.setAttribute('aria-invalid', 'true');
      showStatus('The extension did not answer the licence check.', 'error');
    } finally {
      validationInFlight = false;
      elements.save.disabled = false;
      elements.save.removeAttribute('aria-busy');
      elements.save.textContent = label ?? 'Save & validate';
    }
  };

  elements.save.addEventListener('click', () => {
    void validateAndSave();
  });
  elements.key.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void validateAndSave();
  });

  return { loadStatus };
}
