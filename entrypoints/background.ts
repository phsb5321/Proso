/**
 * VoxPage Background Service Worker
 * Main entrypoint for WXT extension background context
 */

// Import message handlers (Phase 3 - US1)
// These handlers provide the type-safe messaging interface
// Full implementation will be connected in Phase 4 (US2)
import type { VoxPageProtocol } from '../utils/messaging/protocol';
import * as handlers from '../utils/messaging/handlers';

export default defineBackground(() => {
  console.log('VoxPage background service worker started');

  /**
   * Phase 3 (US1) Status: ✅ Type-Safe Messaging Infrastructure Complete
   *
   * Messaging handlers are defined and ready:
   * - 37 handler functions across 9 domains
   * - Full TypeScript autocomplete support
   * - Zod runtime validation
   *
   * Phase 4 (US2) TODO: Integrate with actual business logic
   * 1. Initialize core services:
   *    - PlaybackController from background/playback-controller.js
   *    - AudioCache from background/audio-cache.js
   *    - RemoteLogger from background/remote-logger.js
   *    - ProviderRegistry from background/provider-registry.js
   *
   * 2. Register message handlers using defineExtensionMessaging:
   *    const messenger = defineExtensionMessaging<VoxPageProtocol>();
   *    messenger.onMessage('playback.start', handlers.handlePlaybackStart);
   *    messenger.onMessage('playback.pause', handlers.handlePlaybackPause);
   *    ... (35 more handlers)
   *
   * 3. Replace old background/message-router.js (888 LOC)
   * 4. Replace old background/ui-coordinator.js (250 LOC)
   *
   * For now, existing background/*.js modules continue to work via
   * the old message-router pattern. Full migration in Phase 4.
   */

  // Verify handlers are available (demonstrates autocomplete works)
  const handlerList = {
    playback: handlers.handlePlaybackStart,
    audio: handlers.handleAudioGenerate,
    provider: handlers.handleProviderSelect,
    content: handlers.handleContentExtract,
    highlight: handlers.handleHighlightParagraph,
    language: handlers.handleLanguageDetect,
    settings: handlers.handleSettingsGet,
    footer: handlers.handleFooterShow,
    logging: handlers.handleLoggingLogRemote,
  };

  console.log('VoxPage: Message handlers loaded:', Object.keys(handlerList).length, 'domains');
  console.log('VoxPage: Phase 3 (US1) messaging infrastructure ready for Phase 4 integration');
});
