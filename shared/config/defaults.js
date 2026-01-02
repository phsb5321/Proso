/**
 * VoxPage Configuration Defaults
 * SINGLE SOURCE OF TRUTH for all default configuration values
 *
 * @module shared/config/defaults
 * @description All components MUST import defaults from this file.
 * No hardcoded default values should exist elsewhere in the codebase.
 */

/**
 * Valid mode values for text extraction
 */
export const MODES = Object.freeze(['selection', 'article', 'full']);

/**
 * Valid TTS provider values
 */
export const PROVIDERS = Object.freeze(['openai', 'elevenlabs', 'cartesia', 'groq', 'browser']);

/**
 * Default configuration values
 * These are applied when:
 * 1. Fresh extension install (no stored values)
 * 2. Invalid stored value (reset to default)
 * 3. Missing key in stored settings (merged with defaults)
 *
 * @constant {Object}
 */
export const defaults = Object.freeze({
  // Text extraction mode: 'selection' | 'article' | 'full'
  // Default is 'article' for best content extraction on most pages
  mode: 'article',

  // TTS provider: 'openai' | 'elevenlabs' | 'cartesia' | 'groq' | 'browser'
  // Default is 'browser' for zero-configuration first use
  provider: 'browser',

  // Selected voice ID (provider-specific, null means use provider default)
  voice: null,

  // Playback speed multiplier: 0.5 - 2.0
  speed: 1.0,

  // Show cost estimate before playback (for paid providers)
  showCostEstimate: true,

  // Enable audio segment caching
  cacheEnabled: true,

  // Maximum number of cached audio segments: 10 - 200
  maxCacheSize: 50,

  // Enable word-level highlighting (requires Groq Whisper or ElevenLabs)
  wordSyncEnabled: true,
});

/**
 * Default voice settings per provider
 * Separate from main defaults as these are provider-specific
 * null means use the first available voice from the provider
 */
export const defaultVoices = Object.freeze({
  openai: 'alloy', // OpenAI's default voice
  elevenlabs: null,
  cartesia: null,
  groq: 'hannah', // Orpheus default (Groq deprecated PlayAI Dec 2025)
  browser: null,
});

/**
 * Boundary constraints for numeric settings
 */
export const constraints = Object.freeze({
  speed: { min: 0.5, max: 2.0 },
  maxCacheSize: { min: 10, max: 200 },
});

/**
 * Footer state defaults (018-ui-redesign)
 * Default values for the sticky footer player
 */
export const footerStateDefaults = Object.freeze({
  // Whether footer is currently visible
  isVisible: false,
  // Whether footer is in minimized (pill) state
  isMinimized: false,
  // Footer position within viewport constraints
  position: Object.freeze({
    // Horizontal alignment: 'left' | 'center' | 'right'
    x: 'center',
    // Pixels offset from bottom (0 to viewport height / 3)
    yOffset: 0
  })
});

export default defaults;
