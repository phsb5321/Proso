/**
 * VoxPage Language Error Classes
 * Custom errors for language detection and provider compatibility
 *
 * @module shared/errors/language-errors
 */

/**
 * Error thrown when a provider does not support the detected language
 */
export class LanguageNotSupportedError extends Error {
  /**
   * @param {string} languageCode - The unsupported language code
   * @param {string} providerId - The provider that doesn't support it
   * @param {string[]} [compatibleProviders] - Providers that do support the language
   */
  constructor(languageCode, providerId, compatibleProviders = []) {
    super(`Language '${languageCode}' is not supported by ${providerId}`);
    this.name = 'LanguageNotSupportedError';
    this.languageCode = languageCode;
    this.providerId = providerId;
    this.compatibleProviders = compatibleProviders;
  }
}

/**
 * Error thrown when language detection fails
 */
export class LanguageDetectionError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} [source] - Detection source that failed
   */
  constructor(message, source = 'unknown') {
    super(message);
    this.name = 'LanguageDetectionError';
    this.source = source;
  }
}

export default {
  LanguageNotSupportedError,
  LanguageDetectionError
};
