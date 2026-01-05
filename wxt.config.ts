import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'VoxPage',
    description: 'Text-to-speech for web pages with word-level highlighting',
    version: '1.0.0',
    permissions: [
      'storage',
      'activeTab',
      'tabs', // Tab management and URL tracking
      'contextMenus', // Right-click menu integration
    ],
    host_permissions: [
      'https://api.openai.com/*',
      'https://api.elevenlabs.io/*',
      'https://api.cartesia.ai/*',
      'https://api.groq.com/*',
    ],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      96: 'icons/icon-96.png',
      128: 'icons/icon-128.png',
    },
    // T132-T141: Popup UI - toolbar action with popup
    action: {
      default_popup: 'popup/index.html',
      default_title: 'VoxPage - Text to Speech',
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
      },
    },
    browser_specific_settings: {
      gecko: {
        id: 'voxpage@example.com',
        strict_min_version: '100.0',
      },
    },
  },

  browser: process.env.BROWSER || 'firefox',

  // Development server
  dev: {
    server: {
      port: 3000,
    },
  },

  // Vite configuration (T119-T121: Build performance optimization)
  vite: () => ({
    build: {
      target: 'es2020',
      // T121: Inline sourcemaps for development debugging
      sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : true,
      // T120: Enable tree-shaking via esbuild minification (default in Vite)
      minify: 'esbuild',
      // T119: Code splitting - WXT handles chunking automatically for extensions
      // Manual chunks conflict with inlineDynamicImports required for extension contexts
      // Dependencies are automatically bundled per-entrypoint for optimal loading
    },
    // Optimize dependencies for faster dev startup
    optimizeDeps: {
      include: ['zod', 'franc-min'],
    },
    // T120: Ensure dead code elimination
    esbuild: {
      treeShaking: true,
    },
  }),
});
