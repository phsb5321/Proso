/**
 * CSP Compliance Security Tests
 *
 * Tests that source code doesn't contain patterns that would violate
 * Content Security Policy in Firefox extensions.
 *
 * @module tests/security/csp-compliance
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Source directories to scan
const SRC_DIR = path.resolve(__dirname, '../../src');

/**
 * Recursively get all files matching extensions
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
 * Get all TypeScript/JavaScript files in source directory
 */
function getSourceFiles(): string[] {
  return getFilesRecursive(SRC_DIR, ['.ts', '.tsx', '.js', '.jsx']);
}

/**
 * Get all HTML files in source directory
 */
function getHtmlFiles(): string[] {
  return getFilesRecursive(SRC_DIR, ['.html']);
}

/**
 * Read file content
 */
function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Find all matches of a pattern in content with line numbers
 */
function findMatches(
  content: string,
  pattern: RegExp
): Array<{ line: number; content: string }> {
  const matches: Array<{ line: number; content: string }> = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    if (pattern.test(line)) {
      matches.push({
        line: index + 1,
        content: line.trim().substring(0, 80),
      });
    }
  });

  return matches;
}

describe('CSP Compliance', () => {
  describe('No dangerous eval patterns', () => {
    it('should not use eval() in source code', () => {
      const files = getSourceFiles();
      const violations: Array<{ file: string; line: number; content: string }> = [];

      // Match eval( but not .evaluate( or _eval
      const evalPattern = /(?<![.\w])eval\s*\(/;

      for (const file of files) {
        const content = readFile(file);
        const matches = findMatches(content, evalPattern);

        matches.forEach((m) => {
          violations.push({
            file: path.relative(SRC_DIR, file),
            ...m,
          });
        });
      }

      if (violations.length > 0) {
        console.log('eval() violations found:');
        violations.forEach((v) => console.log(`  ${v.file}:${v.line}: ${v.content}`));
      }

      expect(violations).toEqual([]);
    });

    it('should not use dynamic code construction', () => {
      const files = getSourceFiles();
      const violations: Array<{ file: string; line: number; content: string }> = [];

      // Check for dangerous dynamic code patterns
      const dynamicCodePattern = /new\s+Function\s*\(/;

      for (const file of files) {
        const content = readFile(file);
        const matches = findMatches(content, dynamicCodePattern);

        matches.forEach((m) => {
          violations.push({
            file: path.relative(SRC_DIR, file),
            ...m,
          });
        });
      }

      if (violations.length > 0) {
        console.log('Dynamic code construction violations found:');
        violations.forEach((v) => console.log(`  ${v.file}:${v.line}: ${v.content}`));
      }

      expect(violations).toEqual([]);
    });
  });

  describe('No inline event handlers in HTML', () => {
    it('should not use onclick/onload etc in HTML files', () => {
      const htmlFiles = getHtmlFiles();
      const violations: Array<{ file: string; line: number; content: string }> = [];

      const inlineEventPattern = /\s+on\w+\s*=/i;

      for (const file of htmlFiles) {
        const content = readFile(file);
        const matches = findMatches(content, inlineEventPattern);

        matches.forEach((m) => {
          violations.push({
            file: path.relative(SRC_DIR, file),
            ...m,
          });
        });
      }

      if (violations.length > 0) {
        console.log('Inline event handler violations found:');
        violations.forEach((v) => console.log(`  ${v.file}:${v.line}: ${v.content}`));
      }

      expect(violations).toEqual([]);
    });
  });

  describe('No document.write usage', () => {
    it('should not use document.write()', () => {
      const files = getSourceFiles();
      const violations: Array<{ file: string; line: number; content: string }> = [];

      const docWritePattern = /document\.write\s*\(/;

      for (const file of files) {
        const content = readFile(file);
        const matches = findMatches(content, docWritePattern);

        matches.forEach((m) => {
          violations.push({
            file: path.relative(SRC_DIR, file),
            ...m,
          });
        });
      }

      if (violations.length > 0) {
        console.log('document.write() violations found:');
        violations.forEach((v) => console.log(`  ${v.file}:${v.line}: ${v.content}`));
      }

      expect(violations).toEqual([]);
    });
  });

  describe('No setTimeout/setInterval with strings', () => {
    it('should not use timer functions with string arguments', () => {
      const files = getSourceFiles();
      const violations: Array<{ file: string; line: number; content: string }> = [];

      const timerStringPattern = /(?:setTimeout|setInterval)\s*\(\s*['"`]/;

      for (const file of files) {
        const content = readFile(file);
        const matches = findMatches(content, timerStringPattern);

        matches.forEach((m) => {
          violations.push({
            file: path.relative(SRC_DIR, file),
            ...m,
          });
        });
      }

      if (violations.length > 0) {
        console.log('Timer with string violations found:');
        violations.forEach((v) => console.log(`  ${v.file}:${v.line}: ${v.content}`));
      }

      expect(violations).toEqual([]);
    });
  });
});

describe('Manifest Security', () => {
  const manifestPath = path.resolve(__dirname, '../../.output/firefox-mv2/manifest.json');

  it('should not request dangerous permissions', () => {
    if (!fs.existsSync(manifestPath)) {
      console.log('Skipping: Extension not built');
      return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const permissions = manifest.permissions || [];

    const criticalPermissions = ['nativeMessaging', 'proxy', 'debugger'];
    const foundCritical = permissions.filter((p: string) =>
      criticalPermissions.includes(p)
    );

    expect(foundCritical).toEqual([]);
  });

  it('should have expected safe permissions', () => {
    if (!fs.existsSync(manifestPath)) {
      console.log('Skipping: Extension not built');
      return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const permissions = manifest.permissions || [];

    const expectedPermissions = ['storage', 'activeTab'];
    for (const expected of expectedPermissions) {
      expect(permissions).toContain(expected);
    }
  });
});
