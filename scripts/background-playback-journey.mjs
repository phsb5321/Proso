/** Feature 256 runtime diagnostic. Reuses the retained raw Firefox harness.
 * Public popup Play starts audio. Weak Audio references observe native media
 * without timers, ports, messages or a popup open during the idle interval.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  JOURNEY_PREFS,
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

const seed = Number(process.env.FC_SEED ?? 20260920);
const mode = process.env.BACKGROUND_MODE ?? 'both';
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
let binary;
const receipt = {
  seed,
  clock: 'real wall clock; monotonic performance.now() for waits',
  startedAt: stamp(),
  scriptSha256: sha(readFileSync(new URL(import.meta.url))),
  scenarios: [],
  verdict: 'BLOCKED',
  limitations: [
    'extensions.webextensions.remote=false permits the existing public popup actor and observer.',
    'Setup wraps native Audio with a forwarding Proxy, WeakRefs and passive media event records.',
    'No observer calls during the 90-second window; passive page/media events, no keepalive or idle timeout overrides.',
    'Local managed synthesis stub returns a deterministic non-silent 35-second PCM tone per paragraph; no provider.',
    'This bounded runtime diagnostic is not the full Feature 095 acceptance matrix.',
  ],
};
const save = () =>
  writeFileSync(path.join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);

// Same genuine PCM/WAV shape as the local-host fixtures. Non-zero samples
// avoid using a silent clip to answer a question about audible media lifetime.
const audio = Buffer.alloc(44 + 16000 * 2 * 35);
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

// These predicates are exported for adversarial evidence plants, without launching Firefox.
export const liveAudio = (a) =>
  !a.paused &&
  !a.ended &&
  a.error === null &&
  a.readyState >= 2 &&
  a.currentTime > 0.1 &&
  Number.isFinite(a.duration) &&
  a.duration - a.currentTime >= 15;

const sameObserver = (before, after) =>
  before.observerPresent === true &&
  after.observerPresent === true &&
  Number.isFinite(before.timeOrigin) &&
  after.timeOrigin === before.timeOrigin &&
  after.backgroundState === 'running';

export function stopped(before, after, triggerAt) {
  const live = before.audio.filter(liveAudio);
  const events = after.audioEvents.filter((e) => e.at >= triggerAt);
  return (
    sameObserver(before, after) &&
    live.length > 0 &&
    after.audio.length > 0 &&
    after.audio.every((a) => a.paused && !a.ended) &&
    live.every((a) => {
      // Clearing src cancels Firefox's queued pause event; emptied is the
      // native source-release evidence in that path, still requiring paused audio.
      const paused = events.find(
        (e) =>
          e.id === a.id &&
          e.paused &&
          (e.type === 'pause' || (e.type === 'emptied' && e.srcAttribute === '')),
      );
      const retained = after.audio.find((next) => next.id === a.id);
      return (
        retained?.paused === true &&
        retained.srcAttribute === '' &&
        paused &&
        paused.at - triggerAt <= 3000 &&
        !paused.ended &&
        paused.currentTime < a.duration - 1 &&
        !events.some(
          (e) =>
            e.id === a.id &&
            (e.type === 'playing' ||
              e.type === 'ended' ||
              (e.type === 'error' && e.srcAttribute !== '')),
        )
      );
    })
  );
}

export function advancing(before, after, min) {
  return (
    sameObserver(before, after) &&
    after.audio.some((a) => {
      const previous = before.audio.find((p) => p.id === a.id);
      if (!previous || a.paused || a.ended || a.error !== null) return false;
      const ended = after.audioEvents
        .slice(before.audioEvents.length)
        .filter((e) => e.id === a.id && e.type === 'ended' && e.ended && e.duration > 0);
      return (
        a.currentTime + ended.reduce((sum, e) => sum + e.duration, 0) - previous.currentTime >= min
      );
    })
  );
}

export function hiddenThroughout(evidence, start, end) {
  if (!evidence || end - start < 90000) return false;
  const prior = evidence.visibility.filter((e) => e.at <= start).at(-1);
  return (
    prior?.state === 'hidden' &&
    evidence.visibility
      .filter((e) => e.at >= start && e.at <= end)
      .every((e) => e.state === 'hidden') &&
    !evidence.pagehide.some((at) => at >= start && at <= end)
  );
}

export function crossedParagraph(before, after, evidence, start, end) {
  const events = after.audioEvents.slice(before.audioEvents.length);
  const ended = events.find(
    (e) =>
      e.type === 'ended' &&
      e.ended &&
      e.duration > 0 &&
      e.currentTime >= e.duration - 0.1 &&
      e.at >= start &&
      e.at <= end,
  );
  const initial = evidence?.paragraphs.filter((e) => e.at <= start).at(-1);
  return (
    !!ended &&
    !!initial?.text &&
    initial.index >= 0 &&
    events.some(
      (e) =>
        e.type === 'playing' &&
        e.id === ended.id &&
        e.src !== ended.src &&
        e.at >= ended.at &&
        e.at <= end,
    ) &&
    evidence.paragraphs.some(
      (e) =>
        e.at >= ended.at &&
        e.at <= end &&
        e.index > initial.index &&
        e.text &&
        e.text !== initial.text,
    )
  );
}

async function prepare() {
  assert.ok(['both', 'enabled', 'disabled'].includes(mode), 'Invalid BACKGROUND_MODE');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const inputs = [
    'packages/extension',
    'packages/shared',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.npmrc',
    'tsconfig.json',
    'tsconfig.base.json',
  ];
  const cleanInputs = () =>
    assert.equal(
      git('status', '--porcelain', '--untracked-files=all', '--', ...inputs),
      '',
      'Build inputs must match HEAD; commit product changes before running the journey',
    );
  receipt.head = git('rev-parse', 'HEAD');
  receipt.sourceTree = git('rev-parse', 'HEAD^{tree}');
  receipt.workingTreeStatus = git('status', '--porcelain');
  receipt.harnessHashes = Object.fromEntries(
    [
      'scripts/background-playback-journey.mjs',
      'scripts/lib/webdriver.mjs',
      'scripts/lib/firefox-popup.mjs',
      'scripts/lib/reading-fixture-server.mjs',
    ].map((file) => [file, sha(readFileSync(file))]),
  );
  cleanInputs();
  receipt.buildStartedAt = stamp();
  save();
  // Never install output discovered from an earlier checkout/build.
  rmSync(build, { recursive: true, force: true });
  receipt.buildCommand = 'pnpm --filter @proso/extension build:firefox';
  execFileSync('pnpm', ['--filter', '@proso/extension', 'build:firefox'], {
    stdio: 'inherit',
    timeout: 300000,
    env: { ...process.env, PROSO_LISTED: '0' },
  });
  cleanInputs();
  assert.equal(git('rev-parse', 'HEAD'), receipt.head, 'HEAD changed during build');
  receipt.builtCommit = receipt.head;
  receipt.buildFinishedAt = stamp();
  const files = readdirSync(build, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(build, path.join(e.parentPath, e.name)))
    .sort();
  const hashes = Object.fromEntries(
    files.map((file) => [file, sha(readFileSync(path.join(build, file)))]),
  );
  receipt.buildFiles = hashes;
  receipt.buildTreeSha256 = sha(
    Object.entries(hashes)
      .map(([f, h]) => `${f}\0${h}\n`)
      .join(''),
  );
  receipt.manifest = JSON.parse(readFileSync(path.join(build, 'manifest.json')));
  binary = resolveFirefox();
  receipt.firefox = execFileSync(binary, ['--version'], {
    encoding: 'utf8',
    timeout: 10000,
  }).trim();
  receipt.geckodriver = execFileSync('geckodriver', ['--version'], {
    encoding: 'utf8',
    timeout: 10000,
  }).split('\n')[0];
  receipt.command = `FC_SEED=${seed} BACKGROUND_MODE=${mode} FIREFOX_BIN=${binary} BACKGROUND_ARTIFACT_DIR=${output} make background-playback-journey`;
  save();
}

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
      observerPresent: !!bg?.__prosoAudioProbe && !!bg?.__prosoAudioEvents,
      audioEvents: bg?.__prosoAudioEvents ? JSON.parse(JSON.stringify(bg.__prosoAudioEvents)) : [],
      audio: Array.from(bg?.__prosoAudioProbe ?? [], (ref, id) => ({a:Cu.waiveXrays(ref).deref(),id})).filter(v => v.a).map(({a,id}) => ({
        id, srcAttribute: a.getAttribute('src'),
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
    phases: [],
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
      Cu.evalInSandbox("window.__prosoAudioProbe = []; window.__prosoAudioEvents = []; window.Audio = new Proxy(window.Audio, { construct(target, args, newTarget) { const a = Reflect.construct(target, args, newTarget); const id = window.__prosoAudioProbe.push(new WeakRef(a)) - 1; for (const type of ['playing','pause','ended','error','emptied']) a.addEventListener(type, () => window.__prosoAudioEvents.push({ id, type, at:Date.now(), currentTime:a.currentTime, duration:Number.isFinite(a.duration)?a.duration:null, ended:a.ended, paused:a.paused, src:a.currentSrc, srcAttribute:a.getAttribute('src'), error:a.error?.code??null })); return a; } });", Cu.Sandbox(bg, {sandboxPrototype:bg, wantXrays:false}));
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
    const clickControl = async (name) => {
      await ensurePopupOpen(driver, openPopup);
      await waitFor(`visible popup control: ${name}`, async () =>
        (await readPopup(driver)).names?.includes(name),
      );
      await clickByName(driver, name, openPopup);
    };
    const dismiss = async () =>
      chromeEval(
        driver,
        `const w=Services.wm.getMostRecentWindow('navigator:browser');
      for (const panel of w.document.querySelectorAll('panel')) if (panel.state === 'open') panel.hidePopup(); return true;`,
      );
    const start = async () => {
      await driver.session('POST', '/window', { handle: source });
      // A paused session also owns the popup; clear it before asking for Play.
      if (scenario.samples.at(-1)?.audio.some((a) => a.srcAttribute)) {
        act('Public popup Stop before an independent phase');
        await clickControl('Stop playback');
        await dismiss();
        await waitFor('previous session stopped before independent phase', async () => {
          const state = await sample(driver, scenario, 'phase-reset');
          return (
            state.observerPresent &&
            state.audio.length > 0 &&
            state.audio.every((a) => a.paused && a.srcAttribute === '')
          );
        });
      }
      await driver.navigate(`${fixture.origin}/article`);
      await waitFor('content injection', () =>
        driver.execute("return !!document.getElementById('proso-content-styles');"),
      );
      act('Unified Extensions → Proso → Play');
      await clickControl('Play');
      await dismiss();
      let previous;
      await waitFor('native audio advancing', async () => {
        const s = await sample(driver, scenario, 'start-probe');
        const advancingNow =
          s.observerPresent &&
          s.audio.some(
            (a) =>
              liveAudio(a) &&
              previous?.audio.some(
                (p) => p.id === a.id && p.src === a.src && a.currentTime - p.currentTime >= 0.1,
              ),
          );
        previous = s;
        return advancingNow;
      });
    };
    await start();
    const baseline = await sample(driver, scenario, 'before-hide');
    // Page-only passive observers survive the quiet gap without waking the extension.
    await driver.execute(`
      const evidence = window.__prosoJourneyEvidence = {visibility:[], paragraphs:[], pagehide:[]};
      const visibility = () => evidence.visibility.push({at:Date.now(), state:document.visibilityState});
      const paragraph = () => {
        const el = document.querySelector('.proso-highlight');
        const text = el?.textContent?.replace(/\\s+/g, ' ').trim() ?? '';
        const index = Array.from(document.querySelectorAll('article h1, article p, article li')).indexOf(el);
        if (evidence.paragraphs.at(-1)?.text !== text)
          evidence.paragraphs.push({at:Date.now(),text,index});
      };
      visibility(); paragraph();
      document.addEventListener('visibilitychange', visibility);
      window.addEventListener('pagehide', () => evidence.pagehide.push(Date.now()));
      const observer = new MutationObserver(paragraph);
      observer.observe(document.body, {subtree:true,childList:true,attributes:true,attributeFilter:['class']});
      return true;
    `);
    act('Open and activate another tab');
    const hideTriggerAt = Date.now();
    const other = await driver.session('POST', '/window/new', { type: 'tab' });
    await driver.session('POST', '/window', { handle: other.handle });
    await driver.navigate('about:blank');
    const hiddenStart = await sample(driver, scenario, 'hidden-window-start');
    const hiddenAt = performance.now();
    const windowStart = Date.now();
    // No WebDriver calls, popup, extension messages or background reads here.
    await sleep(90000);
    scenario.hiddenMs = performance.now() - hiddenAt;
    const windowEnd = Date.now();
    const hidden = await sample(driver, scenario, 'after-90s-hidden');
    await driver.session('POST', '/window', { handle: source });
    const pageEvidence = await driver.execute('return window.__prosoJourneyEvidence ?? null;');
    scenario.phases.push({
      name: 'hidden',
      hidden: true,
      navigated: false,
      reloaded: false,
      windowStart,
      windowEnd,
      pageEvidence,
      verification: 'visibilitychange/pagehide history and selected-tab snapshots',
    });
    check(
      'source hidden throughout >=90s',
      scenario.hiddenMs >= 90000 &&
        hiddenThroughout(pageEvidence, windowStart, windowEnd) &&
        [hiddenStart, hidden].every(
          (s) =>
            s.tabs.some((t) => t.url === `${fixture.origin}/article` && !t.selected && !t.active) &&
            s.selectedUrl === 'about:blank',
        ),
    );
    check('live audio before tab switch', baseline.audio.some(liveAudio));
    check(
      'tab switch policy',
      stopPlaybackOnTabChange
        ? stopped(baseline, hidden, hideTriggerAt)
        : advancing(baseline, hidden, 85),
    );
    if (!stopPlaybackOnTabChange) {
      check(
        'paragraph boundary continued while hidden',
        crossedParagraph(baseline, hidden, pageEvidence, windowStart, windowEnd),
      );
    }
    for (const action of ['navigate', 'reload']) {
      act('Restart playback for an independent leave-page trigger');
      await start();
      const before = await sample(driver, scenario, `before-${action}`);
      const documentBefore = await driver.execute(
        'return {url:location.href, timeOrigin:performance.timeOrigin, visibility:document.visibilityState};',
      );
      check(`live audio before ${action}`, before.audio.some(liveAudio));
      act(action === 'navigate' ? 'Navigate source to about:blank' : 'Reload source tab');
      const triggerAt = Date.now();
      if (action === 'navigate') await driver.navigate('about:blank');
      else await driver.session('POST', '/refresh', {});
      const documentAfter = await driver.execute(
        'return {url:location.href, timeOrigin:performance.timeOrigin, visibility:document.visibilityState};',
      );
      scenario.phases.push({
        name: action,
        hidden: false,
        navigated: action === 'navigate',
        reloaded: action === 'reload',
        triggerAt,
        documentBefore,
        documentAfter,
        verification: 'source handle, URL, document timeOrigin and visibility',
      });
      check(
        `${action} condition verified`,
        documentBefore.url === `${fixture.origin}/article` &&
          documentBefore.visibility === 'visible' &&
          documentAfter.visibility === 'visible' &&
          documentAfter.timeOrigin !== documentBefore.timeOrigin &&
          documentAfter.url === (action === 'navigate' ? 'about:blank' : documentBefore.url),
      );
      await sleep(3000);
      const first = await sample(driver, scenario, `after-${action}-3s`);
      await sleep(7000);
      const after = await sample(driver, scenario, `after-${action}-10s`);
      check(
        `${action} policy`,
        stopPlaybackOnTabChange
          ? stopped(before, first, triggerAt) && stopped(before, after, triggerAt)
          : advancing(before, after, 8),
      );
    }
    check(
      'fixture synthesized page text',
      fixture.requests.some((r) => typeof r.body?.text === 'string' && r.body.text.length > 0),
    );
    scenario.verdict = scenario.checks.every((c) => c.ok) ? 'PASS' : 'FAIL';
  } catch (error) {
    scenario.error = error.stack;
    scenario.verdict = error instanceof assert.AssertionError ? 'FAIL' : 'BLOCKED';
  } finally {
    // Teardown happens before fallible evidence writes, including process logs.
    try {
      if (driver) await driver.quit();
    } finally {
      try {
        if (fixture) await fixture.close();
      } finally {
        if (fixture) scenario.requests = fixture.requests;
        try {
          if (driver)
            writeFileSync(
              path.join(output, `${stopPlaybackOnTabChange ? 'disabled' : 'enabled'}-process.log`),
              driver.getProcessLogs(),
            );
        } finally {
          save();
        }
      }
    }
  }
}
async function main() {
  mkdirSync(output, { recursive: true });
  save();
  try {
    await prepare();
    if (mode !== 'disabled') await run(false);
    if (mode !== 'enabled') await run(true);
    receipt.verdict = receipt.scenarios.some((s) => s.verdict === 'BLOCKED')
      ? 'BLOCKED'
      : receipt.scenarios.length > 0 && receipt.scenarios.every((s) => s.verdict === 'PASS')
        ? 'PASS'
        : 'FAIL';
  } catch (error) {
    receipt.error = error.stack;
    receipt.verdict = 'BLOCKED';
  } finally {
    receipt.finishedAt = stamp();
    save();
  }
  console.log(`${receipt.verdict}: ${output}/receipt.json`);
  process.exitCode = receipt.verdict === 'PASS' ? 0 : receipt.verdict === 'BLOCKED' ? 2 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await main();
