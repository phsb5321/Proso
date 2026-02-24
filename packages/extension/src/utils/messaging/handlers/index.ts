// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com/commercial

/**
 * Message Handlers Index (Legacy)
 *
 * Most handlers have been migrated to hexagonal architecture in src/handlers/.
 * This file only re-exports handlers still used as legacy wrappers.
 *
 * @module utils/messaging/handlers
 */

// Export handlers — still imported by background.ts
export { exportHandlers } from './export';

// Queue handlers — still imported by background.ts and wrapped by hexagonal queue.handlers.ts
export { queueHandlers } from './queue';
