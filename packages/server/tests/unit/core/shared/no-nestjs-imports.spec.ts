import * as fs from 'fs';
import * as path from 'path';

/**
 * Architectural boundary test: the `core/` layer must remain framework-agnostic.
 *
 * The hexagonal architecture requires that domain logic in `src/core/` never
 * depends on infrastructure frameworks like NestJS.  Any `@nestjs/*` import in
 * a core file is an architecture violation -- NestJS concerns belong in
 * `src/infrastructure/` or `src/adapters/`.
 */

const CORE_DIR = path.resolve(__dirname, '../../../../src/core');

/** Recursively collect every `.ts` file under a directory. */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(fullPath);
    }
  }

  return results;
}

describe('core/ architectural boundary', () => {
  it('has zero @nestjs/* imports in any core TypeScript file', () => {
    const tsFiles = collectTsFiles(CORE_DIR);

    // Sanity check: we should actually have core files to scan
    expect(tsFiles.length).toBeGreaterThan(0);

    const nestjsImportPattern = /(?:import|require)\s*\(?.*['"]@nestjs\//;
    const offenders: { file: string; line: number; text: string }[] = [];

    for (const filePath of tsFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (nestjsImportPattern.test(lines[i])) {
          const relativePath = path.relative(CORE_DIR, filePath);
          offenders.push({
            file: relativePath,
            line: i + 1,
            text: lines[i].trim(),
          });
        }
      }
    }

    if (offenders.length > 0) {
      const report = offenders
        .map((o) => `  ${o.file}:${o.line} -> ${o.text}`)
        .join('\n');

      fail(
        `Found ${offenders.length} @nestjs/* import(s) in core/. ` +
          `The core layer must be framework-agnostic.\n\n${report}`,
      );
    }

    // Success message visible in verbose test output
    // eslint-disable-next-line no-console
    console.log(
      `${tsFiles.length} core file(s) verified: zero @nestjs imports`,
    );
  });
});
