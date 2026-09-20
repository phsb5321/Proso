/** Feature 256 runtime diagnostic. Reuses the retained raw Firefox harness.
 * Public popup Play starts audio. Weak Audio references observe native media
 * without timers, ports, messages or a popup open during the idle interval.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  JOURNEY_PREFS,
  chromeEval,
  clickBrowserAction,
  clickByName,
  openExtensionPage,
  openExtensionsPanel,
  resolveFirefox,
} from './lib/firefox-popup.mjs';
import { startFixtureServer } from './lib/reading-fixture-server.mjs';
import { launch, sleep, waitFor } from './lib/webdriver.mjs';

const seed = Number(process.env.FC_SEED ?? 20260920);
const mode = process.env.BACKGROUND_MODE ?? 'both';
assert.ok(['both', 'enabled', 'disabled'].includes(mode), 'Invalid BACKGROUND_MODE');
const output = process.env.BACKGROUND_ARTIFACT_DIR ?? '.artifacts/background-playback';
const build = path.resolve('packages/extension/.output/firefox-mv2');
const id = '{41eb66cb-b520-4047-9b6c-63fdce6fca11}';
const uuid = '8b3f6f5a-2e1c-4a77-9f0d-4c2ab5d61b90';
const stamp = () => ({
  epochMs: Date.now(),
  local: new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Recife',
    dateStyle: 'short',
    timeStyle: 'medium',
    hour12: false,
  }).format(new Date()),
});
const sha = (data) => createHash('sha256').update(data).digest('hex');
const files = readdirSync(build, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => path.relative(build, path.join(e.parentPath, e.name)))
  .sort();
const hashes = Object.fromEntries(
  files.map((file) => [file, sha(readFileSync(path.join(build, file)))]),
);
const binary = resolveFirefox();
const receipt = {
  seed,
  clock: 'real wall clock; monotonic performance.now() for waits',
  startedAt: stamp(),
  command: `FC_SEED=${seed} BACKGROUND_MODE=${mode} FIREFOX_BIN=${binary} BACKGROUND_ARTIFACT_DIR=${output} node scripts/background-playback-journey.mjs`,
  scriptSha256: sha(readFileSync(new URL(import.meta.url))),
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  firefox: execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim(),
  geckodriver: execFileSync('geckodriver', ['--version'], { encoding: 'utf8' }).split('\n')[0],
  buildTreeSha256: sha(
    Object.entries(hashes)
      .map(([f, h]) => `${f}\0${h}\n`)
      .join(''),
  ),
  buildFiles: hashes,
  manifest: JSON.parse(readFileSync(path.join(build, 'manifest.json'))),
  scenarios: [],
  verdict: 'BLOCKED',
  limitations: [
    'extensions.webextensions.remote=false permits the existing public popup actor and observer.',
    'Setup wraps the native Audio constructor with a forwarding Proxy holding only WeakRefs.',
    'No observer calls during each 90-second hidden interval; no keepalive or idle timeout overrides.',
    'Local managed synthesis stub returns a deterministic non-silent 240-second PCM tone; no provider.',
    'This bounded runtime diagnostic is not the full Feature 095 acceptance matrix.',
  ],
};
mkdirSync(output, { recursive: true });
const save = () =>
  writeFileSync(path.join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);

// Same genuine PCM/WAV shape as the local-host fixtures. Non-zero samples
// avoid using a silent clip to answer a question about audible media lifetime.
const audio = Buffer.alloc(44 + 16000 * 2 * 240);
audio.write('RIFF');
audio.writeUInt32LE(audio.length - 8, 4);
audio.write('WAVEfmt ', 8);
audio.writeUInt32LE(16, 16);
audio.writeUInt16LE(1, 20);
audio.writeUInt16LE(1, 22);
audio.writeUInt32LE(16000, 24);
audio.writeUInt32LE(32000, 28);
audio.writeUInt16LE(2, 32);
audio.writeUInt16LE(16, 34);
audio.write('data', 36);
audio.writeUInt32LE(audio.length - 44, 40);
for (let i = 0; i < (audio.length - 44) / 2; i++) {
  audio.writeInt16LE(
    Math.round(1500 * Math.sin((2 * Math.PI * (220 + (seed % 100)) * i) / 16000)),
    44 + i * 2,
  );
}
receipt.audioSha256 = sha(audio);
const background = `
  const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
  const ext = ExtensionParent.GlobalManager.getExtension(arguments[0]);
  const view = ext && [...ext.views].find(v => v.viewType === 'background');
  const bg = view?.browsingContext?.embedderElement?.contentWindow?.wrappedJSObject;
`;

async function sample(driver, scenario, label) {
  const state = await chromeEval(
    driver,
    background +
      `
    const win = Services.wm.getMostRecentWindow('navigator:browser');
    return {
      persistentBackground: ext?.persistentBackground ?? null,
      backgroundState: ext?.backgroundState ?? null,
      timeOrigin: bg?.performance.timeOrigin ?? null,
      selectedUrl: win.gBrowser.selectedBrowser.currentURI.spec,
      views: ext ? [...ext.views].map(v => v.viewType) : [],
      tabs: [...win.gBrowser.tabs].map(t => ({selected:t.selected, url:t.linkedBrowser.currentURI.spec, active:t.linkedBrowser.browsingContext.isActive})),
      audio: bg?.__prosoAudioProbe?.map(ref => Cu.waiveXrays(ref).deref()).filter(Boolean).map(a => ({
        currentTime: a.currentTime, duration: Number.isFinite(a.duration) ? a.duration : null,
        paused: a.paused, ended: a.ended, readyState: a.readyState, playbackRate: a.playbackRate,
        src: a.currentSrc, error: a.error?.code ?? null,
      })) ?? [],
    };
  `,
    [id],
  );
  const result = { label, ...stamp(), ...state };
  scenario.samples.push(result);
  save();
  console.log(
    JSON.stringify({ mode: scenario.stopPlaybackOnTabChange ? 'disabled' : 'enabled', ...result }),
  );
  return result;
}

async function run(stopPlaybackOnTabChange) {
  const scenario = {
    stopPlaybackOnTabChange,
    samples: [],
    actions: [],
    checks: [],
    verdict: 'BLOCKED',
  };
  receipt.scenarios.push(scenario);
  save();
  let fixture;
  let driver;
  const act = (action) => {
    scenario.actions.push({ action, ...stamp() });
    save();
  };
  const check = (name, ok) => {
    scenario.checks.push({ name, ok });
    save();
  };
  try {
    fixture = await startFixtureServer({ audio, audioContentType: 'audio/wav' });
    scenario.fixtureOrigin = fixture.origin;
    driver = await launch({
      binary,
      extraArgs: ['-remote-allow-system-access'],
      prefs: {
        ...JOURNEY_PREFS,
        'media.volume_scale': '1.0',
        'extensions.webextensions.uuids': JSON.stringify({ [id]: uuid }),
      },
    });
    await driver.installAddon(build);
    await openExtensionPage(driver, `moz-extension://${uuid}/settings.html`);
    await driver.executeAsync(
      `const [serverUrl, stopPlaybackOnTabChange, done] = arguments;
      browser.storage.local.set({serverUrl, stopPlaybackOnTabChange, provider:'openai',
      licenseKey:null,cacheType:'memory',speed:1}).then(done);`,
      [fixture.origin, stopPlaybackOnTabChange],
    );
    scenario.stored = await driver.executeAsync(`const done=arguments[0];
      browser.storage.local.get(['stopPlaybackOnTabChange','serverUrl']).then(done);`);
    await driver.execute('browser.runtime.reload(); return true;').catch(() => {});
    await sleep(3000);
    await driver.session('POST', '/window', {
      handle: (await driver.session('GET', '/window/handles'))[0],
    });
    // Instrument only construction, forwarding unchanged to native Audio.
    assert.equal(
      await chromeEval(
        driver,
        background +
          `
      if (!bg) return false;
      Cu.evalInSandbox('window.__prosoAudioProbe = []; window.Audio = new Proxy(window.Audio, { construct(target, args, newTarget) { const a = Reflect.construct(target, args, newTarget); window.__prosoAudioProbe.push(new WeakRef(a)); return a; } });', Cu.Sandbox(bg, {sandboxPrototype:bg, wantXrays:false}));
      return true;`,
        [id],
      ),
      true,
      'background must be observable before playback',
    );
    const source = await driver.session('GET', '/window');
    scenario.sourceHandle = source;
    const openPopup = async () => {
      await openExtensionsPanel(driver);
      await clickBrowserAction(driver, id);
    };
    const dismiss = async () =>
      chromeEval(
        driver,
        `const w=Services.wm.getMostRecentWindow('navigator:browser');
      for (const panel of w.document.querySelectorAll('panel')) if (panel.state === 'open') panel.hidePopup(); return true;`,
      );
    const start = async () => {
      await driver.session('POST', '/window', { handle: source });
      await driver.navigate(`${fixture.origin}/article`);
      await waitFor('content injection', () =>
        driver.execute("return !!document.getElementById('proso-content-styles');"),
      );
      act('Unified Extensions → Proso → Play');
      await clickByName(driver, 'Play', openPopup);
      await dismiss();
      await waitFor('native audio advancing', async () => {
        const s = await sample(driver, scenario, 'start-probe');
        return s.audio.some((a) => !a.paused && a.currentTime > 0.1);
      });
    };
    await start();
    const baseline = await sample(driver, scenario, 'before-hide');
    act('Open and activate another tab');
    const other = await driver.session('POST', '/window/new', { type: 'tab' });
    await driver.session('POST', '/window', { handle: other.handle });
    await driver.navigate('about:blank');
    const hiddenAt = performance.now();
    // No WebDriver calls, popup, extension messages or background reads here.
    await sleep(90000);
    scenario.hiddenMs = performance.now() - hiddenAt;
    const hidden = await sample(driver, scenario, 'after-90s-hidden');
    check('hidden for >=90s', scenario.hiddenMs >= 90000);
    const advancing = (before, after, min) =>
      after.timeOrigin === before.timeOrigin &&
      after.audio.some(
        (a, i) =>
          !a.paused &&
          !a.ended &&
          a.currentTime - (before.audio[i]?.currentTime ?? Infinity) >= min,
      );
    const stopped = (s) =>
      s.backgroundState === 'running' && s.audio.every((a) => a.paused || a.ended);
    check(
      'tab switch policy',
      stopPlaybackOnTabChange ? stopped(hidden) : advancing(baseline, hidden, 85),
    );
    for (const action of ['navigate', 'reload']) {
      // Each stop-policy trigger must begin with actual playing audio.
      if (
        stopPlaybackOnTabChange ||
        !scenario.samples.at(-1).audio.some((a) => !a.paused && !a.ended)
      ) {
        act('Restart playback for an independent leave-page trigger');
        await start();
      } else await driver.session('POST', '/window', { handle: source });
      if (action === 'reload' && !stopPlaybackOnTabChange) {
        act('Return source to fixture before testing a content-script reload');
        await driver.navigate(`${fixture.origin}/article`);
        await waitFor('content injection before reload', () =>
          driver.execute("return !!document.getElementById('proso-content-styles');"),
        );
      }
      const before = await sample(driver, scenario, `before-${action}`);
      act(action === 'navigate' ? 'Navigate source to about:blank' : 'Reload source tab');
      if (action === 'navigate') await driver.navigate('about:blank');
      else await driver.session('POST', '/refresh', {});
      await sleep(3000);
      const first = await sample(driver, scenario, `after-${action}-3s`);
      await sleep(7000);
      const after = await sample(driver, scenario, `after-${action}-10s`);
      check(
        `${action} policy`,
        stopPlaybackOnTabChange ? stopped(first) && stopped(after) : advancing(before, after, 8),
      );
    }
    check(
      'fixture synthesized page text',
      fixture.requests.some((r) => typeof r.body?.text === 'string' && r.body.text.length > 0),
    );
    scenario.verdict = scenario.checks.every((c) => c.ok) ? 'PASS' : 'FAIL';
  } catch (error) {
    scenario.error = error.stack;
    scenario.verdict = 'BLOCKED';
  } finally {
    if (fixture) scenario.requests = fixture.requests;
    if (driver) {
      writeFileSync(
        path.join(output, `${stopPlaybackOnTabChange ? 'disabled' : 'enabled'}-process.log`),
        driver.getProcessLogs(),
      );
      await driver.quit();
    }
    if (fixture) await fixture.close();
    save();
  }
}
if (mode !== 'disabled') await run(false);
if (mode !== 'enabled') await run(true);
receipt.finishedAt = stamp();
receipt.verdict = receipt.scenarios.some((s) => s.verdict === 'BLOCKED')
  ? 'BLOCKED'
  : receipt.scenarios.every((s) => s.verdict === 'PASS')
    ? 'PASS'
    : 'FAIL';
save();
console.log(`${receipt.verdict}: ${output}/receipt.json`);
process.exitCode = receipt.verdict === 'PASS' ? 0 : receipt.verdict === 'BLOCKED' ? 2 : 1;
