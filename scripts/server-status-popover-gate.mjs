#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
//
// server-status-popover-gate — Feature 170 regression: the settings
// server-status detail must stay visible, topmost, unclipped, and
// keyboard/hover reachable in light/dark/narrow/zoom states.
//
// Runs against the REAL built extension loaded in a dedicated Firefox
// profile (raw geckodriver; no Playwright on the host). The defect this
// gate exists to catch (measured 13/08/2026): without single-column named
// grid areas in the base `.container`, the header's `grid-area: header`
// dropped it into an implicit ~1812px row at <=768px — the server-status
// block (and its popover) landed mid-page and the page auto-scrolled.
// The popover also carried a static `aria-hidden="true"` while visible.
//
// Plants (POPOVER_PLANT) sever exactly one link and must turn the gate RED:
//   grid-areas   injects the original CSS (no base areas, 3 rows) — the
//                narrow-header assertion must fail.
//   aria-static  re-applies the static aria-hidden after focus — the
//                aria-reflection assertion must fail.
//
// Exit codes: 0 PASS, 1 FAIL, 2 BLOCKED (missing build/browser/tool).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openExtensionPage, resolveFirefox } from './lib/firefox-popup.mjs';
import { launch, sleep } from './lib/webdriver.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const buildDir = path.join(repoRoot, 'packages/extension/.output/firefox-mv2');
const PLANT = process.env.POPOVER_PLANT ?? '';

const ADDON_ID = '{41eb66cb-b520-4047-9b6c-63fdce6fca11}';
const ADDON_UUID = '8b3f6f5a-2e1c-4a77-9f0d-4c2ab5d61b90';

const steps = [];
let failures = 0;

function record(name, detail) {
  steps.push({ name, detail });
  process.stdout.write(`  ok  ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function fail(name, detail) {
  failures += 1;
  process.stdout.write(`  not ok  ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function verdict() {
  const line = `server-status-popover-gate ${failures === 0 ? 'PASS' : 'FAIL'}`;
  process.stdout.write(`${line}\n`);
  return failures === 0 ? 0 : 1;
}

function blocked(message) {
  process.stdout.write(`server-status-popover-gate BLOCKED: ${message}\n`);
  return 2;
}

const SCHEME_PREF = 'layout.css.prefers-color-scheme.content-override';

const MEASURE_NARROW = `
  const header = document.querySelector('.header').getBoundingClientRect();
  const container = getComputedStyle(document.querySelector('.container'));
  const status = document.getElementById('serverStatus').getBoundingClientRect();
  return {
    innerWidth: window.innerWidth,
    headerHeight: header.height,
    statusTop: status.top,
    columns: container.gridTemplateColumns.split(' ').length,
    areas: container.gridTemplateAreas,
  };
`;

async function setViewport(driver, width, height) {
  await driver.session('POST', '/window/rect', { width, height });
  await sleep(400);
}

async function setZoom(driver, zoom) {
  // Real Firefox page zoom (the same mechanism Ctrl++ drives): set the
  // tab's fullZoom through the chrome context, then read the resulting CSS
  // viewport in content.
  const { chromeEval } = await import('./lib/firefox-popup.mjs');
  await chromeEval(driver, `gBrowser.selectedBrowser.fullZoom = ${zoom}; return true;`);
  await sleep(400);
}

async function pointerTo(driver, x, y) {
  await driver.session('POST', '/actions', {
    actions: [
      {
        type: 'pointer',
        id: 'mouse',
        parameters: { pointerType: 'mouse' },
        actions: [{ type: 'pointerMove', duration: 0, x, y }],
      },
    ],
  });
  await sleep(300);
}

async function populateDetailRows(driver) {
  // Setup, not an actor action: the popover's real production height only
  // exists once the rows carry content (the fixture server is not part of
  // this gate; the fetch fails and fills the error row).
  await driver.execute(`
    for (const [id, text] of [['serverDetailUrl', 'URL: https://api.proso.com.br'],
                              ['serverDetailVersion', 'Version: 1.0.0'],
                              ['serverDetailUptime', 'Uptime: 3d 12h'],
                              ['serverDetailError', 'Error: HTTP 502']]) {
      const row = document.getElementById(id);
      if (row) row.textContent = text;
    }
    return true;
  `);
}

async function assertNarrowLayout(driver, label) {
  const m = await driver.execute(MEASURE_NARROW);
  // No plant special-casing: under a plant, the NORMAL assertions must go
  // red — that red is the proof the gate catches the planted defect.
  if (m.innerWidth > 768) {
    fail(`${label}: expected a narrow viewport`, `innerWidth=${m.innerWidth}`);
    return;
  }
  if (m.headerHeight > 300) {
    fail(`${label}: header height is ${m.headerHeight}px (narrow grid-areas defect)`);
    return;
  }
  if (m.columns !== 1) {
    fail(`${label}: container has ${m.columns} column tracks at narrow width`);
    return;
  }
  if (!m.areas.includes('"header"')) {
    fail(`${label}: named areas missing at narrow width (${m.areas})`);
    return;
  }
  record(`${label}: narrow layout sane`, `header=${m.headerHeight}px, columns=${m.columns}`);
}

async function assertTopmostUnclipped(driver, label, options = {}) {
  const expectOverlap = options.expectOverlap === true;
  await populateDetailRows(driver);
  const m = await driver.execute(`
    const detail = document.getElementById('serverStatusDetail');
    document.getElementById('serverStatusRefresh').focus();
    const rect = detail.getBoundingClientRect();
    const card = document.querySelector('.proso-card');
    const cardRect = card ? card.getBoundingClientRect() : null;
    const probes = [];
    if (cardRect) {
      const top = Math.max(rect.top, cardRect.top);
      const bottom = Math.min(rect.bottom, cardRect.bottom);
      for (let py = top + 2; py < bottom; py += 8) {
        const el = document.elementFromPoint(Math.min(rect.left + rect.width / 2, window.innerWidth - 1), py);
        if (el && !detail.contains(el)) probes.push(py);
      }
    }
    return {
      display: getComputedStyle(detail).display,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      cardTop: cardRect ? cardRect.top : null,
      cardBottom: cardRect ? cardRect.bottom : null,
      foreignProbes: probes,
    };
  `);
  if (m.display !== 'block') {
    fail(`${label}: detail not revealed on keyboard focus`, `display=${m.display}`);
    return;
  }
  if (
    m.rect.left < 0 ||
    m.rect.right > m.innerWidth ||
    m.rect.top < 0 ||
    m.rect.bottom > m.innerHeight
  ) {
    fail(`${label}: detail clipped by the viewport`, JSON.stringify(m.rect));
    return;
  }
  if (expectOverlap) {
    // The vacuity guard (Codex round 1): without a card, a positive overlap,
    // and at least one executed probe, the topmost assertion proves nothing.
    if (m.cardTop === null) {
      fail(`${label}: topmost assertion vacuous — no .proso-card found`);
      return;
    }
    const overlapTop = Math.max(m.rect.top, m.cardTop);
    const overlapBottom = Math.min(m.rect.bottom, m.cardBottom);
    if (overlapBottom - overlapTop < 8) {
      fail(
        `${label}: topmost assertion vacuous — popover does not overlap the card`,
        `overlap=${overlapBottom - overlapTop}px`,
      );
      return;
    }
    if (m.foreignProbes.length > 0) {
      fail(`${label}: detail covered by another element`, `y=${m.foreignProbes.join(',')}`);
      return;
    }
  } else if (m.foreignProbes.length > 0) {
    fail(`${label}: detail covered by another element`, `y=${m.foreignProbes.join(',')}`);
    return;
  }
  record(`${label}: detail revealed, unclipped, topmost`, JSON.stringify(m.rect));
}

async function assertAriaReflection(driver, label) {
  const readAria = () =>
    driver.execute(
      `return document.getElementById('serverStatusDetail').getAttribute('aria-hidden');`,
    );
  const focusRefresh = () =>
    driver.execute(`document.getElementById('serverStatusRefresh').focus(); return true;`);
  const blurAll = () =>
    driver.execute(`document.getElementById('serverStatusRefresh').blur(); return true;`);

  await blurAll();
  const hiddenBefore = await readAria();
  if (hiddenBefore !== 'true') {
    fail(`${label}: aria-hidden should start true`, `got ${hiddenBefore}`);
    return;
  }
  await focusRefresh();
  await sleep(100);
  if (PLANT === 'card-covers') {
  // Plant run: cover the card over the popover (z-index escalation on the
  // card) — the topmost overlap probe must go red.
  const plantDriver = await launch({
    binary: resolveFirefox(),
    headless: process.env.GATE_HEADED !== '1',
    extraArgs: ['-remote-allow-system-access'],
    prefs: {
      'extensions.webextensions.uuids': JSON.stringify({ [ADDON_ID]: ADDON_UUID }),
      [SCHEME_PREF]: 1,
    },
  });
  try {
    await plantDriver.installAddon(buildDir);
    await openExtensionPage(plantDriver, `moz-extension://${ADDON_UUID}/settings.html`);
    await sleep(1000);
    await plantDriver.execute(`
      const style = document.createElement('style');
      style.textContent = '.proso-card{position:relative!important;z-index:9999!important}';
      document.head.appendChild(style);
      return true;
    `);
    await setViewport(plantDriver, 1024, 768);
    await assertTopmostUnclipped(plantDriver, 'plant card-covers desktop 1024', {
      expectOverlap: true,
    });
  } finally {
    await plantDriver.quit().catch(() => {});
  }
  process.exit(verdict());
}

if (PLANT === 'aria-static') {
    await driver.execute(
      `document.getElementById('serverStatusDetail').setAttribute('aria-hidden', 'true'); return true;`,
    );
  }
  const focusedAria = await readAria();
  if (focusedAria !== 'false') {
    fail(`${label}: aria-hidden must reflect the visible popover (keyboard)`, `got ${focusedAria}`);
    return;
  }
  // Real pointer hover (W3C pointer actions, not a synthetic event).
  const center = await driver.execute(`
    const r = document.getElementById('serverStatus').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  `);
  await pointerTo(driver, center.x, center.y);
  const hoverAria = await readAria();
  if (hoverAria !== 'false') {
    fail(`${label}: aria-hidden must reflect the hover-revealed popover`, `got ${hoverAria}`);
    return;
  }
  await pointerTo(driver, 1, 1);
  await sleep(300);
  await blurAll();
  const leftAria = await readAria();
  if (leftAria !== 'true') {
    fail(`${label}: aria-hidden must return to true when the popover hides`, `got ${leftAria}`);
    return;
  }
  record(`${label}: aria-hidden mirrors visibility`, 'focus/hover reveal, blur/leave hide');
}

async function assertTouchTarget(driver, label) {
  const size = await driver.execute(`
    const r = document.getElementById('serverStatusRefresh').getBoundingClientRect();
    return { w: r.width, h: r.height };
  `);
  if (size.w < 44 || size.h < 44) {
    fail(`${label}: refresh target is ${size.w}x${size.h} (44x44 required)`);
    return;
  }
  record(`${label}: refresh touch target`, `${size.w}x${size.h}`);
}

async function main() {
  if (!existsSync(path.join(buildDir, 'manifest.json'))) {
    return blocked(
      `Missing Firefox build at ${buildDir}. Run: pnpm --filter @proso/extension build:firefox`,
    );
  }
  const binary = resolveFirefox();
  try {
    await import('node:child_process').then(({ execFileSync }) =>
      execFileSync('geckodriver', ['--version'], { encoding: 'utf8' }),
    );
  } catch {
    return blocked('geckodriver not found on PATH');
  }

  const lightDriver = await launch({
    binary,
    headless: process.env.GATE_HEADED !== '1',
    extraArgs: ['-remote-allow-system-access'],
    prefs: {
      'extensions.webextensions.uuids': JSON.stringify({ [ADDON_ID]: ADDON_UUID }),
      [SCHEME_PREF]: 1, // light
    },
  });
  try {
    await lightDriver.installAddon(buildDir);
    await openExtensionPage(lightDriver, `moz-extension://${ADDON_UUID}/settings.html`);
    await sleep(1200);

    // Desktop light: topmost + unclipped + touch target.
    await setViewport(lightDriver, 1024, 768);
    await assertTopmostUnclipped(lightDriver, 'desktop light 1024', { expectOverlap: true });
    await assertAriaReflection(lightDriver, 'desktop light 1024');
    await assertTouchTarget(lightDriver, 'desktop light 1024');

    // Narrow light: the regression the defect lived in.
    await setViewport(lightDriver, 375, 740);
    await assertNarrowLayout(lightDriver, 'narrow light 375');
    await assertTopmostUnclipped(lightDriver, 'narrow light 375', { expectOverlap: false });
    await assertAriaReflection(lightDriver, 'narrow light 375');

    // Zoom: Firefox's real page zoom must keep the narrow layout sane
    // (the CSS viewport shrinks below the 769 breakpoint).
    await setViewport(lightDriver, 1024, 768);
    await setZoom(lightDriver, 1.5);
    const zoomed = await driverInnerWidth(lightDriver);
    if (zoomed >= 769) {
      fail('zoom narrow: zoom did not shrink the CSS viewport', `innerWidth=${zoomed}`);
    } else {
      await assertNarrowLayout(lightDriver, 'zoom light (150%)');
      await assertTopmostUnclipped(lightDriver, 'zoom light (150%)', { expectOverlap: false });
    }
    await setZoom(lightDriver, 1);

    // Dark parity: same narrow checks under the dark scheme.
    const darkDriver = await launch({
      binary,
      headless: process.env.GATE_HEADED !== '1',
      extraArgs: ['-remote-allow-system-access'],
      prefs: {
        'extensions.webextensions.uuids': JSON.stringify({ [ADDON_ID]: ADDON_UUID }),
        [SCHEME_PREF]: 0, // dark
      },
    });
    try {
      await darkDriver.installAddon(buildDir);
      await openExtensionPage(darkDriver, `moz-extension://${ADDON_UUID}/settings.html`);
      await sleep(1200);
      await setViewport(darkDriver, 375, 740);
      await assertNarrowLayout(darkDriver, 'narrow dark 375');
      await assertTopmostUnclipped(darkDriver, 'narrow dark 375', { expectOverlap: false });
      await assertAriaReflection(darkDriver, 'narrow dark 375');
    } finally {
      await darkDriver.quit().catch(() => {});
    }
  } finally {
    await lightDriver.quit().catch(() => {});
  }

  if (PLANT) {
    // Plant mode: the gate must come back RED, not green.
    process.stdout.write(
      `server-status-popover-gate ${failures > 0 ? 'FAIL' : 'PASS'} (plant: ${PLANT})\n`,
    );
    return failures > 0 ? 1 : 0;
  }
  return verdict();
}

async function driverInnerWidth(driver) {
  return driver.execute('return window.innerWidth;');
}

if (PLANT === 'grid-areas') {
  // Plant run: inject the original defect (no named areas, old three rows)
  // and require the narrow-layout assertion to come back red.
  const plantDriver = await launch({
    binary: resolveFirefox(),
    headless: process.env.GATE_HEADED !== '1',
    extraArgs: ['-remote-allow-system-access'],
    prefs: {
      'extensions.webextensions.uuids': JSON.stringify({ [ADDON_ID]: ADDON_UUID }),
      [SCHEME_PREF]: 1,
    },
  });
  try {
    await plantDriver.installAddon(buildDir);
    await openExtensionPage(plantDriver, `moz-extension://${ADDON_UUID}/settings.html`);
    await sleep(1000);
    await plantDriver.execute(`
      const style = document.createElement('style');
      style.textContent = '.container{grid-template-areas:none!important;grid-template-rows:auto 1fr auto!important}';
      document.head.appendChild(style);
      return true;
    `);
    await setViewport(plantDriver, 375, 740);
    await assertNarrowLayout(plantDriver, 'plant grid-areas narrow 375');
  } finally {
    await plantDriver.quit().catch(() => {});
  }
  process.exit(verdict());
}

if (PLANT === 'card-covers') {
  // Plant run: cover the card over the popover (z-index escalation on the
  // card) — the topmost overlap probe must go red.
  const plantDriver = await launch({
    binary: resolveFirefox(),
    headless: process.env.GATE_HEADED !== '1',
    extraArgs: ['-remote-allow-system-access'],
    prefs: {
      'extensions.webextensions.uuids': JSON.stringify({ [ADDON_ID]: ADDON_UUID }),
      [SCHEME_PREF]: 1,
    },
  });
  try {
    await plantDriver.installAddon(buildDir);
    await openExtensionPage(plantDriver, `moz-extension://${ADDON_UUID}/settings.html`);
    await sleep(1000);
    await plantDriver.execute(`
      const style = document.createElement('style');
      style.textContent = '.proso-card{position:relative!important;z-index:9999!important}';
      document.head.appendChild(style);
      return true;
    `);
    await setViewport(plantDriver, 1024, 768);
    await assertTopmostUnclipped(plantDriver, 'plant card-covers desktop 1024', {
      expectOverlap: true,
    });
  } finally {
    await plantDriver.quit().catch(() => {});
  }
  process.exit(verdict());
}

if (PLANT === 'aria-static') {
  // Plant run: the static aria-hidden defect is injected inside
  // assertAriaReflection; run only that assertion.
  const plantDriver = await launch({
    binary: resolveFirefox(),
    headless: process.env.GATE_HEADED !== '1',
    extraArgs: ['-remote-allow-system-access'],
    prefs: {
      'extensions.webextensions.uuids': JSON.stringify({ [ADDON_ID]: ADDON_UUID }),
      [SCHEME_PREF]: 1,
    },
  });
  try {
    await plantDriver.installAddon(buildDir);
    await openExtensionPage(plantDriver, `moz-extension://${ADDON_UUID}/settings.html`);
    await sleep(1000);
    await setViewport(plantDriver, 1024, 768);
    await assertAriaReflection(plantDriver, 'plant aria-static desktop 1024');
  } finally {
    await plantDriver.quit().catch(() => {});
  }
  process.exit(verdict());
}

main().then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`server-status-popover-gate BLOCKED: ${error.message}\n`);
    process.exit(2);
  },
);
