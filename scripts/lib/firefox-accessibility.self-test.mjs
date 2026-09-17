import assert from 'node:assert/strict';
import {
  actAccessible,
  findAccessible,
  pressKey,
  readAccessibility,
} from './firefox-accessibility.mjs';
import { chromeEval, resolveFirefox } from './firefox-popup.mjs';
import { launch, waitFor } from './webdriver.mjs';

const driver = await launch({
  binary: resolveFirefox(),
  extraArgs: ['-remote-allow-system-access'],
});
try {
  const html = `<div id="host"></div><output>0</output><script>
    const root = document.getElementById('host').attachShadow({mode:'closed'});
    root.innerHTML = '<button aria-label="Public voice">Choose</button><button hidden aria-label="Hidden voice">Hidden</button>';
    root.querySelector('button').onclick = () => document.querySelector('output').textContent++;
  </script>`;
  await driver.navigate(`data:text/html,${encodeURIComponent(html)}`);
  assert.equal(await driver.execute("return document.getElementById('host').shadowRoot;"), null);
  await findAccessible(driver, 'pushbutton', 'Public voice');
  assert.equal(
    (await readAccessibility(driver)).some((e) => e.name === 'Hidden voice' && e.visible),
    false,
  );
  await actAccessible(driver, 'pushbutton', 'Public voice');
  await waitFor(
    'accessibility action',
    async () =>
      await driver.execute("return document.querySelector('output').textContent === '1';"),
  );
  // The accessibility client must survive between calls, including Gecko GC.
  await chromeEval(driver, 'Cu.forceGC(); return true;');
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await actAccessible(driver, 'pushbutton', 'Public voice', 'focus');
  await pressKey(driver, '\uE007'); // Enter: native keyboard, not a synthetic click
  await waitFor(
    'native keyboard action',
    async () =>
      await driver.execute("return document.querySelector('output').textContent === '2';"),
  );
  console.log(
    'PASS closed-root public role/name activation, native Enter and hidden-control rejection',
  );
} finally {
  await driver.quit();
}
