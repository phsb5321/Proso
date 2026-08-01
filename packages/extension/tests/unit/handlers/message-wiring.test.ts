// SPDX-License-Identifier: MIT
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.

/**
 * Message Wiring Tests
 *
 * Every message the content script, popup and options page send to the
 * background lands in one dispatcher, which looks the type up in the handler
 * registry and answers "unknown message" when it is not there. A send whose
 * name no handler was registered under therefore fails silently, forever, and
 * looks exactly like a send that worked — the caller gets a resolved promise
 * either way.
 *
 * That is not a hypothetical. `highlight.reportOrphans`, `playback.resync`,
 * `playback.jumpToParagraph`, `playback.jumpToWord` and
 * `highlight.selectionChanged` were all shipped this way, none of them ever
 * registered in any commit. This test is the reason a sixth cannot be.
 *
 * @module tests/unit/handlers/message-wiring
 */

import { describe, expect, it } from '@jest/globals';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConfiguredRegistry } from '../../../src/handlers/index';
import { LEGACY_BRIDGE } from '../../../src/handlers/legacy-bridge';
import { exportHandlers } from '../../../src/utils/messaging/handlers/export';
import { queueHandlers } from '../../../src/utils/messaging/handlers/queue';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '../../../src');

/**
 * The surfaces whose `runtime.sendMessage` calls reach the background
 * dispatcher.
 *
 * Listed rather than derived, because the direction of a message is not
 * visible in the call itself: the background and its adapters also call
 * `runtime.sendMessage`, and those go the other way — to the popup, which
 * handles them in its own listener and not in the registry. A new client
 * surface added outside this list is not covered until it is added here.
 */
const CLIENT_SURFACES = [
  'entrypoints/content.ts',
  'entrypoints/popup',
  'entrypoints/options',
  'utils/content',
];

/** A message type found in the source, with where it was found. */
interface FoundSend {
  type: string;
  file: string;
}

function listFiles(target: string): string[] {
  if (!fs.existsSync(target)) return [];
  if (fs.statSync(target).isFile()) return [target];

  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return entry.isFile() && full.endsWith('.ts') ? [full] : [];
  });
}

/**
 * Pull the message names a file sends to the background out of its source.
 *
 * Three call shapes exist and all three are matched:
 *
 * - `browser.runtime.sendMessage({ type: 'x.y', ... })`, where the object may
 *   start several lines below the `runtime`
 * - the same with `action: 'someName'`, the older content-script spelling the
 *   background bridges onto a canonical name
 * - `sendMessage('x.y', { ... })`, the popup's own thin wrapper around the
 *   first, whose name is the first argument
 *
 * `browser.tabs.sendMessage(tabId, ...)` is deliberately not matched: it goes
 * to a content script's own listener, which is not the registry.
 *
 * A name built at run time — `` `playback.${action}` ``, or a variable — is
 * out of reach of a scan like this one and stays uncovered. Send a literal.
 */
function findSends(source: string, file: string): FoundSend[] {
  const found: FoundSend[] = [];

  // Biome normalises the codebase to single quotes, but the other two
  // delimiters are matched anyway: a formatter setting is not something this
  // test should be able to go blind to.
  const viaRuntime =
    /runtime\s*\.?\s*\n?\s*\.?sendMessage\(\s*\{[\s\S]{0,200}?(?:type|action):\s*(['"`])([\w.]+)\1/g;
  for (const match of source.matchAll(viaRuntime)) {
    found.push({ type: match[2] as string, file });
  }

  const viaWrapper = /(?<![.\w])sendMessage\(\s*(['"`])([\w.]+)\1/g;
  for (const match of source.matchAll(viaWrapper)) {
    found.push({ type: match[2] as string, file });
  }

  return found;
}

/**
 * Find sends whose name is not a literal.
 *
 * A name assembled at run time is invisible to the scan above, so a send that
 * spells one would be uncovered without any test failing — the exact blind
 * spot this file exists to remove. Rather than leave it silent, it fails here:
 * message names are literals, and a caller that needs to choose between two of
 * them picks between two literal sends.
 */
function findDynamicSends(source: string, file: string): string[] {
  const found: string[] = [];

  const dynamicField =
    /runtime\s*\.?\s*\n?\s*\.?sendMessage\(\s*\{[\s\S]{0,200}?(?:type|action):\s*(`[^`]*\$\{[^`]*`|[^'"`\s][^,\n}]*)/g;
  for (const match of source.matchAll(dynamicField)) {
    found.push(`${file} sends a computed name: ${match[1]?.trim()}`);
  }

  const dynamicWrapper = /(?<![.\w])sendMessage\(\s*([A-Za-z_$][\w$.]*)/g;
  for (const match of source.matchAll(dynamicWrapper)) {
    found.push(`${file} sends a computed name: ${match[1]}`);
  }

  return found;
}

function collectClientSends(): FoundSend[] {
  return CLIENT_SURFACES.flatMap((surface) =>
    listFiles(path.join(SRC_DIR, surface)).flatMap((file) =>
      findSends(fs.readFileSync(file, 'utf8'), path.relative(SRC_DIR, file)),
    ),
  );
}

/**
 * The two handlers the background keeps inline rather than in a module,
 * because they close over the telemetry tracker it owns.
 *
 * Naming them here duplicates three lines of `background.ts`. The duplication
 * fails safe: a fourth inline handler that this list does not know about makes
 * the test complain about a name that is in fact handled, which is a minute's
 * work to fix and impossible to miss — the opposite direction, a dead send
 * slipping through, cannot happen.
 */
const INLINE_BACKGROUND_HANDLERS = ['getLogs', 'flushLogs', 'clearLogs'];

/** Every name the background will actually dispatch, by any route. */
function collectHandledNames(): Set<string> {
  return new Set([
    ...createConfiguredRegistry().getHandlerNames(),
    ...Object.keys(exportHandlers),
    ...Object.keys(queueHandlers),
    ...INLINE_BACKGROUND_HANDLERS,
    ...Object.keys(LEGACY_BRIDGE),
  ]);
}

describe('message wiring', () => {
  it('sends only message names the background has a handler for', () => {
    const handled = collectHandledNames();

    const unhandled = collectClientSends()
      .filter((send) => !handled.has(send.type))
      .map((send) => `${send.file} sends '${send.type}', which nothing handles`);

    expect([...new Set(unhandled)]).toEqual([]);
  });

  it('bridges legacy action names onto handlers that exist', () => {
    // A bridge row is invisible from the call site: the content script sends
    // its own old name and the background quietly rewrites it. A row pointing
    // at a name nobody registered therefore reads as wired and does nothing.
    const registered = new Set(createConfiguredRegistry().getHandlerNames());

    const broken = Object.entries(LEGACY_BRIDGE)
      .filter(([, canonical]) => !registered.has(canonical))
      .map(([action, canonical]) => `'${action}' bridges to unregistered '${canonical}'`);

    expect(broken).toEqual([]);
  });

  it('names every message it sends with a literal', () => {
    const computed = CLIENT_SURFACES.flatMap((surface) =>
      listFiles(path.join(SRC_DIR, surface)).flatMap((file) =>
        findDynamicSends(fs.readFileSync(file, 'utf8'), path.relative(SRC_DIR, file)),
      ),
    );

    expect(computed).toEqual([]);
  });

  it('finds the sends it is supposed to be checking', () => {
    // Without this, a scan that quietly stopped matching anything — a call
    // style change, a moved file — would leave the test above passing on an
    // empty list and reporting the codebase clean.
    const sends = collectClientSends();
    const types = new Set(sends.map((send) => send.type));

    expect(types.has('playback.pause')).toBe(true);
    expect(types.has('PARAGRAPH_CLICKED')).toBe(true);
    expect(types.size).toBeGreaterThan(20);
  });
});
