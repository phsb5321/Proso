/**
 * Type definitions for jest-axe 8.x
 *
 * jest-axe ships no bundled `.d.ts` and there is no `@types/jest-axe`
 * package, so we declare the small surface the accessibility tests use
 * (T076-T078): the `axe` runner, the `toHaveNoViolations` matcher, and the
 * results shape needed to filter violations by impact.
 */

declare module 'jest-axe' {
  export type AxeImpact = 'minor' | 'moderate' | 'serious' | 'critical';

  export interface AxeViolationNode {
    html: string;
    target: string[];
    failureSummary?: string;
  }

  export interface AxeViolation {
    id: string;
    impact?: AxeImpact | null;
    description: string;
    help: string;
    helpUrl: string;
    nodes: AxeViolationNode[];
  }

  export interface AxeResults {
    violations: AxeViolation[];
    passes: AxeViolation[];
    incomplete: AxeViolation[];
    inapplicable: AxeViolation[];
  }

  /** axe-core run options (subset used by these tests). */
  export interface AxeRunOptions {
    rules?: Record<string, { enabled: boolean }>;
    runOnly?:
      | string[]
      | { type: 'tag' | 'rule'; values: string[] };
    [key: string]: unknown;
  }

  /**
   * Run axe-core against a DOM node or HTML string.
   */
  export function axe(
    html: Element | Document | DocumentFragment | string,
    options?: AxeRunOptions,
  ): Promise<AxeResults>;

  /**
   * Create a pre-configured `axe` runner.
   */
  export function configureAxe(
    options?: AxeRunOptions & { globalOptions?: AxeRunOptions },
  ): typeof axe;

  /** Jest matcher object; register via `expect.extend(toHaveNoViolations)`. */
  export const toHaveNoViolations: {
    toHaveNoViolations(results: AxeResults): {
      pass: boolean;
      message(): string;
    };
  };

  /**
   * Full CommonJS `module.exports`. Under jest's ESM runtime only the default
   * import reliably carries every member (including `toHaveNoViolations`).
   */
  const jestAxe: {
    axe: typeof axe;
    configureAxe: typeof configureAxe;
    toHaveNoViolations: typeof toHaveNoViolations;
  };
  export default jestAxe;
}

// Augment the matcher interface used by `@jest/globals`' typed `expect`
// (it re-exports `Matchers<R, T>` from the `expect` package). The second type
// parameter is part of the merged signature but unused here, hence `_T`.
declare module 'expect' {
  interface Matchers<R extends void | Promise<void>, _T = unknown> {
    toHaveNoViolations(): R;
  }
}
