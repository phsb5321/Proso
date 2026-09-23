/**
 * Loaded-Firefox acceptance for Feature 229, including its engagement amendment.
 * First visits are inert. Public popup Play engages the origin; real pointer
 * hover must reveal paint and a play cue, including on dark/clipped host pages.
 * Settings setup uses an isolated profile and synthetic local audio only.
 * PASS=0, observed failure=1, missing prerequisite/runtime failure=2.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Blocked,
  JOURNEY_PREFS,
  blocked,
  chromeEval,
  clickBrowserAction,
  clickByName,
  ensurePopupOpen,
  openExtensionPage,
  openExtensionsPanel,
  readPopup,
  resolveFirefox,
} from './lib/firefox-popup.mjs';
import { startFixtureServer } from './lib/reading-fixture-server.mjs';
import { launch, sleep, waitFor } from './lib/webdriver.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = path.join(root, 'packages/extension/.output/firefox-mv2');
const output = path.resolve(
  root,
  process.env.HOVER_ARTIFACT_DIR ?? '.artifacts/hover-affordance-gate',
);
const id = '{41eb66cb-b520-4047-9b6c-63fdce6fca11}';
const uuid = '22900000-0000-4000-8000-000000000023';
const checks = [];
const receipt = {
  command: 'make hover-affordance-gate',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  seed: 'deterministic fixture; no random actions',
  profile: 'isolated geckodriver temporary profile; no daily-profile access',
  checks,
  samples: [],
  verdict: 'BLOCKED',
  limitations: [
    'Synthetic forum-like fixture, not the authenticated user page or daily profile.',
    'In-process extension popup is the existing public-control harness relaxation.',
    'The hover cue oracle accepts either an existing visible selection button or the shared hover control.',
  ],
};
mkdirSync(output, { recursive: true });
const save = () =>
  writeFileSync(path.join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
function check(label, ok, detail = '') {
  checks.push({ label, ok: Boolean(ok), detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  save();
}

// A genuine 30s WAV keeps playback active while hover measurements are taken.
function audio() {
  const bytes = 16000 * 2 * 30;
  const wav = Buffer.alloc(44 + bytes);
  wav.write('RIFF');
  wav.writeUInt32LE(36 + bytes, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(bytes, 40);
  return wav;
}

const snapshot = `
  const p = document.querySelector('article p:nth-of-type(2)');
  const r = p.getBoundingClientRect();
  const s = getComputedStyle(p);
  const icons = [...p.querySelectorAll('.proso-play-icon'), ...document.querySelectorAll('.proso-hover-play-icon')];
  const cue = icons.map(el => {
    const b = el.getBoundingClientRect(), c = getComputedStyle(el);
    const x=b.x+b.width/2, y=b.y+b.height/2, hit=document.elementFromPoint(x,y);
    return { visible: b.width>0 && b.height>0 && c.visibility!=='hidden' && Number(c.opacity)>0.9 &&
      x>=0 && y>=0 && x<innerWidth && y<innerHeight && (hit===el || el.contains(hit)),
      label:el.getAttribute('aria-label'), x, y };
  }).find(c => c.visible) ?? null;
  return { marked: document.querySelectorAll('.proso-hoverable').length,
    selectable: document.querySelectorAll('.proso-selectable').length,
    icons: document.querySelectorAll('.proso-play-icon').length,
    hover: p.matches(':hover'), cursor: s.cursor, background: s.backgroundColor,
    image: s.backgroundImage, imageSize: s.backgroundSize, imagePosition: s.backgroundPosition,
    shadow: s.boxShadow, position: s.position,
    cue,
    box: { x:r.x, y:r.y, width:r.width, height:r.height },
    footer: !!document.querySelector('#proso-sticky-footer'),
    highlighted: document.querySelector('.proso-highlight')?.textContent ?? null };
`;
async function move(driver, over) {
  if (over) {
    const p = await driver.session('POST', '/element', {
      using: 'css selector',
      value: 'article p:nth-of-type(2)',
    });
    await driver.session('POST', '/actions', {
      actions: [
        {
          type: 'pointer',
          id: 'hover',
          parameters: { pointerType: 'mouse' },
          actions: [{ type: 'pointerMove', duration: 100, origin: p, x: 0, y: 0 }],
        },
      ],
    });
  } else {
    await driver.session('POST', '/actions', {
      actions: [
        {
          type: 'pointer',
          id: 'hover',
          parameters: { pointerType: 'mouse' },
          actions: [{ type: 'pointerMove', duration: 100, origin: 'viewport', x: 1, y: 1 }],
        },
      ],
    });
  }
  await sleep(250);
}
async function hostTheme(driver, dark) {
  await driver.execute(
    `
    let style = document.getElementById('forum-theme');
    if (!style) { style=document.createElement('style'); style.id='forum-theme'; document.head.append(style); }
    style.textContent = 'body { margin:0; background:' + (arguments[0] ? '#17191c;color:#eee' : '#fff;color:#111') +
      ';font:16px/1.6 sans-serif } article { width:640px;margin:20px;overflow:hidden;position:relative }' +
      'article p { overflow:hidden; margin:12px 0 12px 60px; min-height:50px }';
  `,
    [dark],
  );
}
async function hoverProof(driver, phase) {
  await move(driver, false);
  const before = await driver.execute(snapshot);
  await move(driver, true);
  const after = await driver.execute(snapshot);
  receipt.samples.push({ phase, before, after });
  check(
    `${phase}: hover reaches the live paragraph`,
    after.hover && after.marked > 0 && after.cursor === 'pointer',
  );
  check(
    `${phase}: visible band and hit-testable play cue despite clipping`,
    after.cue !== null && after.background !== before.background && after.shadow !== 'none',
    JSON.stringify({ cue: after.cue, background: after.background, shadow: after.shadow }),
  );
  check(
    `${phase}: no layout or positioning change`,
    JSON.stringify(before.box) === JSON.stringify(after.box) && before.position === after.position,
  );
  writeFileSync(
    path.join(output, `${phase}.png`),
    Buffer.from(await driver.session('GET', '/screenshot'), 'base64'),
  );
  await move(driver, false);
  // The pointer's 150ms gutter grace is followed by the existing 200–300ms
  // host-paragraph transition. Keep the exact same paint predicate, but wait
  // for it instead of sampling mid-transition after a fixed 250ms sleep.
  const off = await waitFor(
    `${phase}: hover paint settles after pointer leave`,
    async () => {
      const seen = await driver.execute(snapshot);
      return seen.cue === null && seen.background === before.background ? seen : null;
    },
    { timeoutMs: 2000 },
  ).catch(() => driver.execute(snapshot));
  receipt.samples[receipt.samples.length - 1].off = off;
  check(
    `${phase}: paint and cue are hover-only`,
    off.cue === null && off.background === before.background,
  );
  save();
}

async function main() {
  if (!existsSync(path.join(build, 'manifest.json')))
    blocked('Missing Firefox build; run make hover-affordance-gate');
  const binary = resolveFirefox();
  receipt.binary = binary;
  receipt.version = JSON.parse(readFileSync(path.join(build, 'manifest.json'))).version;
  receipt.backgroundSha256 = createHash('sha256')
    .update(readFileSync(path.join(build, 'background.js')))
    .digest('hex');
  receipt.gateSha256 = createHash('sha256')
    .update(readFileSync(fileURLToPath(import.meta.url)))
    .digest('hex');
  receipt.contentSha256 = createHash('sha256')
    .update(readFileSync(path.join(build, 'content-scripts/content.js')))
    .digest('hex');
  const fixture = await startFixtureServer({ audio: audio(), audioContentType: 'audio/wav' });
  const driver = await launch({
    binary,
    headless: process.env.GATE_HEADED !== '1',
    extraArgs: ['-remote-allow-system-access'],
    prefs: {
      ...JOURNEY_PREFS,
      'extensions.webextensions.uuids': JSON.stringify({ [id]: uuid }),
      'ui.systemUsesDarkTheme': 0, // dark site must work even with a LIGHT browser preference
    },
  });
  try {
    await driver.installAddon(build);
    await openExtensionPage(driver, `moz-extension://${uuid}/settings.html`);
    await driver.executeAsync(
      `const [serverUrl, done] = arguments;
      browser.storage.local.set({serverUrl,provider:'openai',licenseKey:null,cacheType:'memory',speed:1}).then(done);`,
      [fixture.origin],
    );
    await driver.execute('browser.runtime.reload(); return true;').catch(() => {});
    await sleep(2500);
    const source = (await driver.session('GET', '/window/handles'))[0];
    await driver.session('POST', '/window', { handle: source });
    await driver.navigate(`${fixture.origin}/article`);
    await waitFor('content injection', () =>
      driver.execute("return !!document.getElementById('proso-content-styles');"),
    );
    await hostTheme(driver, true);
    await sleep(3500);
    await driver.execute(
      `document.querySelector('article').insertAdjacentHTML('beforeend', '<p>A newly arrived forum reply must not enable a first-visit origin merely because it is readable text.</p>');`,
    );
    await sleep(1800);
    await move(driver, true);
    const firstVisit = await driver.execute(snapshot);
    receipt.firstVisit = firstVisit;
    check(
      'first-visit idle and mutation remain unmarked with no hover cue',
      firstVisit.marked === 0 && firstVisit.icons === 0 && firstVisit.image === 'none',
    );
    await driver.session('POST', '/actions', {
      actions: [
        {
          type: 'pointer',
          id: 'hover',
          parameters: { pointerType: 'mouse' },
          actions: [
            { type: 'pointerDown', button: 0 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    });
    await sleep(400);
    check(
      'first-visit paragraph click starts no synthesis',
      fixture.requests.length === 0 && !(await driver.execute(snapshot)).footer,
    );

    const open = async () => {
      await openExtensionsPanel(driver);
      await clickBrowserAction(driver, id);
    };
    const control = async (name) => {
      await ensurePopupOpen(driver, open);
      await waitFor(`popup ${name}`, async () => (await readPopup(driver)).names?.includes(name));
      await clickByName(driver, name, open);
    };
    const dismiss = () =>
      chromeEval(
        driver,
        `const w=Services.wm.getMostRecentWindow('navigator:browser');
      for (const p of w.document.querySelectorAll('panel')) if(p.state==='open') p.hidePopup(); return true;`,
      );
    await control('Play');
    await dismiss();
    await waitFor('successful popup playback and live marking', async () => {
      const s = await driver.execute(snapshot);
      return s.footer && s.highlighted && s.marked > 0 && fixture.requests.length > 0;
    });
    check(
      'public popup Play engages and decorates the live page',
      true,
      `${fixture.requests.length} real fixture synthesis requests`,
    );
    await hoverProof(driver, 'playing-dark');
    await move(driver, true);
    const cue = (await driver.execute(snapshot)).cue;
    if (cue) {
      await driver.session('POST', '/actions', {
        actions: [
          {
            type: 'pointer',
            id: 'hover',
            parameters: { pointerType: 'mouse' },
            actions: [
              {
                type: 'pointerMove',
                origin: 'viewport',
                x: Math.round(cue.x),
                y: Math.round(cue.y),
                duration: 100,
              },
              { type: 'pointerDown', button: 0 },
              { type: 'pointerUp', button: 0 },
            ],
          },
        ],
      });
      const sought = await waitFor('hover control seeks the chosen paragraph', async () =>
        (await driver.execute(snapshot)).highlighted?.includes(
          'A reliable reader must also let people pause',
        ),
      ).catch(() => false);
      check('the visible hover control seeks the selected paragraph', sought);
      // Release keyboard focus so the next hover-only measurement starts neutral.
      await driver.execute('document.activeElement?.blur();');
    } else {
      check(
        'the visible hover control seeks the selected paragraph',
        false,
        'no reachable control',
      );
    }
    await hostTheme(driver, false);
    await hoverProof(driver, 'playing-light');
    await control('Stop playback');
    await dismiss();
    await hostTheme(driver, true);
    await hoverProof(driver, 'stopped-dark');

    await driver.navigate(`${fixture.origin}/article?return=engaged`);
    await waitFor(
      'engaged origin marks after reload',
      async () => (await driver.execute(snapshot)).marked > 0,
    );
    await hostTheme(driver, true);
    await hoverProof(driver, 'return-dark');
    const previousDocument = await driver.execute('return performance.timeOrigin;');
    await driver.execute(`const a = document.querySelector('article'); a.replaceChildren();
      for (let i=0;i<6;i++) { const p=document.createElement('p'); p.textContent='Routed paragraph '+i+
      ' arrived without a document load, while the engaged origin keeps the reading affordance visible on new content.'; a.append(p); }`);
    await waitFor(
      'routed paragraphs marked',
      async () => (await driver.execute(snapshot)).marked >= 6,
    );
    check(
      'route swap preserves the document and re-marks live nodes',
      (await driver.execute('return performance.timeOrigin;')) === previousDocument,
    );
    await hoverProof(driver, 'routed-dark');
    await driver.execute(`window.hoverWrites=0; window.hoverObserver=new MutationObserver(r=>window.hoverWrites+=r.length);
      window.hoverObserver.observe(document.querySelector('article'),{childList:true,subtree:true,attributes:true,attributeFilter:['class']});`);
    await sleep(3000);
    const writes = await driver.execute(
      'window.hoverWrites+=window.hoverObserver.takeRecords().length; window.hoverObserver.disconnect(); return window.hoverWrites;',
    );
    check('idle article has no repeated DOM writes', writes === 0, `${writes} writes over 3s`);
    const started = Date.now();
    const settled = await driver.execute(snapshot);
    check(
      'page remains responsive with stable routed marker count',
      Date.now() - started < 2000 && settled.marked >= 6,
    );

    await openExtensionPage(driver, `moz-extension://${uuid}/settings.html`);
    const origins = await driver.executeAsync(
      'const done=arguments[0]; browser.storage.local.get("hoverPlayOrigins").then(done);',
    );
    receipt.origins = origins;
    check(
      'popup success stores only the page origin, not the extension origin',
      JSON.stringify(origins.hoverPlayOrigins) === JSON.stringify([fixture.origin]),
    );
    // A different host is a different origin, even with identical readable HTML.
    await driver.session('POST', '/window', { handle: source });
    await driver.navigate(`${fixture.origin.replace('127.0.0.1', 'localhost')}/article`);
    await waitFor('fresh origin content injection', () =>
      driver.execute("return !!document.getElementById('proso-content-styles');"),
    );
    await sleep(3500);
    await move(driver, true);
    const other = await driver.execute(snapshot);
    check(
      'engagement never leaks to a different first-visit origin',
      other.marked === 0 && other.icons === 0 && other.image === 'none',
    );
    receipt.verdict = checks.every((c) => c.ok) ? 'PASS' : 'FAIL';
  } finally {
    receipt.synthesisRequests = fixture.requests.length;
    writeFileSync(path.join(output, 'browser-process.log'), driver.getProcessLogs());
    save();
    await driver.quit().catch(() => {});
    await fixture.close();
  }
  console.log(
    `hover-affordance-gate ${receipt.verdict} — ${checks.length} check(s), ${checks.filter((c) => !c.ok).length} failed`,
  );
  process.exitCode = receipt.verdict === 'PASS' ? 0 : 1;
}
main().catch((error) => {
  receipt.verdict = 'BLOCKED';
  receipt.error = error.message;
  save();
  console.error(
    `hover-affordance-gate BLOCKED — ${error instanceof Blocked ? error.message : error.stack}`,
  );
  process.exitCode = 2;
});
