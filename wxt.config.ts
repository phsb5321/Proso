import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'VoxPage',
    description: 'Text-to-speech for web pages with word-level highlighting',
    version: '1.0.0',
    permissions: [
      'storage',
      'activeTab',
      'offscreen', // Chrome Offscreen Documents API for audio
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

  // Vite configuration
  vite: () => ({
    build: {
      target: 'es2020',
      sourcemap: true,
    },
  }),
});
