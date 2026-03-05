// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso Message Parameter Types
 * TypeScript types inferred from Zod schemas
 *
 * @module utils/messaging/types
 */

import type { z } from 'zod';
import type * as schemas from './schemas';

// ========== Enum Types ==========

export type PlaybackStatus = z.infer<typeof schemas.playbackStatusSchema>;
export type ExtractionMode = z.infer<typeof schemas.extractionModeSchema>;
export type ProviderId = z.infer<typeof schemas.providerIdSchema>;
export type LogLevel = z.infer<typeof schemas.logLevelSchema>;
export type LogComponent = z.infer<typeof schemas.logComponentSchema>;
export type FooterAction = z.infer<typeof schemas.footerActionSchema>;
export type SegmentType = z.infer<typeof schemas.segmentTypeSchema>;
export type LanguageSource = z.infer<typeof schemas.languageSourceSchema>;

// ========== Playback Types ==========

export type PlaybackStartParams = z.infer<typeof schemas.playbackStartParamsSchema>;
export type PlaybackSeekParams = z.infer<typeof schemas.playbackSeekParamsSchema>;
export type PlaybackSetSpeedParams = z.infer<typeof schemas.playbackSetSpeedParamsSchema>;
export type PlaybackStateResponse = z.infer<typeof schemas.playbackStateResponseSchema>;

// ========== Audio Types ==========

export type WordTimelineEntry = z.infer<typeof schemas.wordTimelineEntrySchema>;
export type AudioGenerateParams = z.infer<typeof schemas.audioGenerateParamsSchema>;
export type AudioGenerateResponse = z.infer<typeof schemas.audioGenerateResponseSchema>;
export type AudioCacheParams = z.infer<typeof schemas.audioCacheParamsSchema>;
export type AudioCacheStateResponse = z.infer<typeof schemas.audioCacheStateResponseSchema>;

// ========== Provider Types ==========

export type ProviderSelectParams = z.infer<typeof schemas.providerSelectParamsSchema>;
export type ProviderInfo = z.infer<typeof schemas.providerInfoSchema>;
export type ProviderValidateLanguageSupportParams = z.infer<
  typeof schemas.providerValidateLanguageSupportParamsSchema
>;
export type ProviderValidateLanguageSupportResponse = z.infer<
  typeof schemas.providerValidateLanguageSupportResponseSchema
>;

// ========== Content Types ==========

export type ContentExtractParams = z.infer<typeof schemas.contentExtractParamsSchema>;
export type ContentParagraph = z.infer<typeof schemas.contentParagraphSchema>;
export type ContentExtractResponse = z.infer<typeof schemas.contentExtractResponseSchema>;
export type ContentScoreParams = z.infer<typeof schemas.contentScoreParamsSchema>;
export type ContentScoreResponse = z.infer<typeof schemas.contentScoreResponseSchema>;
export type ContentFindDOMParams = z.infer<typeof schemas.contentFindDOMParamsSchema>;
export type ContentDOMElement = z.infer<typeof schemas.contentDOMElementSchema>;

// ========== Highlight Types ==========

export type HighlightParagraphParams = z.infer<typeof schemas.highlightParagraphParamsSchema>;
export type HighlightWordParams = z.infer<typeof schemas.highlightWordParamsSchema>;
export type HighlightStateResponse = z.infer<typeof schemas.highlightStateResponseSchema>;

// ========== Language Types ==========

export type LanguageDetectParams = z.infer<typeof schemas.languageDetectParamsSchema>;
export type LanguageDetectResponse = z.infer<typeof schemas.languageDetectResponseSchema>;
export type LanguageGetStateParams = z.infer<typeof schemas.languageGetStateParamsSchema>;
export type LanguageStateResponse = z.infer<typeof schemas.languageStateResponseSchema>;
export type LanguageSetOverrideParams = z.infer<typeof schemas.languageSetOverrideParamsSchema>;

// ========== Settings Types ==========

export type Settings = z.infer<typeof schemas.settingsSchema>;
export type SettingsUpdateParams = z.infer<typeof schemas.settingsUpdateParamsSchema>;
export type SettingsMigrateParams = z.infer<typeof schemas.settingsMigrateParamsSchema>;
export type SettingsMigrateResponse = z.infer<typeof schemas.settingsMigrateResponseSchema>;

// ========== Footer Types ==========

export type FooterPosition = z.infer<typeof schemas.footerPositionSchema>;
export type FooterUpdateStateParams = z.infer<typeof schemas.footerUpdateStateParamsSchema>;
export type FooterStateResponse = z.infer<typeof schemas.footerStateResponseSchema>;
export type FooterActionParams = z.infer<typeof schemas.footerActionParamsSchema>;

// ========== Logging Types ==========

export type LoggingLogRemoteParams = z.infer<typeof schemas.loggingLogRemoteParamsSchema>;
export type LoggingStateResponse = z.infer<typeof schemas.loggingStateResponseSchema>;
