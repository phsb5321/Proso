/**
 * Usage Telemetry — public surface
 *
 * Consumers outside `utils/telemetry/usage/` go through this barrel.
 * Tests + internal modules import directly from the source files. When a
 * symbol is not listed here, it's intentionally private to this folder.
 *
 * Current consumers:
 * - `entrypoints/background.ts` → `installConsoleCapture`, `installErrorCapture`, `usageTracker`
 * - `entrypoints/popup/main.ts`, `entrypoints/options/controller.ts`,
 *   `handlers/instrumented-registry.ts` → `usageTracker`
 * - `entrypoints/content.ts` → `hashUrlSync`, `usageTracker`
 * - `handlers/logging.handlers.ts` → `hashUrl`
 * - `utils/queue/store.ts` → `UsageShipper`
 *
 * @module utils/telemetry/usage
 */

export { UsageTracker, usageTracker } from './tracker';
export { UsageShipper } from './shipper';
export { installErrorCapture } from './error-capture';
export { installConsoleCapture } from './console-capture';
export { hashUrl, hashUrlSync } from './redaction';
