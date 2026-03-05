import presetRemToPx from '@unocss/preset-rem-to-px';
import { defineConfig, presetIcons, presetWind3, transformerDirectives } from 'unocss';

/**
 * UnoCSS configuration for Proso extension popup and options pages.
 *
 * KNOWN LIMITATION (WXT #1125): `createShadowRootUi` with `cssInjectionMode: 'ui'`
 * is incompatible with UnoCSS style injection. Content scripts are excluded from
 * UnoCSS processing via `wxt.config.ts` `excludeEntrypoints`. The sticky footer
 * uses its own `getStyles()` inline CSS inside a closed Shadow DOM and is unaffected.
 *
 * KNOWN ISSUES:
 * 1. Dev mode may show `"virtual:uno.css" is not found` warning on first load.
 *    This is safe to ignore — the file is generated on-demand by UnoCSS and resolves
 *    after the first HMR cycle.
 * 2. Opacity modifiers (e.g. `bg-accent/50`) do not work with `var()` color values.
 *    Use explicit opacity utilities (e.g. `opacity-50`) or custom CSS instead.
 */
export default defineConfig({
  presets: [
    presetWind3(),
    presetRemToPx(),
    presetIcons({
      scale: 1.2,
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle',
      },
    }),
  ],
  transformers: [transformerDirectives()],
  theme: {
    colors: {
      bg: {
        primary: 'var(--color-bg-primary)',
        secondary: 'var(--color-bg-secondary)',
        tertiary: 'var(--color-bg-tertiary)',
      },
      text: {
        primary: 'var(--color-text-primary)',
        secondary: 'var(--color-text-secondary)',
        muted: 'var(--color-text-muted)',
      },
      accent: {
        DEFAULT: 'var(--color-accent-primary)',
        primary: 'var(--color-accent-primary)',
        secondary: 'var(--color-accent-secondary)',
        bg: 'var(--color-accent-bg)',
        glow: 'var(--color-accent-glow)',
      },
      success: 'var(--color-success)',
      warning: 'var(--color-warning)',
      error: 'var(--color-error)',
      info: 'var(--color-info)',
      border: { DEFAULT: 'var(--color-border)' },
      focus: { ring: 'var(--color-focus-ring)' },
      button: {
        bg: 'var(--color-button-bg)',
        'bg-hover': 'var(--color-button-bg-hover)',
        text: 'var(--color-button-text)',
      },
      input: {
        bg: 'var(--color-input-bg)',
        border: 'var(--color-input-border)',
      },
      disabled: {
        bg: 'var(--color-disabled-bg)',
        text: 'var(--color-disabled-text)',
      },
      overlay: { bg: 'var(--color-overlay-bg)' },
    },
    spacing: {
      xs: 'var(--spacing-xs)',
      sm: 'var(--spacing-sm)',
      md: 'var(--spacing-md)',
      lg: 'var(--spacing-lg)',
      xl: 'var(--spacing-xl)',
      '2xl': 'var(--spacing-2xl)',
      '3xl': 'var(--spacing-3xl)',
    },
    fontSize: {
      xs: 'var(--font-size-xs)',
      sm: 'var(--font-size-sm)',
      md: 'var(--font-size-md)',
      lg: 'var(--font-size-lg)',
      xl: 'var(--font-size-xl)',
    },
    fontWeight: {
      normal: 'var(--font-weight-normal)',
      medium: 'var(--font-weight-medium)',
      semibold: 'var(--font-weight-semibold)',
      bold: 'var(--font-weight-bold)',
    },
    lineHeight: {
      tight: 'var(--line-height-tight)',
      normal: 'var(--line-height-normal)',
      relaxed: 'var(--line-height-relaxed)',
    },
    borderRadius: {
      sm: 'var(--radius-sm)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      full: 'var(--radius-full)',
    },
    boxShadow: {
      sm: 'var(--shadow-sm)',
      md: 'var(--shadow-md)',
      lg: 'var(--shadow-lg)',
      accent: 'var(--shadow-accent)',
    },
    fontFamily: {
      sans: 'var(--font-family)',
    },
    zIndex: {
      base: 'var(--z-base)',
      elevated: 'var(--z-elevated)',
      dropdown: 'var(--z-dropdown)',
      sticky: 'var(--z-sticky)',
      overlay: 'var(--z-overlay)',
      'overlay-content': 'var(--z-overlay-content)',
      toast: 'var(--z-toast)',
    },
  },
  rules: [
    ['bg-accent-gradient', { background: 'var(--color-accent-gradient)' }],
    ['min-h-touch', { 'min-height': 'var(--min-touch-target)' }],
    ['w-popup', { width: 'var(--popup-width)' }],
    ['transition-proso', { transition: 'var(--transition)' }],
    ['transition-colors-proso', { transition: 'var(--transition-colors)' }],
  ],
  shortcuts: {
    'proso-flex-col': 'flex flex-col',
    'proso-flex-center': 'flex items-center justify-center',
    'proso-flex-between': 'flex items-center justify-between',
  },
  content: {
    pipeline: {
      include: [/\.(html)($|\?)/, 'src/**/*.ts'],
    },
  },
});
