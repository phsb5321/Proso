/**
 * Credential Scan Security Tests (T047)
 *
 * Scans source code and test fixtures for hardcoded credentials,
 * API keys, tokens, and gateway URLs that should only exist in
 * .env files or build configuration.
 *
 * @see contracts/security-validation.yaml
 * @module tests/security/credentials
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '../..');
const MONOREPO_ROOT = path.resolve(ROOT_DIR, '../..');
const SRC_DIR = path.resolve(ROOT_DIR, 'src');
const TESTS_DIR = path.resolve(ROOT_DIR, 'tests');
const BUILD_DIR = path.resolve(ROOT_DIR, '.output/firefox-mv2');

/**
 * Recursively get all files matching extensions, excluding node_modules.
 */
function getFilesRecursive(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
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
 * Scan files for a pattern and return violations with file/line info.
 */
function scanForPattern(
  files: string[],
  pattern: RegExp,
  baseDir: string,
): Array<{ file: string; line: number; content: string }> {
  const violations: Array<{ file: string; line: number; content: string }> = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((lineContent, index) => {
      if (pattern.test(lineContent)) {
        violations.push({
          file: path.relative(baseDir, file),
          line: index + 1,
          content: lineContent.trim().substring(0, 100),
        });
      }
    });
  }

  return violations;
}

describe('Credential Scanning', () => {
  const srcFiles = getFilesRecursive(SRC_DIR, ['.ts', '.tsx', '.js', '.jsx']);

  describe('No hardcoded telemetry token in source code', () => {
    it('should not contain the telemetry token string "5Q0LlZ" in source', () => {
      const violations = scanForPattern(srcFiles, /5Q0LlZ/, SRC_DIR);

      if (violations.length > 0) {
        console.log('CRITICAL: Hardcoded telemetry token found in source:');
        for (const v of violations) {
          console.log(`  ${v.file}:${v.line}: ${v.content}`);
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe('No hardcoded telemetry token in build output', () => {
    it('should not contain "5Q0LlZ" in production JS files', () => {
      if (!fs.existsSync(BUILD_DIR)) {
        console.log('Skipping: Build not found. Run pnpm run build:firefox first.');
        return;
      }

      const buildJsFiles = getFilesRecursive(BUILD_DIR, ['.js']);
      const violations = scanForPattern(buildJsFiles, /5Q0LlZ/, BUILD_DIR);

      if (violations.length > 0) {
        console.log('CRITICAL: Hardcoded telemetry token found in build output:');
        for (const v of violations) {
          console.log(`  ${v.file}:${v.line}: ${v.content}`);
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe('No hardcoded gateway URL as inline fallback in source', () => {
    it('should not contain gateway URL in entrypoint source files', () => {
      // Gateway URL should only be in .env files or build config (wxt.config.ts),
      // not hardcoded as fallback values in entrypoint source files.
      const entrypointFiles = srcFiles.filter(
        (f) =>
          f.includes('entrypoints') ||
          f.includes('background') ||
          f.includes('content'),
      );

      const violations = scanForPattern(
        entrypointFiles,
        /proso-logs\.home301server/,
        SRC_DIR,
      );

      if (violations.length > 0) {
        console.log('HIGH: Gateway URL found as inline fallback in entrypoints:');
        for (const v of violations) {
          console.log(`  ${v.file}:${v.line}: ${v.content}`);
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe('No API keys in source code', () => {
    it('should not contain OpenAI-style API keys (sk-...)', () => {
      // Match sk- followed by 32+ alphanumeric chars (real keys)
      // but NOT "sk-test" or "sk-fake" patterns used in test mocks
      const violations = scanForPattern(
        srcFiles,
        /sk-(?!test|fake|mock|example|placeholder)[a-zA-Z0-9]{32,}/,
        SRC_DIR,
      );

      expect(violations).toEqual([]);
    });

    it('should not contain ElevenLabs-style live keys (sk_live_...)', () => {
      const violations = scanForPattern(
        srcFiles,
        /sk_live_[a-zA-Z0-9]+/,
        SRC_DIR,
      );

      expect(violations).toEqual([]);
    });

    it('should not contain Groq-style keys (gsk_...)', () => {
      const violations = scanForPattern(
        srcFiles,
        /gsk_[a-zA-Z0-9]+/,
        SRC_DIR,
      );

      expect(violations).toEqual([]);
    });
  });

  describe('No real credentials in test fixtures', () => {
    it('should not contain real-looking API keys in tests', () => {
      const testFiles = getFilesRecursive(TESTS_DIR, ['.ts', '.tsx', '.js', '.jsx']);

      // Real OpenAI keys are 48+ chars after sk-
      const violations = scanForPattern(
        testFiles,
        /sk-[a-zA-Z0-9]{48,}/,
        TESTS_DIR,
      );

      if (violations.length > 0) {
        console.log('HIGH: Real-looking API keys found in test fixtures:');
        for (const v of violations) {
          console.log(`  ${v.file}:${v.line}: ${v.content}`);
        }
      }

      expect(violations).toEqual([]);
    });

    it('should not contain real Bearer tokens (20+ chars) in tests', () => {
      const testFiles = getFilesRecursive(TESTS_DIR, ['.ts', '.tsx', '.js', '.jsx']);

      // Match Bearer tokens that look real (20+ base64 chars)
      // but exclude common test patterns
      const allViolations = scanForPattern(
        testFiles,
        /Bearer [a-zA-Z0-9+/=]{20,}/,
        TESTS_DIR,
      );

      // Filter out known test/mock tokens
      const realViolations = allViolations.filter(
        (v) =>
          !v.content.includes('test') &&
          !v.content.includes('fake') &&
          !v.content.includes('mock') &&
          !v.content.includes('example'),
      );

      expect(realViolations).toEqual([]);
    });
  });
});

describe('Configuration Hygiene', () => {
  it('.env files should be gitignored', () => {
    // In monorepo, .gitignore lives at the workspace root
    const gitignorePath = path.join(MONOREPO_ROOT, '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);

    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    // Should have a .env pattern (e.g., ".env", ".env*", ".env.local")
    expect(gitignoreContent).toMatch(/^\.env/m);
  });

  it('.env.example should exist with documented variables', () => {
    const envExamplePath = path.join(ROOT_DIR, '.env.example');
    expect(fs.existsSync(envExamplePath)).toBe(true);

    const content = fs.readFileSync(envExamplePath, 'utf-8');
    expect(content).toContain('TELEMETRY_GATEWAY_URL');
    expect(content).toContain('TELEMETRY_GATEWAY_TOKEN');
  });

  it('should not have a stale root manifest.json', () => {
    const rootManifest = path.join(ROOT_DIR, 'manifest.json');
    expect(fs.existsSync(rootManifest)).toBe(false);
  });

  it('should not have a stale package-lock.json (pnpm project)', () => {
    const packageLock = path.join(ROOT_DIR, 'package-lock.json');
    expect(fs.existsSync(packageLock)).toBe(false);
  });
});
