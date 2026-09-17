import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  actAccessible,
  findAccessible,
  pressKey,
  readAccessibility,
} from './firefox-accessibility.mjs';
import { Blocked, READ_PAGE, chromeEval } from './firefox-popup.mjs';
import { sleep, waitFor } from './webdriver.mjs';

export const FOOTER_VOICES = ['River', 'Atlas', 'Retry'].map((id) => ({
  id,
  language: 'en-US',
  mediaTypes: ['audio/wav'],
  markKinds: [],
}));

/** The caller completed public host setup and Play; all actions here use the
 * browser accessibility API or WebDriver keys, never the closed shadow DOM.
 */
export async function runFooterControlsJourney(driver, fixture, artifactDir, record, act) {
  mkdirSync(artifactDir, { recursive: true });
  const snapshots = [];
  const actions = [];
  const plant = process.env.FOOTER_CONTROLS_PLANT ?? '';
  assert.ok(['', 'voice', 'retry'].includes(plant), 'unknown footer plant');
  const startedAt = new Date().toISOString();
  let verdict = 'FAIL';
  let failure = null;
  const screenshot = async (name) => {
    const image = await driver.session('GET', '/screenshot');
    writeFileSync(path.join(artifactDir, `${name}.png`), Buffer.from(image, 'base64'));
  };
  const tree = async () => {
    const entries = await readAccessibility(driver);
    snapshots.push({ at: new Date().toISOString(), entries });
    return entries;
  };
  const activate = async (role, name, keyboard = false) => {
    await actAccessible(driver, role, name, 'focus');
    await waitFor(`focus on ${name}`, async () =>
      (await tree()).some((e) => e.role === role && e.name === name && e.focused),
    );
    if (keyboard) await pressKey(driver, '\uE007');
    else await actAccessible(driver, role, name, 'activate');
    const via = keyboard
      ? `accessible ${role} focus + native Enter`
      : `accessible ${role} activation`;
    actions.push({ name, role, via, at: new Date().toISOString() });
    act(name, via);
  };
  const state = async (name) => {
    await waitFor(`footer announces ${name}`, async () =>
      (await tree()).some((e) => e.role === 'toggle button' && e.name === name && e.visible),
    );
  };
  const openVoices = async () => {
    const voice = (await tree()).find(
      (e) => e.role === 'pushbutton' && e.visible && e.name?.startsWith('Voice: '),
    );
    assert.ok(voice, 'footer exposes its Voice button');
    await activate('pushbutton', voice.name);
    await findAccessible(driver, 'listbox option', 'River');
  };
  try {
    await state('Pause');
    await activate('toggle button', 'Pause');
    await state('Play');
    record('footer Pause holds a publicly resumable state');
    // Slow the short fixture clip through the same public control a reader
    // uses, leaving a measurable window for the native accessibility cache.
    await activate('pushbutton', 'Playback speed 1x');
    await activate('listbox option', '0.5x');
    await findAccessible(driver, 'pushbutton', 'Playback speed 0.5x');
    await openVoices();
    await pressKey(driver, '\uE00C'); // Escape
    act('Escape', 'native keyboard');
    await waitFor(
      'Escape closes the voice menu',
      async () =>
        !(await tree()).some((e) => e.role === 'listbox option' && e.name === 'River' && e.visible),
    );
    record('footer Escape closes the voice list');
    await activate('toggle button', 'Play');
    await state('Pause');

    // Start with River so the next choice is tested while actually playing.
    for (const [voice, keyboard] of [
      ['River', false],
      ['Atlas', true],
    ]) {
      await openVoices();
      const before = await driver.execute(`return (() => {${READ_PAGE}})();`);
      const requestsBefore = fixture.localRequests.length;
      if (plant !== 'voice' || voice !== 'Atlas') {
        await activate('listbox option', voice, keyboard);
      }
      const request = await waitFor(`synthesis uses selected voice ${voice}`, async () =>
        fixture.localRequests.slice(requestsBefore).find((r) => r.body.voice === voice),
      );
      assert.ok(
        before.highlighted.some((text) => text.includes(request.body.input)),
        `${voice} re-reads the current paragraph, not another one`,
      );
      await waitFor(
        `${voice} audio response and visible current-sentence restart`,
        async () => {
          if (!request.respondedAt) return null;
          const page = await driver.execute(`return (() => {${READ_PAGE}})();`);
          return (
            page.activeWord === request.body.input.split(/\s+/)[0] &&
            page.highlighted.some((text) => text.includes(request.body.input))
          );
        },
        { timeoutMs: 20000, intervalMs: 100 },
      );
      await state('Pause');
      const voiceButton = await findAccessible(driver, 'pushbutton', `Voice: ${voice}`);
      const playButton = await findAccessible(driver, 'toggle button', 'Pause');
      assert.ok(
        voiceButton.bounds.width >= playButton.bounds.width * 1.5,
        'voice label has room beside its icon, rather than inheriting the circular icon-button width',
      );
      record('footer voice choice reaches current-paragraph synthesis and playback', voice);
    }

    await openVoices();
    const beforeFailure = fixture.localRequests.length;
    await activate('listbox option', 'Retry');
    const failed = await waitFor('predetermined synthesis failure', async () =>
      fixture.localRequests
        .slice(beforeFailure)
        .find((r) => r.body.voice === 'Retry' && r.status === 422),
    );
    await state('Play');
    assert.ok(
      (await tree()).some((e) => e.visible && e.name?.includes('Fixture synthesis failed')),
      'synthesis failure has visible actionable feedback',
    );
    record('synthesis failure exposes an actionable error and Play');
    await screenshot('retry-error');
    const retryStart = fixture.localRequests.length;
    if (plant !== 'retry') await activate('toggle button', 'Play');
    // Chunk requests run concurrently: sentence two can reach the fixture
    // before the retried sentence. Match identity, not HTTP arrival order.
    const recovered = await waitFor(
      'Play retries the failed voice/paragraph',
      async () =>
        fixture.localRequests
          .slice(retryStart)
          .find(
            (r) =>
              r.body.voice === 'Retry' &&
              r.body.input === failed.body.input &&
              r.respondedAt &&
              r.status !== 422,
          ),
      { timeoutMs: 20000 },
    );
    assert.equal(recovered.body.input, failed.body.input, 'Play retries the same text');
    await waitFor(
      'recovered audio restarts the failed sentence visibly',
      async () => {
        const page = await driver.execute(`return (() => {${READ_PAGE}})();`);
        return (
          page.activeWord === recovered.body.input.split(/\s+/)[0] &&
          page.highlighted.some((text) => text.includes(recovered.body.input))
        );
      },
      { timeoutMs: 5000, intervalMs: 100 },
    );
    await state('Pause');
    record('footer Play recovers the failed paragraph without settings or reload');
    await screenshot('retry-recovered');
    assert.equal(fixture.requests.length, 0, 'footer never falls back to managed synthesis');
    await activate('pushbutton', 'Close player');
    await waitFor('Close clears player and highlights', async () => {
      const page = await driver.execute(`return (() => {${READ_PAGE}})();`);
      return page.footerCount === 0 && page.highlighted.length === 0;
    });
    const count = fixture.localRequests.length;
    await sleep(1500);
    assert.equal(fixture.localRequests.length, count, 'Close starts no more synthesis');
    record('footer Close clears the page and stops requesting audio');
    verdict = 'PASS';
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    if (error instanceof Blocked) verdict = 'BLOCKED';
    throw error;
  } finally {
    await tree().catch(() => {});
    await screenshot('footer').catch(() => {});
    writeFileSync(path.join(artifactDir, 'process.log'), driver.getProcessLogs());
    const build = path.resolve('packages/extension/.output/firefox-mv2');
    const hashes = Object.fromEntries(
      ['manifest.json', 'background.js', 'content-scripts/content.js'].map((file) => [
        file,
        createHash('sha256')
          .update(readFileSync(path.join(build, file)))
          .digest('hex'),
      ]),
    );
    writeFileSync(
      path.join(artifactDir, 'footer-receipt.json'),
      JSON.stringify(
        {
          verdict,
          failure,
          head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
          hashes,
          startedAt,
          finishedAt: new Date().toISOString(),
          snapshots,
          actions,
          plant,
          exitCode: verdict === 'PASS' ? 0 : verdict === 'BLOCKED' ? 2 : 1,
          dirty: Boolean(
            execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
          ),
          browserVersion: await chromeEval(driver, 'return Services.appinfo.version;').catch(
            () => null,
          ),
          driverVersion: execFileSync('geckodriver', ['--version'], { encoding: 'utf8' }).split(
            '\n',
          )[0],
          profile: { isolated: true, sessionId: driver.sessionId },
          fixtureOrigin: fixture.origin,
          requests: fixture.localRequests,
          managedRequests: fixture.requests,
          replay: `READER_CONTROLS=1 FOOTER_CONTROLS_PLANT=${plant} node scripts/local-host-journey-gate.mjs`,
          deterministic: true,
          seed: null,
          runCount: 1,
          actor: 'Firefox platform accessibility role/name actions and WebDriver keys',
          internalDispatch: false,
          fullFeature095: false,
        },
        null,
        2,
      ) + '\n',
    );
  }
}
