import assert from 'node:assert/strict';
import { resolveFirefox } from './firefox-popup.mjs';
import { launch } from './webdriver.mjs';

// Real geckodriver contract: privilege is opt-in at the process boundary,
// never a Firefox capability argument. Each case uses a disposable profile.
for (const flag of [null, '-remote-allow-system-access', '--remote-allow-system-access']) {
  const driver = await launch({
    binary: resolveFirefox(),
    extraArgs: flag ? [flag] : [],
  });
  try {
    assert.equal(await driver.execute('return 2 + 2;'), 4);
    const enterChrome = () => driver.session('POST', '/moz/context', { context: 'chrome' });
    if (flag) {
      await enterChrome();
      assert.equal(await driver.execute('return typeof Services.appinfo.version;'), 'string');
    } else {
      await assert.rejects(enterChrome, /system access|allow-system-access/i);
    }
    console.log(`PASS webdriver privilege ${flag ?? 'not requested'}`);
  } finally {
    await driver.quit();
  }
}
