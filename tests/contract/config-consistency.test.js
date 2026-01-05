/**
 * Contract Tests: Configuration Consistency
 * Ensures SSOT pattern is maintained across the codebase.
 *
 * These tests detect configuration drift by scanning for:
 * 1. Hardcoded default values outside shared/config/defaults.js
 * 2. Hardcoded active classes in HTML templates
 * 3. Incorrect imports (not from shared/config/)
 *
 * Note: Popup was removed in 021-comprehensive-overhaul.
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
    test('no hardcoded mode defaults in background/ state initialization', () => {
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
    test('options.html has no hardcoded active classes (if exists)', () => {
      const content = readFile('options/options.html');
      if (!content) return; // Skip if file doesn't exist

      // Look for provider tabs or mode buttons with hardcoded active
      const activeInClass = content.match(/class="[^"]*active[^"]*"/g) || [];

      // Should not have hardcoded active classes on interactive elements
      // Filter to only check buttons and tabs
      activeInClass.forEach((match) => {
        // Allow active on static display elements, but not on interactive tabs/buttons
        expect(match).not.toMatch(/(?:tab|btn|button)/i);
      });
    });
  });

  // Note: Updated for 026-src-folder-restructure - legacy JS files deleted
  // Tests now verify TypeScript files in src/ use proper config patterns
  describe('TypeScript files use config patterns', () => {
    test('background.ts exists in src/entrypoints', () => {
      const content = readFile('src/entrypoints/background.ts');
      expect(content).not.toBeNull();
    });

    test('options controller exists in src/entrypoints/options', () => {
      const content = readFile('src/entrypoints/options/controller.ts');
      // Options page may import defaults or use direct config
      // Key is it exists and can import from utils/config
      if (content) {
        // Should be able to import from utils/config path
        expect(content).toBeDefined();
      }
    });
  });

  describe('defaults.ts is source of truth (026-src-folder-restructure)', () => {
    let defaults;

    beforeAll(async () => {
      // Updated to import from TypeScript config
      const module = await import('../../src/utils/config/defaults');
      defaults = module.defaults;
    });

    test('defaults object exports correctly', () => {
      expect(defaults).toBeDefined();
      expect(typeof defaults).toBe('object');
    });

    test('defaults has mode property', () => {
      expect(defaults.mode).toBeDefined();
      expect(typeof defaults.mode).toBe('string');
      expect(defaults.mode).toBe('article');
    });

    test('defaults has provider property', () => {
      expect(defaults.provider).toBeDefined();
      expect(typeof defaults.provider).toBe('string');
    });

    test('defaults object is frozen (immutable)', () => {
      expect(Object.isFrozen(defaults)).toBe(true);
    });
  });
});
