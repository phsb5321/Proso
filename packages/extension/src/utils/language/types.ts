// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso Language Detection Types
 * Type definitions and Zod schemas for language detection
 *
 * @module utils/language/types
 */

import { z } from 'zod';

/**
 * ISO 639-1 language code (2-letter)
 */
export type LanguageCode = string;

/**
 * BCP-47 language tag (e.g., 'en-US', 'pt-BR')
 */
export type BCP47Tag = string;

/**
 * Language detection result schema
 */
export const languageDetectionResultSchema = z.object({
  code: z.string().min(2).max(3), // ISO 639-1 (2-letter) or ISO 639-3 (3-letter)
  confidence: z.number().min(0).max(1),
  source: z.enum(['metadata', 'text', 'fallback']),
});

export type LanguageDetectionResult = z.infer<typeof languageDetectionResultSchema>;

/**
 * Page language extraction result schema
 */
export const pageLanguageSchema = z.object({
  metadata: z.string().nullable(), // HTML lang attribute or meta tag
  textSample: z.string(),
  url: z.string().url(),
});

export type PageLanguage = z.infer<typeof pageLanguageSchema>;

/**
 * Language metadata with display information
 */
export const languageMetadataSchema = z.object({
  code: z.string(), // ISO 639-1
  name: z.string(), // Display name in English
  nativeName: z.string().optional(), // Native language name
  bcp47: z.string().optional(), // BCP-47 tag
});

export type LanguageMetadata = z.infer<typeof languageMetadataSchema>;

/**
 * Provider language support mapping
 * Post-045: Only ElevenLabs is supported
 */
export const providerLanguageSupportSchema = z.object({
  provider: z.enum(['elevenlabs']),
  supportedLanguages: z.array(z.string()), // Array of ISO 639-1 codes
  autoDetect: z.boolean(), // Provider supports auto language detection
});

export type ProviderLanguageSupport = z.infer<typeof providerLanguageSupportSchema>;

/**
 * Language detection state
 */
export const languageStateSchema = z.object({
  detectedLanguage: languageDetectionResultSchema.nullable(),
  userOverride: z.string().nullable(), // User-selected language override
  lastDetectionTimestamp: z.number().nullable(),
  cached: z.record(z.string(), languageDetectionResultSchema), // URL hostname → detection result
});

export type LanguageState = z.infer<typeof languageStateSchema>;

/**
 * Common language codes
 */
export const COMMON_LANGUAGES = [
  'en', // English
  'es', // Spanish
  'fr', // French
  'de', // German
  'it', // Italian
  'pt', // Portuguese
  'ru', // Russian
  'ja', // Japanese
  'ko', // Korean
  'zh', // Chinese
  'ar', // Arabic
  'hi', // Hindi
  'nl', // Dutch
  'pl', // Polish
  'tr', // Turkish
  'sv', // Swedish
  'no', // Norwegian
  'da', // Danish
  'fi', // Finnish
  'cs', // Czech
] as const;

export type CommonLanguage = (typeof COMMON_LANGUAGES)[number];
