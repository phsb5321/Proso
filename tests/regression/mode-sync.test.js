/**
 * Regression Test: Mode Sync Bug (007)
 *
 * This test prevents regression of the bug where:
 * - Popup showed "Full Page" as active (mode: 'full')
 * - Background used "Article" mode (mode: 'article')
 * - Result: 666 paragraphs extracted instead of article content
 *
 * Root cause: Hardcoded defaults in multiple places that got out of sync.
 * Fix: SSOT pattern - all defaults in shared/config/defaults.js
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
    // Import the SSOT defaults
    const module = await import('../../shared/config/defaults.js');
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

  describe('popup-controller.js uses SSOT defaults', () => {
    test('imports from shared/config/defaults.js', () => {
      const content = readFile('popup/popup-controller.js');
      expect(content).not.toBeNull();

      // Should import defaults
      expect(content).toMatch(/import\s*{[^}]*defaults[^}]*}\s*from\s*['"]\.\.\/shared\/config/);
    });

    test('state.currentMode uses defaults.mode', () => {
      const content = readFile('popup/popup-controller.js');
      expect(content).not.toBeNull();

      // Should use defaults.mode for currentMode
      expect(content).toMatch(/currentMode:\s*defaults\.mode/);
    });

    test('does not have hardcoded mode in state', () => {
      const content = readFile('popup/popup-controller.js');
      expect(content).not.toBeNull();

      // Should NOT have currentMode: 'full' or currentMode: 'article' literals
      expect(content).not.toMatch(/currentMode:\s*['"](?:full|article|selection)['"]/);
    });
  });

  describe('playback-controller.js uses SSOT defaults', () => {
    test('imports from shared/config/defaults.js', () => {
      const content = readFile('background/playback-controller.js');
      expect(content).not.toBeNull();

      expect(content).toMatch(/import\s*{[^}]*defaults[^}]*}\s*from\s*['"]\.\.\/shared\/config/);
    });

    test('state.mode uses defaults.mode', () => {
      const content = readFile('background/playback-controller.js');
      expect(content).not.toBeNull();

      // Should use defaults.mode for mode
      expect(content).toMatch(/mode:\s*defaults\.mode/);
    });
  });

  describe('popup.html has no hardcoded active state', () => {
    test('mode buttons have no active class', () => {
      const content = readFile('popup/popup.html');
      expect(content).not.toBeNull();

      // Find mode button lines
      const modeButtonLines = content.match(/.*mode-btn.*data-mode.*>/g) || [];

      modeButtonLines.forEach((line) => {
        // No line should have both mode-btn and active
        expect(line).not.toMatch(/class="[^"]*mode-btn[^"]*active[^"]*"/);
        expect(line).not.toMatch(/class="[^"]*active[^"]*mode-btn[^"]*"/);
      });
    });

    test('article button does not have active class hardcoded', () => {
      const content = readFile('popup/popup.html');
      expect(content).not.toBeNull();

      // The article button specifically should not have active
      const articleButton = content.match(/<button[^>]*data-mode="article"[^>]*>/);
      expect(articleButton).not.toBeNull();
      expect(articleButton[0]).not.toMatch(/active/);
    });

    test('full button does not have active class hardcoded', () => {
      const content = readFile('popup/popup.html');
      expect(content).not.toBeNull();

      // The full button should definitely not have active (this was the bug)
      const fullButton = content.match(/<button[^>]*data-mode="full"[^>]*>/);
      expect(fullButton).not.toBeNull();
      expect(fullButton[0]).not.toMatch(/active/);
    });
  });

  describe('UI applies mode dynamically from SSOT', () => {
    test('popup-ui.js has updateModeUI function', () => {
      const content = readFile('popup/popup-ui.js');
      expect(content).not.toBeNull();

      // Should have updateModeUI function that applies active class
      expect(content).toMatch(/export function updateModeUI/);
      expect(content).toMatch(/classList\.toggle\(['"]active['"]/);
    });

    test('popup/index.js calls loadSettings on DOMContentLoaded', () => {
      const content = readFile('popup/index.js');
      expect(content).not.toBeNull();

      // Should call loadSettings
      expect(content).toMatch(/await loadSettings\(\)/);
      // Should be in init or DOMContentLoaded
      expect(content).toMatch(/DOMContentLoaded/);
    });
  });

  describe('The specific bug scenario is prevented', () => {
    test('popup and background use the same default mode', async () => {
      // Import defaults (this is the SSOT)
      const { defaults } = await import('../../shared/config/defaults.js');

      // Read both files
      const popupContent = readFile('popup/popup-controller.js');
      const bgContent = readFile('background/playback-controller.js');

      expect(popupContent).not.toBeNull();
      expect(bgContent).not.toBeNull();

      // Both should reference defaults.mode (same source)
      expect(popupContent).toMatch(/defaults\.mode/);
      expect(bgContent).toMatch(/defaults\.mode/);

      // The actual default should be 'article' (not 'full')
      expect(defaults.mode).toBe('article');
    });

    test('fresh install would show article mode active', async () => {
      // This tests that if there are no stored settings:
      // 1. defaults.mode is 'article'
      // 2. Popup would apply active class to article button
      // 3. Background would use 'article' for content extraction

      const { defaults } = await import('../../shared/config/defaults.js');

      // The bug was: popup showed 'full' active, background used 'article'
      // Now: both use defaults.mode which is 'article'
      expect(defaults.mode).toBe('article');

      // Verify popup-controller uses settingsStore.load() which handles defaults
      // settingsStore.load() applies schema validation that defaults to defaults.mode
      const popupContent = readFile('popup/popup-controller.js');
      expect(popupContent).toMatch(/settingsStore\.load\(\)/);
      expect(popupContent).toMatch(/settings\.mode/);
    });
  });
});
