/**
 * Contract Tests: Configuration Consistency
 * Ensures SSOT pattern is maintained across the codebase.
 *
 * These tests detect configuration drift by scanning for:
 * 1. Hardcoded default values outside shared/config/defaults.js
 * 2. Hardcoded active classes in HTML templates
 * 3. Incorrect imports (not from shared/config/)
 *
 * @module tests/contract/config-consistency
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

/**
 * Read file content safely
 */
function readFile(filePath) {
  const fullPath = path.resolve(projectRoot, filePath);
  if (!existsSync(fullPath)) {
    return null;
  }
  return readFileSync(fullPath, 'utf8');
}

/**
 * Get all JS files in specified directories (recursive)
 */
function getJsFiles(directories) {
  const files = [];

  function walkDir(dir) {
    const fullDir = path.resolve(projectRoot, dir);
    if (!existsSync(fullDir)) return;

    const entries = readdirSync(fullDir);
    for (const entry of entries) {
      const fullPath = path.join(fullDir, entry);
      const relativePath = path.join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        walkDir(relativePath);
      } else if (entry.endsWith('.js')) {
        files.push(relativePath);
      }
    }
  }

  for (const dir of directories) {
    walkDir(dir);
  }

  return files;
}

describe('Configuration Consistency Contract', () => {
  describe('No hardcoded mode defaults', () => {
    const appDirectories = ['background', 'popup', 'content', 'options'];

    test('no hardcoded mode defaults in state initialization', () => {
      const files = getJsFiles(['background']);

      files.forEach((file) => {
        // Skip test files
        if (file.includes('.test.')) return;

        const content = readFile(file);
        if (!content) return;

        // Look for state initialization with hardcoded mode defaults
        // Pattern: state = { ... mode: 'article' ... } or similar
        // This catches: mode: 'full' used as DEFAULT initialization
        // But allows: mode: 'selection' passed to a function call (runtime value)
        const stateInitPattern =
          /(?:state|defaults|DEFAULT)\s*=\s*\{[^}]*mode:\s*['"](?:full|article|selection)['"]/g;
        const matches = content.match(stateInitPattern) || [];

        // Filter matches - only flag if not importing from shared/config
        if (matches.length > 0) {
          // Check if file imports from shared/config (which is correct)
          const hasSharedConfigImport = content.includes("from '../shared/config/");
          if (!hasSharedConfigImport && !file.includes('shared/config')) {
            expect(matches).toHaveLength(0);
          }
        }
      });
    });

    test('no hardcoded mode defaults in popup/ state initialization', () => {
      const files = getJsFiles(['popup']);

      files.forEach((file) => {
        if (file.includes('.test.')) return;

        const content = readFile(file);
        if (!content) return;

        // Look for state initialization with hardcoded mode defaults
        const stateInitPattern =
          /(?:state|defaults|DEFAULT)\s*=\s*\{[^}]*mode:\s*['"](?:full|article|selection)['"]/g;
        const matches = content.match(stateInitPattern) || [];

        if (matches.length > 0) {
          const hasSharedConfigImport = content.includes("from '../shared/config/");
          if (!hasSharedConfigImport && !file.includes('shared/config')) {
            expect(matches).toHaveLength(0);
          }
        }
      });
    });

    test('no hardcoded mode defaults in options/ state initialization', () => {
      const files = getJsFiles(['options']);

      files.forEach((file) => {
        if (file.includes('.test.')) return;

        const content = readFile(file);
        if (!content) return;

        const stateInitPattern =
          /(?:state|defaults|DEFAULT)\s*=\s*\{[^}]*mode:\s*['"](?:full|article|selection)['"]/g;
        const matches = content.match(stateInitPattern) || [];

        if (matches.length > 0) {
          const hasSharedConfigImport = content.includes("from '../shared/config/");
          if (!hasSharedConfigImport && !file.includes('shared/config')) {
            expect(matches).toHaveLength(0);
          }
        }
      });
    });
  });

  describe('No hardcoded active classes in HTML', () => {
    test('popup.html has no active class on mode buttons', () => {
      const content = readFile('popup/popup.html');
      expect(content).not.toBeNull();

      // Find mode buttons
      const modeBtnMatches = content.match(/<button[^>]*class="[^"]*mode-btn[^"]*"[^>]*>/g) || [];

      modeBtnMatches.forEach((btn) => {
        // Should not have 'active' class
        expect(btn).not.toMatch(/class="[^"]*active[^"]*"/);
      });
    });

    test('popup.html has no active class on provider tabs', () => {
      const content = readFile('popup/popup.html');
      expect(content).not.toBeNull();

      // Find provider tabs
      const providerTabMatches =
        content.match(/<button[^>]*class="[^"]*provider-tab[^"]*"[^>]*>/g) || [];

      providerTabMatches.forEach((btn) => {
        // Should not have 'active' class
        expect(btn).not.toMatch(/class="[^"]*active[^"]*"/);
      });
    });

    test('popup.html has no aria-selected="true" hardcoded', () => {
      const content = readFile('popup/popup.html');
      expect(content).not.toBeNull();

      // Provider tabs should not have aria-selected="true" hardcoded
      const providerTabMatches =
        content.match(/<button[^>]*data-provider="[^"]*"[^>]*>/g) || [];

      providerTabMatches.forEach((btn) => {
        expect(btn).not.toMatch(/aria-selected="true"/);
      });
    });
  });

  describe('Imports from shared/config', () => {
    test('popup-controller.js imports defaults from shared/config', () => {
      const content = readFile('popup/popup-controller.js');
      expect(content).not.toBeNull();

      // Should have import from shared/config/defaults.js
      expect(content).toMatch(/import\s*{[^}]*defaults[^}]*}\s*from\s*['"]\.\.\/shared\/config/);
    });

    test('playback-controller.js imports defaults from shared/config', () => {
      const content = readFile('background/playback-controller.js');
      expect(content).not.toBeNull();

      // Should have import from shared/config/defaults.js
      expect(content).toMatch(/import\s*{[^}]*defaults[^}]*}\s*from\s*['"]\.\.\/shared\/config/);
    });

    test('options.js imports defaults from shared/config', () => {
      const content = readFile('options/options.js');
      expect(content).not.toBeNull();

      // Should have import from shared/config/defaults.js
      expect(content).toMatch(/import\s*{[^}]*defaults[^}]*}\s*from\s*['"]\.\.\/shared\/config/);
    });
  });

  describe('Defaults consistency', () => {
    let defaults;

    beforeAll(async () => {
      // Import defaults to verify they're correct
      const module = await import('../../shared/config/defaults.js');
      defaults = module.defaults;
    });

    test('defaults.mode is article', () => {
      expect(defaults.mode).toBe('article');
    });

    test('defaults.provider is browser', () => {
      expect(defaults.provider).toBe('browser');
    });

    test('defaults.speed is 1.0', () => {
      expect(defaults.speed).toBe(1.0);
    });

    test('defaults object is frozen', () => {
      expect(Object.isFrozen(defaults)).toBe(true);
    });
  });

  describe('Error message clarity', () => {
    test('provides clear error when hardcoded default detected', () => {
      // This test documents the expected error message format
      const exampleFile = 'popup/popup-controller.js';
      const content = readFile(exampleFile);

      if (content && content.match(/mode:\s*['"]full['"]/)) {
        const errorMessage = `
Configuration drift detected in ${exampleFile}!

Found hardcoded mode value. This should be:
  mode: defaults.mode

Import defaults from shared/config/defaults.js:
  import { defaults } from '../shared/config/defaults.js';

This ensures all components use the same default values (SSOT pattern).
`;
        // If this test fails, it means someone added a hardcoded default
        expect(true).toBe(false, errorMessage);
      }
    });
  });
});
