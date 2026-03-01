/**
 * Manifest Permissions Security Tests (T049)
 *
 * Validates that the extension manifest declares only required permissions,
 * has a real gecko extension ID (not a placeholder), and follows Firefox
 * extension best practices.
 *
 * These tests work against both the WXT source config (wxt.config.ts) and
 * the built manifest.json to catch issues at both levels.
 *
 * @see contracts/security-validation.yaml
 * @module tests/security/manifest-permissions
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '../..');
const BUILD_DIR = path.resolve(ROOT_DIR, '.output/firefox-mv2');
const WXT_CONFIG_PATH = path.resolve(ROOT_DIR, 'wxt.config.ts');

function buildExists(): boolean {
  return fs.existsSync(BUILD_DIR) && fs.existsSync(path.join(BUILD_DIR, 'manifest.json'));
}

function getBuiltManifest(): Record<string, unknown> | null {
  if (!buildExists()) return null;
  const manifestPath = path.join(BUILD_DIR, 'manifest.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
}

describe('Manifest Permissions', () => {
  describe('No <all_urls> permission', () => {
    it('should not have <all_urls> in permissions', () => {
      const manifest = getBuiltManifest();
      if (!manifest) {
        console.log('Skipping: Build not found');
        return;
      }

      const permissions = (manifest.permissions as string[]) || [];
      expect(permissions).not.toContain('<all_urls>');
    });

    it('should not have <all_urls> in host_permissions', () => {
      const manifest = getBuiltManifest();
      if (!manifest) {
        console.log('Skipping: Build not found');
        return;
      }

      const hostPermissions = (manifest.host_permissions as string[]) || [];
      expect(hostPermissions).not.toContain('<all_urls>');
    });
  });

  describe('Required permissions only', () => {
    /**
     * Allowed permissions for Proso.
     * In MV2 Firefox, host_permissions are merged into permissions.
     * Any permission NOT in this list is a violation.
     */
    const ALLOWED_PERMISSIONS = [
      'activeTab',
      'storage',
      'unlimitedStorage', // 028-smart-audio-cache: IndexedDB audio cache (500MB+)
      'tabs', // Tab management and URL tracking
      'contextMenus', // Right-click menu integration
      'scripting', // Programmatic content script injection
      'https://api.elevenlabs.io/*', // ElevenLabs TTS API
      'https://logs.proso.com.br/*', // Telemetry gateway
    ];

    it('should only declare allowed permissions', () => {
      const manifest = getBuiltManifest();
      if (!manifest) {
        console.log('Skipping: Build not found');
        return;
      }

      const permissions = (manifest.permissions as string[]) || [];
      const unexpected = permissions.filter((p) => !ALLOWED_PERMISSIONS.includes(p));

      if (unexpected.length > 0) {
        console.log('Unexpected permissions found:', unexpected);
      }

      expect(unexpected).toEqual([]);
    });

    it('should include required permissions', () => {
      const manifest = getBuiltManifest();
      if (!manifest) {
        console.log('Skipping: Build not found');
        return;
      }

      const permissions = (manifest.permissions as string[]) || [];
      expect(permissions).toContain('activeTab');
      expect(permissions).toContain('storage');
    });
  });

  describe('Gecko extension ID', () => {
    it('should not have placeholder gecko ID in wxt.config.ts', () => {
      expect(fs.existsSync(WXT_CONFIG_PATH)).toBe(true);

      const content = fs.readFileSync(WXT_CONFIG_PATH, 'utf-8');

      // The placeholder ID that must be replaced
      expect(content).not.toContain('proso@example.com');
    });

    it('should have a real gecko ID in built manifest', () => {
      const manifest = getBuiltManifest();
      if (!manifest) {
        console.log('Skipping: Build not found');
        return;
      }

      // MV2 Firefox uses applications.gecko.id or browser_specific_settings.gecko.id
      const gecko =
        (manifest.browser_specific_settings as Record<string, Record<string, string>>)?.gecko ||
        (manifest.applications as Record<string, Record<string, string>>)?.gecko;

      expect(gecko).toBeDefined();
      expect(gecko?.id).toBeDefined();
      expect(gecko?.id).not.toBe('proso@example.com');
      // Should look like a valid extension ID (email-style or UUID-style)
      expect(gecko?.id).toMatch(/(@|\{[0-9a-f-]+\})/i);
    });
  });

  describe('Manifest version', () => {
    it('should be manifest version 2 for Firefox build', () => {
      const manifest = getBuiltManifest();
      if (!manifest) {
        console.log('Skipping: Build not found');
        return;
      }

      expect(manifest.manifest_version).toBe(2);
    });
  });

  describe('No dangerous permissions', () => {
    it('should not request nativeMessaging, proxy, or debugger', () => {
      const manifest = getBuiltManifest();
      if (!manifest) {
        console.log('Skipping: Build not found');
        return;
      }

      const permissions = (manifest.permissions as string[]) || [];
      const dangerous = ['nativeMessaging', 'proxy', 'debugger'];
      const found = permissions.filter((p) => dangerous.includes(p));

      expect(found).toEqual([]);
    });
  });
});
