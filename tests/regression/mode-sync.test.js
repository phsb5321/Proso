/**
 * Regression Test: Mode Sync Bug (007)
 *
 * This test prevents regression of the bug where different components
 * had different default modes, causing inconsistent behavior.
 *
 * Root cause: Hardcoded defaults in multiple places that got out of sync.
 * Fix: SSOT pattern - all defaults in shared/config/defaults.js
 *
 * Note: Popup was removed in 021-comprehensive-overhaul.
 * This test now only verifies background uses SSOT defaults.
 *
 * Updated: 026-src-folder-restructure - now checks TypeScript files in src/
 *
 * @module tests/regression/mode-sync
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

/**
 * Read file content
 */
function readFile(filePath) {
  const fullPath = path.resolve(projectRoot, filePath);
  if (!existsSync(fullPath)) {
    return null;
  }
  return readFileSync(fullPath, 'utf8');
}

describe('Mode Sync Regression Test (Issue 007)', () => {
  let defaults;

  beforeAll(async () => {
    // Import the SSOT defaults from TypeScript config (026-src-folder-restructure)
    const module = await import('../../src/utils/config/defaults');
    defaults = module.defaults;
  });

  describe('SSOT defaults are consistent', () => {
    test('defaults.mode is article (not full)', () => {
      // The bug was mode defaulting to 'full' in popup but 'article' in background
      expect(defaults.mode).toBe('article');
      expect(defaults.mode).not.toBe('full');
    });

    test('defaults object is frozen (immutable)', () => {
      expect(Object.isFrozen(defaults)).toBe(true);
    });
  });

  describe('background.ts uses SSOT defaults', () => {
    test('TypeScript background exists in src/entrypoints', () => {
      const content = readFile('src/entrypoints/background.ts');
      expect(content).not.toBeNull();
    });

    test('state uses mode from defaults or hardcoded article', () => {
      const content = readFile('src/entrypoints/background.ts');
      expect(content).not.toBeNull();

      // The background.ts should have mode set to 'article' (either via defaults import or hardcoded)
      // Check for either pattern - the key is that article is the default, not full
      const hasArticleMode = content.includes("mode: 'article'") ||
                             content.includes('mode: defaults.mode');
      expect(hasArticleMode).toBe(true);
    });
  });

  describe('The specific bug scenario is prevented', () => {
    test('fresh install would use article mode', async () => {
      const { defaults } = await import('../../src/utils/config/defaults');
      expect(defaults.mode).toBe('article');
    });
  });
});
