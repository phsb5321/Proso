/**
 * Unit tests for VoxPage Design Token Consistency
 * Verifies that tokens are properly synchronized across all surfaces:
 * - styles/tokens.css (source of truth)
 * - styles/components.css (component library)
 * - content/floating-controller.js (Shadow DOM duplication)
 *
 * @see specs/012-frontend-redesign for design system requirements
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Parse CSS custom property values from a CSS file
 * Returns only variables from the FIRST :root block (dark theme defaults)
 * @param {string} content - CSS file content
 * @returns {Map<string, string>} Map of property names to values
 */
function parseCSSVariables(content) {
  const variables = new Map();

  // Find the first :root block only (dark theme defaults, before any @media queries)
  // Split by @media to get only the initial :root
  const beforeMediaQueries = content.split('@media')[0];
  const rootMatch = beforeMediaQueries.match(/:root\s*{([^}]+)}/);

  if (rootMatch) {
    const block = rootMatch[1];
    // Parse --variable: value pairs
    const varRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let varMatch;
    while ((varMatch = varRegex.exec(block)) !== null) {
      variables.set(varMatch[1].trim(), varMatch[2].trim());
    }
  }

  return variables;
}

/**
 * Parse token values from floating-controller.js getStyles() method
 * @param {string} content - JavaScript file content
 * @returns {Object} Object with dark and light theme token mappings
 */
function parseFloatingControllerTokens(content) {
  const tokens = { dark: new Map(), light: new Map() };

  // Find the getStyles() method content
  const getStylesMatch = content.match(/getStyles\s*\(\)\s*{[\s\S]*?return\s*`([\s\S]*?)`;/);
  if (!getStylesMatch) return tokens;

  const stylesContent = getStylesMatch[1];

  // Parse dark theme tokens from :host block
  const hostMatch = stylesContent.match(/:host\s*{([^}]+)}/);
  if (hostMatch) {
    const hostBlock = hostMatch[1];
    const varRegex = /(--voxpage-[\w-]+)\s*:\s*([^;/*]+)/g;
    let match;
    while ((match = varRegex.exec(hostBlock)) !== null) {
      tokens.dark.set(match[1].trim(), match[2].trim());
    }
  }

  // Parse light theme tokens from @media (prefers-color-scheme: light) :host block
  const lightMatch = stylesContent.match(/@media\s*\(prefers-color-scheme:\s*light\)\s*{\s*:host\s*{([^}]+)}/);
  if (lightMatch) {
    const lightBlock = lightMatch[1];
    const varRegex = /(--voxpage-[\w-]+)\s*:\s*([^;/*]+)/g;
    let match;
    while ((match = varRegex.exec(lightBlock)) !== null) {
      tokens.light.set(match[1].trim(), match[2].trim());
    }
  }

  return tokens;
}

/**
 * Check if a CSS value uses a token variable (var(--xxx))
 * @param {string} value - CSS property value
 * @returns {boolean}
 */
function usesTokenVariable(value) {
  return value.includes('var(--');
}

describe('Design Token Consistency (012-frontend-redesign)', () => {
  let tokensCSS;
  let componentsCSS;
  let floatingControllerJS;

  beforeAll(() => {
    const projectRoot = path.resolve(process.cwd());

    tokensCSS = fs.readFileSync(
      path.join(projectRoot, 'styles/tokens.css'),
      'utf-8'
    );

    componentsCSS = fs.readFileSync(
      path.join(projectRoot, 'styles/components.css'),
      'utf-8'
    );

    floatingControllerJS = fs.readFileSync(
      path.join(projectRoot, 'content/floating-controller.js'),
      'utf-8'
    );
  });

  describe('T058: tokens.css structure', () => {
    it('should have color-scheme property in :root', () => {
      expect(tokensCSS).toMatch(/color-scheme:\s*dark\s+light/);
    });

    it('should define all required color tokens', () => {
      const requiredTokens = [
        '--color-bg-primary',
        '--color-bg-secondary',
        '--color-text-primary',
        '--color-text-secondary',
        '--color-accent-primary',
        '--color-accent-secondary',
        '--color-success',
        '--color-warning',
        '--color-error',
        '--color-info',
        '--color-border',
        '--color-focus-ring',
        '--color-disabled-bg',
        '--color-disabled-text'
      ];

      requiredTokens.forEach(token => {
        expect(tokensCSS).toContain(token);
      });
    });

    it('should define spacing tokens', () => {
      const spacingTokens = [
        '--spacing-xs',
        '--spacing-sm',
        '--spacing-md',
        '--spacing-lg',
        '--spacing-xl'
      ];

      spacingTokens.forEach(token => {
        expect(tokensCSS).toContain(token);
      });
    });

    it('should define typography tokens', () => {
      const typographyTokens = [
        '--font-family',
        '--font-size-sm',
        '--font-size-md',
        '--font-size-lg',
        '--font-weight-medium',
        '--font-weight-semibold'
      ];

      typographyTokens.forEach(token => {
        expect(tokensCSS).toContain(token);
      });
    });

    it('should have light theme media query', () => {
      expect(tokensCSS).toMatch(/@media\s*\(prefers-color-scheme:\s*light\)/);
    });

    it('should have reduced motion media query', () => {
      expect(tokensCSS).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    });
  });

  describe('T059: floating-controller.js token sync', () => {
    const tokenMapping = {
      // Dark theme mappings: floating-controller token -> tokens.css token -> expected value
      dark: {
        '--voxpage-bg': { cssToken: '--color-bg-primary', value: '#1a1a2e' },
        '--voxpage-bg-secondary': { cssToken: '--color-bg-secondary', value: '#16213e' },
        '--voxpage-accent': { cssToken: '--color-accent-primary', value: '#0D9488' },
        '--voxpage-accent-hover': { cssToken: '--color-accent-secondary', value: '#14B8A6' },
        '--voxpage-text': { cssToken: '--color-text-primary', value: '#ffffff' },
        '--voxpage-text-muted': { cssToken: '--color-text-secondary', value: '#b8c5d6' },
        '--voxpage-border': { cssToken: '--color-border', value: 'rgba(255, 255, 255, 0.1)' },
        '--voxpage-focus-ring': { cssToken: '--color-focus-ring', value: 'rgba(13, 148, 136, 0.5)' }
      },
      // Light theme mappings
      light: {
        '--voxpage-bg': { cssToken: '--color-bg-primary', value: '#ffffff' },
        '--voxpage-accent': { cssToken: '--color-accent-primary', value: '#0F766E' },
        '--voxpage-accent-hover': { cssToken: '--color-accent-secondary', value: '#0D9488' },
        '--voxpage-text': { cssToken: '--color-text-primary', value: '#1e293b' },
        '--voxpage-text-muted': { cssToken: '--color-text-secondary', value: '#475569' },
        '--voxpage-border': { cssToken: '--color-border', value: 'rgba(0, 0, 0, 0.1)' },
        '--voxpage-focus-ring': { cssToken: '--color-focus-ring', value: 'rgba(15, 118, 110, 0.3)' }
      }
    };

    it('should have documentation comments referencing tokens.css', () => {
      expect(floatingControllerJS).toMatch(/synced\s+from\s+.*tokens\.css/i);
    });

    it('should define all required dark theme tokens', () => {
      const fcTokens = parseFloatingControllerTokens(floatingControllerJS);

      Object.keys(tokenMapping.dark).forEach(token => {
        expect(fcTokens.dark.has(token)).toBe(true);
      });
    });

    it('should have dark theme token values matching tokens.css', () => {
      const fcTokens = parseFloatingControllerTokens(floatingControllerJS);

      Object.entries(tokenMapping.dark).forEach(([fcToken, { value }]) => {
        const actualValue = fcTokens.dark.get(fcToken);
        // Normalize whitespace and casing for comparison
        const normalizedActual = actualValue?.replace(/\s+/g, ' ').toLowerCase();
        const normalizedExpected = value.replace(/\s+/g, ' ').toLowerCase();
        expect(normalizedActual).toBe(normalizedExpected);
      });
    });

    it('should have light theme media query', () => {
      expect(floatingControllerJS).toMatch(/@media\s*\(prefers-color-scheme:\s*light\)/);
    });

    it('should have light theme token values matching tokens.css', () => {
      const fcTokens = parseFloatingControllerTokens(floatingControllerJS);

      Object.entries(tokenMapping.light).forEach(([fcToken, { value }]) => {
        const actualValue = fcTokens.light.get(fcToken);
        // Normalize whitespace and casing for comparison
        const normalizedActual = actualValue?.replace(/\s+/g, ' ').toLowerCase();
        const normalizedExpected = value.replace(/\s+/g, ' ').toLowerCase();
        expect(normalizedActual).toBe(normalizedExpected);
      });
    });

    it('should have reduced motion media query', () => {
      expect(floatingControllerJS).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    });
  });

  describe('T060: components.css token usage', () => {
    // List of CSS properties that should use token variables (not hardcoded values)
    const tokenizedProperties = [
      'background',
      'background-color',
      'color',
      'border-color',
      'border-radius',
      'padding',
      'margin',
      'gap',
      'font-size',
      'font-weight',
      'font-family',
      'box-shadow',
      'outline',
      'transition'
    ];

    it('should use token variables for colors (no hardcoded hex in components)', () => {
      // Find color properties with hardcoded hex values (excluding comments and url data)
      // Allow hex in data URIs for icons like the select arrow
      const lines = componentsCSS.split('\n');
      const hardcodedColors = [];

      lines.forEach((line, index) => {
        // Skip comments and data URIs
        if (line.trim().startsWith('/*') || line.trim().startsWith('*') ||
            line.includes('url(') || line.includes('data:')) {
          return;
        }

        // Check for common color properties with hardcoded hex
        const colorProps = ['color:', 'background:', 'background-color:', 'border-color:', 'border:'];
        colorProps.forEach(prop => {
          if (line.includes(prop)) {
            // Check if it contains a hex color that's NOT inside var()
            const hexMatch = line.match(/#[0-9a-fA-F]{3,8}(?![^(]*\))/);
            if (hexMatch && !line.includes('var(--')) {
              // Allow white color for semantic contexts (banner text)
              if (hexMatch[0].toLowerCase() !== '#ffffff' &&
                  hexMatch[0].toLowerCase() !== '#fff' &&
                  hexMatch[0].toLowerCase() !== '#1a1a2e') {
                hardcodedColors.push({ line: index + 1, content: line.trim() });
              }
            }
          }
        });
      });

      // Allow some exceptions for specific cases
      const allowedHardcoded = hardcodedColors.filter(item =>
        !item.content.includes('white') &&  // Allow "color: white" for buttons
        !item.content.includes('/* Dark text')  // Allow documented exceptions
      );

      expect(allowedHardcoded).toEqual([]);
    });

    it('should use spacing tokens for padding and margins', () => {
      // Check that padding/margin use var(--spacing-*) tokens
      const spacingUsage = componentsCSS.match(/var\(--spacing-/g) || [];
      expect(spacingUsage.length).toBeGreaterThan(20);
    });

    it('should use typography tokens for font properties', () => {
      // Check that font properties use var(--font-*) tokens
      const fontUsage = componentsCSS.match(/var\(--font-/g) || [];
      expect(fontUsage.length).toBeGreaterThan(10);
    });

    it('should use radius tokens for border-radius', () => {
      const radiusUsage = componentsCSS.match(/var\(--radius-/g) || [];
      expect(radiusUsage.length).toBeGreaterThan(5);
    });

    it('should use transition tokens for animations', () => {
      const transitionUsage = componentsCSS.match(/var\(--transition/g) || [];
      expect(transitionUsage.length).toBeGreaterThan(5);
    });

    it('should use color tokens for backgrounds', () => {
      const bgUsage = componentsCSS.match(/var\(--color-bg-/g) || [];
      expect(bgUsage.length).toBeGreaterThan(1); // At least card and input backgrounds
    });

    it('should use color tokens for text colors', () => {
      const textUsage = componentsCSS.match(/var\(--color-text-/g) || [];
      expect(textUsage.length).toBeGreaterThan(5);
    });

    it('should use accent color tokens for interactive elements', () => {
      const accentUsage = componentsCSS.match(/var\(--color-accent-/g) || [];
      expect(accentUsage.length).toBeGreaterThan(10);
    });

    it('should use semantic color tokens for status banners', () => {
      expect(componentsCSS).toMatch(/\.voxpage-banner--success[\s\S]*?var\(--color-success\)/);
      expect(componentsCSS).toMatch(/\.voxpage-banner--warning[\s\S]*?var\(--color-warning\)/);
      expect(componentsCSS).toMatch(/\.voxpage-banner--error[\s\S]*?var\(--color-error\)/);
      expect(componentsCSS).toMatch(/\.voxpage-banner--info[\s\S]*?var\(--color-info\)/);
    });

    it('should use disabled tokens for disabled states', () => {
      expect(componentsCSS).toMatch(/var\(--color-disabled-bg\)/);
      expect(componentsCSS).toMatch(/var\(--color-disabled-text\)/);
    });

    it('should use focus ring token for focus states', () => {
      const focusRingUsage = componentsCSS.match(/var\(--color-focus-ring\)/g) || [];
      expect(focusRingUsage.length).toBeGreaterThan(2);
    });
  });

  describe('Cross-file consistency', () => {
    it('should have matching dark theme primary colors in tokens.css and floating-controller.js', () => {
      // Parse from tokens.css (first :root block = dark theme defaults)
      const rootVars = parseCSSVariables(tokensCSS);
      const bgPrimary = rootVars.get('--color-bg-primary');
      const accentPrimary = rootVars.get('--color-accent-primary');
      const textPrimary = rootVars.get('--color-text-primary');

      // Parse from floating-controller.js
      const fcTokens = parseFloatingControllerTokens(floatingControllerJS);

      expect(fcTokens.dark.get('--voxpage-bg')).toBe(bgPrimary);
      expect(fcTokens.dark.get('--voxpage-accent')).toBe(accentPrimary);
      expect(fcTokens.dark.get('--voxpage-text')).toBe(textPrimary);
    });

    it('should reference tokens.css as source of truth in components.css', () => {
      expect(componentsCSS).toMatch(/tokens\.css/i);
    });

    it('should have BEM naming convention for all components', () => {
      // Check that component classes follow .voxpage-* pattern
      const componentClasses = componentsCSS.match(/\.voxpage-[\w-]+/g) || [];
      expect(componentClasses.length).toBeGreaterThan(20);

      // Check for BEM modifiers (--) and elements (__)
      const modifiers = componentsCSS.match(/\.voxpage-[\w]+--([\w-]+)/g) || [];
      const elements = componentsCSS.match(/\.voxpage-[\w]+__([\w-]+)/g) || [];

      expect(modifiers.length).toBeGreaterThan(5);
      expect(elements.length).toBeGreaterThan(3);
    });
  });
});
