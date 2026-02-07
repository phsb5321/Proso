import { defineConfig } from "wxt";

/**
 * VoxPage - Text-to-Speech Extension for Web Pages
 *
 * Chrome MV3-first architecture with Firefox compatibility:
 * - Service worker background (MV3) with Firefox event page fallback
 * - Article extraction via Mozilla Readability
 * - ElevenLabs HTTP streaming TTS API
 * - Word-level text highlighting via CSS Custom Highlight API
 */
export default defineConfig({
  srcDir: "src",
  manifest: {
    name: "VoxPage",
    description: "Text-to-speech for web pages with word-level highlighting",
    version: "1.1.3",
    permissions: [
      "storage",
      "unlimitedStorage", // 028-smart-audio-cache: IndexedDB audio cache (500MB+)
      "activeTab",
      "tabs", // Tab management and URL tracking
      "contextMenus", // Right-click menu integration
      "scripting", // For programmatic content script injection
    ],
    host_permissions: [
      "https://api.elevenlabs.io/*", // ElevenLabs TTS API
      "https://voxpage-logs.home301server.com.br/*", // Telemetry gateway
    ],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    icons: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      96: "icons/icon-96.png",
      128: "icons/icon-128.png",
    },
    // T132-T141: Popup UI - toolbar action with popup
    action: {
      default_popup: "popup/index.html",
      default_title: "VoxPage - Text to Speech",
      default_icon: {
        16: "icons/icon-16.png",
        32: "icons/icon-32.png",
      },
    },
    browser_specific_settings: {
      gecko: {
        id: "{41eb66cb-b520-4047-9b6c-63fdce6fca11}",
        strict_min_version: "109.0", // Firefox 109+ for better extension APIs
        // Required for AMO submission - declares data collection practices
        // See: https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
        // @ts-expect-error - WXT types don't include this new Firefox property yet
        data_collection_permissions: {
          // No data collection required for core functionality (browser TTS works offline)
          required: ["none"],
          // Optional: cloud TTS sends text to APIs, telemetry is opt-in
          optional: ["websiteContent", "technicalAndInteraction"],
        },
      },
    },
    // NOTE: We intentionally DO NOT use options_ui here.
    // Firefox embeds options_ui pages inside about:addons which looks ugly.
    // Instead, we open our options page in a dedicated browser tab via
    // browser.tabs.create() - see popup and background handlers.
  },

  // Firefox-only build
  browser: "firefox",

  // Development server
  dev: {
    server: {
      port: 3000,
    },
  },

  // Vite configuration (T119-T121: Build performance optimization)
  vite: (env) => {
    const isProduction = env.command === "build";
    return {
    // T001 (056): Build-time telemetry config injection
    // Token is read from env vars at build time and seeded into browser.storage.local at install
    // See research.md RQ-1 for the hybrid approach
    define: {
      __TELEMETRY_GATEWAY_URL__: JSON.stringify(
        process.env.TELEMETRY_GATEWAY_URL ||
          "https://voxpage-logs.home301server.com.br/ingest",
      ),
      __TELEMETRY_GATEWAY_TOKEN__: JSON.stringify(
        process.env.TELEMETRY_GATEWAY_TOKEN || "",
      ),
    },
    build: {
      target: "es2020",
      // T121: Inline sourcemaps for development debugging
      // T011 (031): Disable source maps in production for IP protection
      sourcemap: isProduction ? false : "inline",
      // T120: Enable tree-shaking via esbuild minification (default in Vite)
      minify: "esbuild",
      // T119: Code splitting - WXT handles chunking automatically for extensions
      // Manual chunks conflict with inlineDynamicImports required for extension contexts
      // Dependencies are automatically bundled per-entrypoint for optimal loading
    },
    // Optimize dependencies for faster dev startup
    optimizeDeps: {
      include: ["zod", "franc-min"],
    },
    // T120: Ensure dead code elimination
    // T012-T013 (031): Remove console/debugger in production, tree-shaking enabled
    esbuild: {
      treeShaking: true,
      drop: isProduction ? ["console", "debugger"] : [],
      pure: isProduction
        ? ["console.log", "console.debug", "console.info", "console.warn", "console.error"]
        : [],
    },
  };
  },
});
