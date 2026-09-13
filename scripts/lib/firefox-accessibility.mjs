/** Public Firefox accessibility controls, including closed-shadow content.
 * No shadow DOM query or extension message is used by this actor.
 */
import { blocked, chromeEval } from './firefox-popup.mjs';
import { waitFor } from './webdriver.mjs';

async function accessible(driver, target = null, action = null) {
  return JSON.parse(
    await chromeEval(
      driver,
      `
    const [target, action] = arguments;
    const win = Services.wm.getMostRecentWindow('navigator:browser');
    // Keep the accessibility client alive between WebDriver calls. Otherwise
    // Gecko can shut it down after GC and lose a queued focus/action in flight.
    const service = win.prosoGateAccessibilityService ??= Cc['@mozilla.org/accessibilityService;1']
      .getService(Ci.nsIAccessibilityService);
    const root = service.getAccessibleFor(win.gBrowser.selectedBrowser);
    const entries = [], matches = [];
    function visit(node) {
      if (!node) return;
      if (entries.length >= 10000) throw new Error('Accessibility tree exceeds gate bound');
      const state = {}, extra = {};
      node.getState(state, extra);
      const flags = Ci.nsIAccessibleStates;
      const visible = !(state.value & (flags.STATE_INVISIBLE | flags.STATE_OFFSCREEN));
      const enabled = !(state.value & flags.STATE_UNAVAILABLE);
      const entry = { role: service.getStringRole(node.role), name: node.name,
        visible, enabled, focused: Boolean(state.value & flags.STATE_FOCUSED) };
      entries.push(entry);
      if (target && visible && entry.role === target.role && entry.name === target.name) {
        matches.push({node, entry});
      }
      for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
    }
    visit(root);
    if (!target) return JSON.stringify(entries);
    if (matches.length !== 1) return JSON.stringify({error: matches.length + ' visible matches'});
    const {node, entry} = matches[0];
    if (!entry.enabled) return JSON.stringify({error:'control disabled'});
    if (action === 'activate') {
      if (node.actionCount < 1) return JSON.stringify({error:'control has no accessibility action'});
      node.doAction(0);
    } else if (action === 'focus') node.takeFocus();
    return JSON.stringify(entry);
  `,
      [target, action],
    ),
  );
}

export const readAccessibility = (driver) => accessible(driver);

export async function findAccessible(driver, role, name) {
  const entry = await waitFor(`accessible ${role} "${name}"`, async () => {
    const result = await accessible(driver, { role, name });
    return result.error ? null : result;
  }).catch(() => null);
  if (!entry) blocked(`No unique visible enabled ${role} named "${name}"`);
  return entry;
}

export async function actAccessible(driver, role, name, action = 'activate') {
  await findAccessible(driver, role, name);
  const result = await accessible(driver, { role, name }, action);
  if (result.error) blocked(`Cannot ${action} ${role} "${name}": ${result.error}`);
  return result;
}

export async function pressKey(driver, value) {
  await driver.session('POST', '/actions', {
    actions: [
      {
        type: 'key',
        id: 'footer-keyboard',
        actions: [
          { type: 'keyDown', value },
          { type: 'keyUp', value },
        ],
      },
    ],
  });
}
