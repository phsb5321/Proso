/**
 * Build Artifacts Security Tests
 *
 * Tests that production builds don't contain debug statements,
 * source maps, or other development artifacts.
 *
 * @module tests/security/build-artifacts
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Build output directory
const BUILD_DIR = path.resolve(__dirname, '../../.output/firefox-mv2');

/**
 * Check if build exists
 */
function buildExists(): boolean {
  return fs.existsSync(BUILD_DIR) && fs.existsSync(path.join(BUILD_DIR, 'manifest.json'));
}

/**
 * Recursively get all files matching extensions
 */
function getFilesRecursive(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dir)) return files;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      files.push(...getFilesRecursive(fullPath, extensions));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (extensions.includes(ext)) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

/**
 * Get all JavaScript files in build directory
 */
function getBuildJsFiles(): string[] {
  if (!buildExists()) return [];
  return getFilesRecursive(BUILD_DIR, ['.js']);
}

/**
 * Read file content
 */
function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

describe('Build Artifacts Security', () => {
  beforeAll(() => {
    if (!buildExists()) {
      console.log('Warning: Build not found. Run pnpm run build:firefox first.');
    }
  });

  describe('No source maps in production', () => {
    it('should not include .map files in build', () => {
      if (!buildExists()) {
        console.log('Skipping: Build not found');
        return;
      }

      const mapFiles = getFilesRecursive(BUILD_DIR, ['.map']);

      if (mapFiles.length > 0) {
        console.log('Source map files found:', mapFiles.map((f: string) => path.relative(BUILD_DIR, f)));
      }

      expect(mapFiles).toEqual([]);
    });

    it('should not have sourceMappingURL comments in JS files', () => {
      const jsFiles = getBuildJsFiles();
      if (jsFiles.length === 0) {
        console.log('Skipping: No JS files found');
        return;
      }

      const violations: Array<{ file: string; line: number }> = [];

      for (const file of jsFiles) {
        const content = readFile(file);
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          if (line.includes('sourceMappingURL')) {
            violations.push({
              file: path.relative(BUILD_DIR, file),
              line: index + 1,
            });
          }
        });
      }

      if (violations.length > 0) {
        console.log('sourceMappingURL found in:');
        violations.forEach((v) => console.log(`  ${v.file}:${v.line}`));
      }

      expect(violations).toEqual([]);
    });
  });

  describe('No debugger statements in production', () => {
    it('should not have debugger statements', () => {
      const jsFiles = getBuildJsFiles();
      if (jsFiles.length === 0) {
        console.log('Skipping: No JS files found');
        return;
      }

      const violations: Array<{ file: string; line: number }> = [];

      for (const file of jsFiles) {
        const content = readFile(file);
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          // Match standalone debugger statement
          if (/(?:^|[;\s{])debugger(?:[;\s}]|$)/.test(line)) {
            violations.push({
              file: path.relative(BUILD_DIR, file),
              line: index + 1,
            });
          }
        });
      }

      if (violations.length > 0) {
        console.log('debugger statements found:');
        violations.forEach((v) => console.log(`  ${v.file}:${v.line}`));
      }

      expect(violations).toEqual([]);
    });
  });

  describe('No sensitive data', () => {
    it('should not have hardcoded API keys', () => {
      const jsFiles = getBuildJsFiles();
      if (jsFiles.length === 0) {
        console.log('Skipping: No JS files found');
        return;
      }

      const violations: Array<{ file: string; pattern: string }> = [];

      // Patterns that might indicate hardcoded secrets
      const secretPatterns = [
        /sk-[a-zA-Z0-9]{32,}/,  // OpenAI API keys
        /sk_live_[a-zA-Z0-9]+/, // Stripe live keys
        /AKIA[0-9A-Z]{16}/,     // AWS access keys
      ];

      for (const file of jsFiles) {
        const content = readFile(file);

        for (const pattern of secretPatterns) {
          if (pattern.test(content)) {
            violations.push({
              file: path.relative(BUILD_DIR, file),
              pattern: pattern.source,
            });
          }
        }
      }

      if (violations.length > 0) {
        console.log('Potential secrets found:');
        violations.forEach((v) => console.log(`  ${v.file}: matches ${v.pattern}`));
      }

      expect(violations).toEqual([]);
    });
  });
});

describe('Manifest Validation', () => {
  it('should have valid manifest.json', () => {
    if (!buildExists()) {
      console.log('Skipping: Build not found');
      return;
    }

    const manifestPath = path.join(BUILD_DIR, 'manifest.json');
    const content = fs.readFileSync(manifestPath, 'utf-8');

    let manifest: Record<string, unknown> | undefined;
    expect(() => {
      manifest = JSON.parse(content);
    }).not.toThrow();

    // Basic manifest validation
    expect(manifest).toHaveProperty('manifest_version');
    expect(manifest).toHaveProperty('name');
    expect(manifest).toHaveProperty('version');
  });

  it('should have correct manifest version for Firefox', () => {
    if (!buildExists()) {
      console.log('Skipping: Build not found');
      return;
    }

    const manifestPath = path.join(BUILD_DIR, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // Firefox supports both MV2 and MV3
    expect([2, 3]).toContain(manifest.manifest_version);
  });
});
