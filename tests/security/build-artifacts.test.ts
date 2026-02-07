/**
 * Build Artifacts Security Tests (T048)
 *
 * Tests that production builds don't contain debug statements,
 * source maps, hardcoded credentials, or other development artifacts.
 * Also verifies package size is within AMO limits.
 *
 * @see contracts/security-validation.yaml
 * @module tests/security/build-artifacts
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUILD_DIR = path.resolve(__dirname, '../../.output/firefox-mv2');

/** AMO size limit: 5MB */
const MAX_PACKAGE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Check if build exists.
 */
function buildExists(): boolean {
  return fs.existsSync(BUILD_DIR) && fs.existsSync(path.join(BUILD_DIR, 'manifest.json'));
}

/**
 * Recursively get all files matching extensions.
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
 * Get total size of a directory in bytes.
 */
function getDirSize(dir: string): number {
  let totalSize = 0;
  if (!fs.existsSync(dir)) return 0;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      totalSize += getDirSize(fullPath);
    } else if (entry.isFile()) {
      totalSize += fs.statSync(fullPath).size;
    }
  }
  return totalSize;
}

/**
 * Get all JavaScript files in build directory.
 */
function getBuildJsFiles(): string[] {
  if (!buildExists()) return [];
  return getFilesRecursive(BUILD_DIR, ['.js']);
}

/**
 * Scan JS files for a pattern, returning violations.
 */
function scanBuildForPattern(
  jsFiles: string[],
  pattern: RegExp,
): Array<{ file: string; line: number; content: string }> {
  const violations: Array<{ file: string; line: number; content: string }> = [];

  for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((lineContent, index) => {
      if (pattern.test(lineContent)) {
        violations.push({
          file: path.relative(BUILD_DIR, file),
          line: index + 1,
          content: lineContent.trim().substring(0, 100),
        });
      }
    });
  }

  return violations;
}

describe('Build Artifacts Security', () => {
  let jsFiles: string[];

  beforeAll(() => {
    if (!buildExists()) {
      console.log('Warning: Build not found. Run pnpm run build:firefox first.');
    }
    jsFiles = getBuildJsFiles();
  });

  describe('No console statements in production JS', () => {
    it('should not have console.log statements', () => {
      if (jsFiles.length === 0) return;

      const violations = scanBuildForPattern(jsFiles, /\bconsole\.log\s*\(/);
      if (violations.length > 0) {
        console.log('console.log found in production build:');
        for (const v of violations) console.log(`  ${v.file}:${v.line}`);
      }
      expect(violations).toEqual([]);
    });

    it('should not have console.debug statements', () => {
      if (jsFiles.length === 0) return;

      const violations = scanBuildForPattern(jsFiles, /\bconsole\.debug\s*\(/);
      if (violations.length > 0) {
        console.log('console.debug found in production build:');
        for (const v of violations) console.log(`  ${v.file}:${v.line}`);
      }
      expect(violations).toEqual([]);
    });

    it('should not have console.info statements', () => {
      if (jsFiles.length === 0) return;

      const violations = scanBuildForPattern(jsFiles, /\bconsole\.info\s*\(/);
      if (violations.length > 0) {
        console.log('console.info found in production build:');
        for (const v of violations) console.log(`  ${v.file}:${v.line}`);
      }
      expect(violations).toEqual([]);
    });

    it('should not have console.warn statements', () => {
      if (jsFiles.length === 0) return;

      const violations = scanBuildForPattern(jsFiles, /\bconsole\.warn\s*\(/);
      if (violations.length > 0) {
        console.log('console.warn found in production build:');
        for (const v of violations) console.log(`  ${v.file}:${v.line}`);
      }
      expect(violations).toEqual([]);
    });
  });

  describe('No debugger statements in production', () => {
    it('should not have debugger statements', () => {
      if (jsFiles.length === 0) return;

      const violations = scanBuildForPattern(
        jsFiles,
        /(?:^|[;\s{])debugger(?:[;\s}]|$)/,
      );
      if (violations.length > 0) {
        console.log('debugger statements found in production build:');
        for (const v of violations) console.log(`  ${v.file}:${v.line}`);
      }
      expect(violations).toEqual([]);
    });
  });

  describe('No source maps in production', () => {
    it('should not include .map files in build', () => {
      if (!buildExists()) return;

      const mapFiles = getFilesRecursive(BUILD_DIR, ['.map']);
      if (mapFiles.length > 0) {
        console.log('Source map files found:', mapFiles.map((f) => path.relative(BUILD_DIR, f)));
      }
      expect(mapFiles).toEqual([]);
    });

    it('should not have sourceMappingURL comments in JS files', () => {
      if (jsFiles.length === 0) return;

      const violations = scanBuildForPattern(jsFiles, /sourceMappingURL/);
      if (violations.length > 0) {
        console.log('sourceMappingURL found in:');
        for (const v of violations) console.log(`  ${v.file}:${v.line}`);
      }
      expect(violations).toEqual([]);
    });
  });

  describe('No sensitive data in build output', () => {
    it('should not have hardcoded telemetry token "5Q0LlZ"', () => {
      if (jsFiles.length === 0) return;

      const violations = scanBuildForPattern(jsFiles, /5Q0LlZ/);
      if (violations.length > 0) {
        console.log('CRITICAL: Telemetry token found in build output:');
        for (const v of violations) console.log(`  ${v.file}:${v.line}`);
      }
      expect(violations).toEqual([]);
    });

    it('should not have hardcoded API keys', () => {
      if (jsFiles.length === 0) return;

      const secretPatterns = [
        /sk-[a-zA-Z0-9]{32,}/, // OpenAI API keys
        /sk_live_[a-zA-Z0-9]+/, // Stripe/ElevenLabs live keys
        /gsk_[a-zA-Z0-9]+/, // Groq keys
        /AKIA[0-9A-Z]{16}/, // AWS access keys
      ];

      const violations: Array<{ file: string; pattern: string }> = [];

      for (const file of jsFiles) {
        const content = fs.readFileSync(file, 'utf-8');
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
        console.log('CRITICAL: Potential secrets in build output:');
        for (const v of violations) console.log(`  ${v.file}: matches ${v.pattern}`);
      }
      expect(violations).toEqual([]);
    });
  });

  describe('Extension package size', () => {
    it('should be under 5MB (AMO limit)', () => {
      if (!buildExists()) return;

      const totalSize = getDirSize(BUILD_DIR);
      const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);

      console.log(`Extension size: ${sizeMB} MB (${totalSize} bytes)`);

      expect(totalSize).toBeLessThan(MAX_PACKAGE_SIZE_BYTES);
    });
  });
});

describe('Manifest Validation', () => {
  it('should have valid manifest.json', () => {
    if (!buildExists()) return;

    const manifestPath = path.join(BUILD_DIR, 'manifest.json');
    const content = fs.readFileSync(manifestPath, 'utf-8');

    let manifest: Record<string, unknown> | undefined;
    expect(() => {
      manifest = JSON.parse(content);
    }).not.toThrow();

    expect(manifest).toHaveProperty('manifest_version');
    expect(manifest).toHaveProperty('name');
    expect(manifest).toHaveProperty('version');
  });

  it('should have correct manifest version for Firefox (MV2)', () => {
    if (!buildExists()) return;

    const manifestPath = path.join(BUILD_DIR, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // VoxPage targets Firefox MV2
    expect(manifest.manifest_version).toBe(2);
  });
});
