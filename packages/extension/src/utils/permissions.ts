// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso Permissions Utility
 *
 * Utilities for requesting and checking browser permissions.
 *
 * @module utils/permissions
 */

/**
 * Check if we have permission for a specific URL origin
 *
 * @param url - URL to check permission for
 * @returns True if permission is granted
 */
export async function hasHostPermission(url: string): Promise<boolean> {
  try {
    const urlObj = new URL(url);
    const origin = `${urlObj.protocol}//${urlObj.host}/*`;

    const result = await browser.permissions.contains({
      origins: [origin],
    });

    return result;
  } catch (error) {
    console.error('[Proso:Permissions] Error checking host permission:', error);
    return false;
  }
}

/**
 * Request permission for a specific URL origin
 *
 * @param url - URL to request permission for
 * @returns True if permission was granted
 */
export async function requestHostPermission(url: string): Promise<boolean> {
  try {
    const urlObj = new URL(url);
    const origin = `${urlObj.protocol}//${urlObj.host}/*`;

    const granted = await browser.permissions.request({
      origins: [origin],
    });

    if (granted) {
      console.log(`[Proso:Permissions] Permission granted for ${origin}`);
    } else {
      console.log(`[Proso:Permissions] Permission denied for ${origin}`);
    }

    return granted;
  } catch (error) {
    console.error('[Proso:Permissions] Error requesting host permission:', error);
    return false;
  }
}

/**
 * Ensure we have permission for a URL, requesting if necessary
 *
 * @param url - URL to ensure permission for
 * @returns True if permission is available
 */
export async function ensureHostPermission(url: string): Promise<boolean> {
  // First check if we already have permission
  const hasPermission = await hasHostPermission(url);
  if (hasPermission) {
    return true;
  }

  // Request permission if not already granted
  return requestHostPermission(url);
}

/**
 * Check if we have the activeTab permission
 *
 * @returns True if activeTab permission is granted
 */
export async function hasActiveTabPermission(): Promise<boolean> {
  try {
    const result = await browser.permissions.contains({
      permissions: ['activeTab'],
    });
    return result;
  } catch (error) {
    console.error('[Proso:Permissions] Error checking activeTab permission:', error);
    return false;
  }
}

/**
 * Check if we have storage permission (unlimitedStorage)
 *
 * @returns True if unlimitedStorage permission is granted
 */
export async function hasUnlimitedStoragePermission(): Promise<boolean> {
  try {
    const result = await browser.permissions.contains({
      permissions: ['unlimitedStorage'],
    });
    return result;
  } catch (error) {
    console.error('[Proso:Permissions] Error checking unlimitedStorage permission:', error);
    return false;
  }
}

/**
 * Get all currently granted permissions
 *
 * @returns Object with permissions and origins arrays
 */
export async function getAllPermissions(): Promise<{
  permissions: string[];
  origins: string[];
}> {
  try {
    const result = await browser.permissions.getAll();
    return {
      permissions: result.permissions ?? [],
      origins: result.origins ?? [],
    };
  } catch (error) {
    console.error('[Proso:Permissions] Error getting all permissions:', error);
    return {
      permissions: [],
      origins: [],
    };
  }
}

/**
 * Check if current tab URL is accessible (not a restricted page)
 *
 * @param url - URL to check
 * @returns True if URL is accessible
 */
export function isAccessibleUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);

    // Restricted protocols
    const restrictedProtocols = ['chrome:', 'chrome-extension:', 'moz-extension:', 'about:', 'file:'];

    if (restrictedProtocols.includes(urlObj.protocol)) {
      return false;
    }

    // Restricted domains
    const restrictedDomains = [
      'chrome.google.com',
      'addons.mozilla.org',
      'microsoftedge.microsoft.com',
    ];

    if (restrictedDomains.some((domain) => urlObj.hostname.includes(domain))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Check if we can access the current active tab
 *
 * @returns Object with canAccess boolean and reason string
 */
export async function canAccessActiveTab(): Promise<{
  canAccess: boolean;
  reason?: string;
  url?: string;
}> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    if (!tab?.url) {
      return {
        canAccess: false,
        reason: 'No active tab found',
      };
    }

    if (!isAccessibleUrl(tab.url)) {
      return {
        canAccess: false,
        reason: 'Cannot access restricted pages (browser settings, add-on stores)',
        url: tab.url,
      };
    }

    return {
      canAccess: true,
      url: tab.url,
    };
  } catch (error) {
    return {
      canAccess: false,
      reason: `Error checking tab access: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
