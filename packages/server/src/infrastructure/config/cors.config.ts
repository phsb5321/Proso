// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * CORS options for the Proso API.
 *
 * The extension declares no host permission for the API origin (its only
 * `host_permissions` entry is the log gateway), so every extension → API call
 * is an ordinary cross-origin request: a preflight is sent, and the response
 * headers the browser hands back are limited to the CORS-safelisted set unless
 * they are named in `Access-Control-Expose-Headers`.
 *
 * `TTSController.synthesizeAudio` answers with four custom metadata headers.
 * Without `exposedHeaders` the extension reads none of them and silently falls
 * back to its defaults (0 credits, `cacheHit: false`, provider `'unknown'`).
 *
 * @module infrastructure/config/cors.config
 */

import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Custom response headers the TTS controller sets on a successful synthesis.
 * The extension's API adapter reads all four.
 */
const TTS_METADATA_HEADERS = [
  'X-Credits-Used',
  'X-Credits-Remaining',
  'X-Cache-Hit',
  'X-Provider',
] as const;

/**
 * CORS options applied in `bootstrap()`. Kept out of `main.ts` so the
 * exposed-header contract can be asserted against the controller in tests
 * without booting the Nest application.
 *
 * `satisfies` rather than an annotation: Nest's own type is checked at compile
 * time, while `exposedHeaders` keeps its concrete `string[]` type so the
 * contract test can iterate it.
 */
export const CORS_OPTIONS = {
  origin: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-License-Key'],
  exposedHeaders: [...TTS_METADATA_HEADERS],
} satisfies CorsOptions;
