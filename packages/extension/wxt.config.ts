import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'wxt';

/** The published version, read from the package the build belongs to. */
const extensionPackageVersion = (
  JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
).version;

/**
 * Proso - Text-to-Speech Extension for Web Pages
 *
 * Chrome MV3-first architecture with Firefox compatibility:
 * - Service worker background (MV3) with Firefox event page fallback
 * - Article extraction via Mozilla Readability
 * - ElevenLabs HTTP streaming TTS API
 * - Word-level text highlighting via CSS Custom Highlight API
 */
/**
 * Build the LISTED (Mozilla-hosted) variant rather than the self-distributed
 * one. Set by `build:firefox-listed` / `zip:firefox-listed`.
 *
 * The two channels are the same code and the same extension id; they differ
 * only in who serves updates. The distribution ADR (13/08/2026) keeps both:
 * unlisted for controlled rollout, listed for the AMO audience. Encoding the
 * difference here — rather than hand-editing a manifest before submission —
 * keeps the submitted artifact reproducible from a build command.
 */
const listedBuild = process.env.PROSO_LISTED === '1';

export default defineConfig({
  // Keep the listed artifact beside the unlisted one instead of overwriting it:
  // the two differ only by `update_url`, so a shared output directory makes it
  // impossible to tell which channel a built XPI belongs to.
  ...(listedBuild ? { outDir: '.output-listed' } : {}),
  modules: ['@wxt-dev/unocss'],
  unocss: {
    excludeEntrypoints: ['background', 'content'],
  },
  srcDir: 'src',
  manifest: (env) => ({
    name: 'Proso',
    description: 'Text-to-speech for web pages with word-level highlighting',
    // One source of truth: a hand-copied version here silently shipped a
    // build whose manifest disagreed with package.json (caught releasing
    // 1.2.13, where the zip still said 1.2.12).
    version: extensionPackageVersion,
    permissions: [
      'storage',
      'unlimitedStorage', // 028-smart-audio-cache: IndexedDB audio cache (500MB+)
      'activeTab',
      'tabs', // Tab management and URL tracking
      'contextMenus', // Right-click menu integration
      'scripting', // For programmatic content script injection
      // Writing exports to disk. Without it `browser.downloads` is undefined,
      // so the MP3 export and the highlight export throw at their call sites
      // rather than failing a permission check.
      'downloads',
      // Chrome MV3 only: lets the worker-safe Audio shim create the offscreen
      // document (spec 106 verdict). `chrome.offscreen` is undefined without
      // it. Not a Firefox permission — Firefox's event page has a native
      // Audio and never touches this API.
      ...(env.browser === 'chrome' ? ['offscreen'] : []),
    ],
    // PROSO-110: requestable-only host origins for the reader-operated
    // synthesis host. NOTHING here is granted at install time — the grant
    // happens at configure time via permissions.request() for the narrowest
    // scheme+host MatchPattern the browser can express. MatchPattern has no
    // port component; network use stays pinned to the exact entered origin.
    // The installed host_permissions set above is unchanged. The key is
    // per-browser: MV3 (Chrome) declares optional_host_permissions; the MV2
    // Firefox build has no such key, so Firefox declares the same patterns
    // under optional_permissions, which IS requestable in MV2 (same pattern
    // as the `offscreen` permission branch above).
    ...(env.browser === 'chrome'
      ? { optional_host_permissions: ['http://*/*', 'https://*/*'] }
      : { optional_permissions: ['http://*/*', 'https://*/*'] }),
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
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
      default_title: 'Proso - Text to Speech',
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
      },
    },
    // Keyboard shortcuts (handled by browser.commands.onCommand in background.ts).
    // Firefox uses MV2 `commands` with the "Alt+<Key>" suggested-key syntax;
    // "." and "," must be spelled "Period" / "Comma".
    commands: {
      'playback-toggle': {
        suggested_key: { default: 'Alt+P' },
        description: 'Play/Pause',
      },
      'playback-stop': {
        suggested_key: { default: 'Alt+S' },
        description: 'Stop',
      },
      'playback-next': {
        suggested_key: { default: 'Alt+Period' },
        description: 'Next paragraph',
      },
      'playback-previous': {
        suggested_key: { default: 'Alt+Comma' },
        description: 'Previous paragraph',
      },
    },
    browser_specific_settings: {
      gecko: {
        id: '{41eb66cb-b520-4047-9b6c-63fdce6fca11}',
        strict_min_version: '109.0', // Firefox 109+ (AMO compat override to 109)
        // Self-hosted auto-update for the UNLISTED channel: Firefox does not
        // check AMO for a self-distributed add-on, so the feed is the only way
        // an installed copy ever updates.
        //
        // It must be ABSENT from a listed (Mozilla-hosted) submission. AMO's
        // own validator rejects it outright:
        //   MANIFEST_UPDATE_URL "update_url" is not allowed.
        //   "browser_specific_settings.gecko.update_url" [is] not allowed for
        //   Mozilla-hosted add-ons.
        // (`web-ext lint`, 25/08/2026 — the only error on the 1.2.9 build.)
        // Listed builds update through AMO itself, so dropping the key loses
        // nothing; keeping it would make the listing unsubmittable.
        ...(listedBuild ? {} : { update_url: 'https://proso.com.br/updates.json' }),
        // Required by AMO for all new extensions (mandatory since 2026).
        // Generates compatibility warnings for Firefox <140 but AMO rejects without it.
        data_collection_permissions: {
          // Reading necessarily transmits the text the user asks to hear to
          // their chosen provider, the Proso API, or their configured host.
          // Mozilla classifies any data handled outside the add-on/browser as
          // collection, so websiteContent is required even though no telemetry
          // or browsing history leaves the public build.
          required: ['websiteContent'],
          // BYOK is optional; when selected, the provider credential leaves
          // Firefox for that synthesis request and Mozilla classifies it as
          // authentication information.
          optional: ['authenticationInfo'],
        },
      },
    },
    // NOTE: We intentionally DO NOT use options_ui here.
    // Firefox embeds options_ui pages inside about:addons which looks ugly.
    // Instead, we open our options page in a dedicated browser tab via
    // browser.tabs.create() - see popup and background handlers.
  }),

  // Firefox-only build
  browser: 'firefox',

  // Development server
  dev: {
    server: {
      port: 3000,
    },
  },

  // Use FIREFOX_BIN env var to override browser binary, defaults to firefox-nightly
  webExt: {
    binaries: {
      firefox: process.env.FIREFOX_BIN || 'firefox-nightly',
    },
  },

  // Vite configuration (T119-T121: Build performance optimization)
  vite: (env) => {
    const isProduction = env.command === 'build';
    return {
      resolve: {
        alias: {
          '@proso/shared': path.resolve(__dirname, '../shared/src'),
        },
      },
      build: {
        target: 'es2020',
        // T121: Inline sourcemaps for development debugging
        // T011 (031): Disable source maps in production for IP protection
        sourcemap: isProduction ? false : 'inline',
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
      // T012-T013 (031): Remove console/debugger in production, tree-shaking enabled
      esbuild: {
        treeShaking: true,
        // Only drop debugger — console is handled by `pure` below which strips
        // standalone calls but preserves stored references (console-capture.ts).
        // Using drop:['console'] replaced bound references with (void 0) causing
        // AMO linter no-unsanitized warnings.
        drop: isProduction ? ['debugger'] : [],
        pure: isProduction
          ? ['console.log', 'console.debug', 'console.info', 'console.warn', 'console.error']
          : [],
      },
    };
  },
});
