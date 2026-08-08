/**
 * Usage Redaction Module
 *
 * Redacts sensitive data before logging to ensure privacy.
 * - API keys are masked with [REDACTED]
 * - URLs are hashed to SHA-256 for privacy
 * - Stack traces have file paths normalized
 *
 * @module utils/telemetry/usage/redaction
 */

import { djb2Hash, sha256HexOrDjb2 } from '../../hash';

/**
 * Keys that should be redacted from logged data.
 */
const SENSITIVE_KEYS = new Set([
  // Proso API keys
  'elevenlabsApiKey',
  // Generic sensitive keys
  'apiKey',
  'api_key',
  'apikey',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'password',
  'secret',
  'authorization',
  'auth',
  'credential',
  'credentials',
  'privateKey',
  'private_key',
]);

/**
 * Pattern to match API key-like strings (32+ alphanumeric chars).
 */
const API_KEY_PATTERN = /[a-zA-Z0-9_-]{32,}/g;

/**
 * Pattern to match extension URLs (moz-extension://, chrome-extension://).
 */
const EXTENSION_URL_PATTERN = /(?:moz-extension|chrome-extension):\/\/[a-z0-9-]+/gi;

/**
 * Redaction placeholder.
 */
const REDACTED = '[REDACTED]';

/**
 * Check if a key is sensitive.
 */
function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return (
    SENSITIVE_KEYS.has(key) ||
    SENSITIVE_KEYS.has(lowerKey) ||
    lowerKey.includes('key') ||
    lowerKey.includes('secret') ||
    lowerKey.includes('password') ||
    lowerKey.includes('token') ||
    lowerKey.includes('credential')
  );
}

/**
 * Redact API key-like patterns from a string.
 */
function redactApiKeyPatterns(value: string): string {
  return value.replace(API_KEY_PATTERN, (match) => {
    // Keep first 4 and last 4 characters for debugging
    if (match.length > 12) {
      return `${match.slice(0, 4)}...[REDACTED]...${match.slice(-4)}`;
    }
    return REDACTED;
  });
}

/**
 * Hash a URL using SHA-256.
 * Returns a hex-encoded hash string.
 */
export async function hashUrl(url: string): Promise<string> {
  try {
    // Normalize URL by removing query params and fragments
    const normalized = normalizeUrl(url);

    // Use Web Crypto API for hashing
    return sha256HexOrDjb2(normalized);
  } catch {
    // Fallback: simple hash if crypto not available
    return djb2Hash(url);
  }
}

/**
 * Synchronous hash function for URLs (for non-async contexts).
 * Uses a simple hash algorithm, not cryptographic.
 */
export function hashUrlSync(url: string): string {
  return djb2Hash(normalizeUrl(url));
}

/**
 * Normalize a URL for hashing.
 * Removes query params and fragments to group similar pages.
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Keep protocol + host + pathname, drop query and hash
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    // If URL is invalid, return as-is
    return url;
  }
}


/**
 * Redact sensitive data from an object recursively.
 * Returns a new object with sensitive values replaced.
 */
export function redactSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  // Handle primitives
  if (typeof data === 'string') {
    return redactApiKeyPatterns(data);
  }

  if (typeof data !== 'object') {
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item));
  }

  // Handle objects
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTED;
    } else if (typeof value === 'string') {
      result[key] = redactApiKeyPatterns(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSensitiveData(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Redact stack trace to normalize file paths.
 * Removes extension UUIDs and normalizes paths.
 */
export function redactStackTrace(stack: string): string {
  if (!stack) {
    return stack;
  }

  return (
    stack
      // Remove extension UUIDs from URLs
      .replace(EXTENSION_URL_PATTERN, 'ext://')
      // Normalize file:// paths
      .replace(/file:\/\/[^:]+/g, 'file://...')
      // Remove line/column numbers but keep file references
      // Keep: filename.js:123:45 -> filename.js
      .replace(/:[0-9]+:[0-9]+/g, '')
  );
}

/**
 * Redact error object for logging.
 */
export function redactError(error: Error): Record<string, string | undefined> {
  return {
    name: error.name,
    message: redactApiKeyPatterns(error.message),
    stack: error.stack ? redactStackTrace(error.stack) : undefined,
  };
}

/**
 * Sanitize event data before logging.
 * Performs full redaction of sensitive data.
 */
export function sanitizeEventData(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!data) {
    return data;
  }

  return redactSensitiveData(data) as Record<string, unknown>;
}
