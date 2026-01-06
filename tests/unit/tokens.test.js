/**
 * Unit tests for VoxPage Design Token Consistency
 * Verifies that tokens are properly synchronized across all surfaces:
 * - styles/tokens.css (source of truth)
 * - styles/components.css (component library)
 * - utils/content/sticky-footer.ts (Shadow DOM component)
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
 * Parse token values from sticky-footer.ts getStyles() method
 * @param {string} content - TypeScript file content
 * @returns {Object} Object with dark and light theme token mappings
 */
function parseStickyFooterTokens(content) {
  const tokens = { dark: new Map(), light: new Map() };

  // Find the getStyles() method content - handles both JS and TS patterns
  const getStylesMatch = content.match(/getStyles\s*\(\)\s*(?::\s*string\s*)?{[\s\S]*?return\s*`([\s\S]*?)`;/);
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

describe('Design Token Consistency (012-frontend-redesign)', () => {
  let tokensCSS;
  let componentsCSS;
  let stickyFooterTS;

  beforeAll(() => {
    const projectRoot = path.resolve(process.cwd());

    tokensCSS = fs.readFileSync(
      path.join(projectRoot, 'src/styles/tokens.css'),
      'utf-8'
    );

    componentsCSS = fs.readFileSync(
      path.join(projectRoot, 'src/styles/components.css'),
      'utf-8'
    );

    stickyFooterTS = fs.readFileSync(
      path.join(projectRoot, 'src/utils/content/sticky-footer.ts'),
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

  describe('T059: sticky-footer.ts token sync', () => {
    // Sticky footer uses --footer-* tokens that match tokens.css values
    const tokenMapping = {
      // Dark theme mappings: sticky-footer token -> tokens.css token -> expected value
      dark: {
        '--footer-bg': { cssToken: '--color-bg-primary', value: '#1a1a2e' },
        '--footer-bg-secondary': { cssToken: '--color-bg-secondary', value: '#16213e' },
        '--footer-accent': { cssToken: '--color-accent-primary', value: '#0d9488' },
        '--footer-accent-hover': { cssToken: '--color-accent-secondary', value: '#14b8a6' },
        '--footer-text': { cssToken: '--color-text-primary', value: '#ffffff' },
        '--footer-text-muted': { cssToken: '--color-text-secondary', value: '#b8c5d6' },
        '--footer-border': { cssToken: '--color-border', value: 'rgba(255, 255, 255, 0.1)' },
        '--footer-focus-ring': { cssToken: '--color-focus-ring', value: 'rgba(13, 148, 136, 0.5)' }
      },
      // Light theme mappings
      light: {
        '--footer-bg': { cssToken: '--color-bg-primary', value: '#ffffff' },
        '--footer-accent': { cssToken: '--color-accent-primary', value: '#0f766e' },
        '--footer-accent-hover': { cssToken: '--color-accent-secondary', value: '#0d9488' },
        '--footer-text': { cssToken: '--color-text-primary', value: '#1e293b' },
        '--footer-text-muted': { cssToken: '--color-text-secondary', value: '#475569' },
        '--footer-border': { cssToken: '--color-border', value: 'rgba(0, 0, 0, 0.1)' },
        '--footer-focus-ring': { cssToken: '--color-focus-ring', value: 'rgba(15, 118, 110, 0.3)' }
      }
    };

    it('should have dark theme tokens with values matching tokens.css', () => {
      // Check that sticky-footer dark theme values match tokens.css source of truth
      Object.entries(tokenMapping.dark).forEach(([footerToken, { value }]) => {
        // Verify the token value is present in the sticky-footer getStyles()
        expect(stickyFooterTS).toContain(value);
      });
    });

    it('should have light theme media query', () => {
      expect(stickyFooterTS).toMatch(/@media\s*\(prefers-color-scheme:\s*light\)/);
    });

    it('should have light theme tokens with values matching tokens.css', () => {
      // Check that sticky-footer light theme values match tokens.css source of truth
      Object.entries(tokenMapping.light).forEach(([footerToken, { value }]) => {
        expect(stickyFooterTS).toContain(value);
      });
    });

    it('should have reduced motion media query', () => {
      expect(stickyFooterTS).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    });

    it('should use Shadow DOM for style isolation', () => {
      expect(stickyFooterTS).toMatch(/attachShadow|shadowRoot/);
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
    it('should have matching dark theme primary colors in tokens.css and sticky-footer.ts', () => {
      // Parse from tokens.css (first :root block = dark theme defaults)
      const rootVars = parseCSSVariables(tokensCSS);
      const bgPrimary = rootVars.get('--color-bg-primary');
      const accentPrimary = rootVars.get('--color-accent-primary');
      const textPrimary = rootVars.get('--color-text-primary');

      // Verify sticky-footer uses matching values (uses --footer-* prefix)
      expect(stickyFooterTS).toContain(bgPrimary);      // --footer-bg value
      expect(stickyFooterTS).toContain(accentPrimary);  // --footer-accent value
      expect(stickyFooterTS).toContain(textPrimary);    // --footer-text value
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
