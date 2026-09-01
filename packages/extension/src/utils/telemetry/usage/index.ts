/**
 * Usage Telemetry — public surface
 *
 * Consumers outside `utils/telemetry/usage/` go through this barrel.
 * Tests + internal modules import directly from the source files. When a
 * symbol is not listed here, it's intentionally private to this folder.
 *
 * Current consumers:
 * - background debug handlers and legacy instrumentation → `usageTracker`
 * - `handlers/logging.handlers.ts` → `hashUrl`
 * - `utils/queue/store.ts` → `UsageShipper`
 *
 * Public entrypoints never initialize the tracker; calls are retained no-ops
 * until the remaining legacy instrumentation is removed.
 *
 * @module utils/telemetry/usage
 */

export { usageTracker } from './tracker';

export { hashUrlSync } from './redaction';
