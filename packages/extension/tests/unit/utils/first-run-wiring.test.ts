/**
 * First-run wiring source pins (PROSO-134/#27 falsifiers D + E).
 *
 * The code-level guarantees that unit tests cannot reach through an
 * entrypoint: the grant fires from the click handler (the event is passed
 * into connectLocalHost, which refuses null — unit-tested), and no probe
 * string ever ships in the extension source.
 *
 * @module tests/unit/utils/first-run-wiring
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Read a shipped extension source file as text (source-pin helper). */
function srcText(relative: string): string {
  return readFileSync(resolve(here, '..', '..', '..', 'src', relative), 'utf8');
}

const popupSource = srcText('entrypoints/popup/main.ts');
const popupHtml = srcText('entrypoints/popup/index.html');
const firstRunModule = srcText('utils/first-run.ts');

describe('first-run wiring pins', () => {
  it('the panel markup exists with the public testids (falsifier C surface)', () => {
    expect(popupHtml).toContain('id="first-run-panel"');
    expect(popupHtml).toContain('data-testid="popup-first-run"');
    expect(popupHtml).toContain('data-testid="popup-first-run-host-connect"');
    expect(popupHtml).toContain('data-testid="popup-first-run-byok-save"');
    expect(popupHtml).toContain('The page\'s text is sent only to the address you enter here');
  });

  it('the Connect click passes its event into connectLocalHost (falsifier D)', () => {
    expect(popupSource).toContain('handleFirstRunConnect(event)');
    expect(popupSource).toContain('event.preventDefault()');
    // The event is forwarded as the grant gesture — the module refuses null.
    expect(popupSource).toMatch(/connectLocalHost\(\{\s*address: elements\.firstRunHostUrl\.value,/);
    expect(popupSource).toContain('event,');
    expect(popupSource).toContain("perms: browser.permissions");
  });

  it('the module refuses a programmatic grant (falsifier D, module half)', () => {
    expect(firstRunModule).toContain('if (!event)');
    expect(firstRunModule).toContain('permission_denied');
  });

  it('no probe, no shipped address, no discovery (falsifier E)', () => {
    const banned = /orangepi|tailf59220|avahi|mDNS|subnet|nmap|192\.168\.|10\.0\.0\.|17[23]\.\d+\./i;
    expect(popupSource).not.toMatch(banned);
    expect(firstRunModule).not.toMatch(banned);
    expect(popupHtml).not.toMatch(banned);
    // The prefill source is storage only (offer, never probe).
    expect(popupSource).toMatch(/localHostUrl/);
  });

  it('play failures route through the single classifier (falsifier C path)', () => {
    expect(popupSource).toContain('void routeFailure(errorMsg)');
    expect(popupSource).toContain('classifyFailure(');
  });
});
