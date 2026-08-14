/**
 * Grant-repair cross-file consistency (PROSO-131 falsifier D).
 *
 * The popup's grant affordance triggers on the gate's reason marker; the
 * gate's reason lives in composition/factories.ts. If the two drift apart,
 * the popup silently stops offering the repair — a test must catch that
 * drift, not a user.
 *
 * @module tests/unit/entrypoints/popup-grant-affordance
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const factoriesSource = readFileSync(
  resolve(__dirname, '../../../src/composition/factories.ts'),
  'utf8',
);
const popupSource = readFileSync(
  resolve(__dirname, '../../../src/entrypoints/popup/main.ts'),
  'utf8',
);

describe('local-host gate reason ↔ popup affordance marker', () => {
  it("the gate's reason and the popup's marker are the same string", () => {
    const gateReason = 'no access to the configured host origin';
    expect(factoriesSource).toContain(gateReason);
    expect(popupSource).toContain(gateReason);
  });

  it('the popup affordance exists in the DOM and is wired', () => {
    const html = readFileSync(
      resolve(__dirname, '../../../src/entrypoints/popup/index.html'),
      'utf8',
    );
    expect(html).toContain('id="grant-access-row"');
    expect(html).toContain('id="grant-access-btn"');
    expect(popupSource).toContain('handleGrantAccessClick');
    // The helper invokes permissions.request synchronously from this click.
    expect(popupSource).toContain('requestHostPermissionForOrigin(origin, browser.permissions)');
  });
});
