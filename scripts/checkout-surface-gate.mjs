/**
 * `make checkout-surface-gate` — acceptance harness for the purchase surface.
 *
 * The claim under test is narrow and mechanical: a visitor on the pricing page
 * can start a real Paddle checkout, and when the configuration that checkout
 * needs is absent the control says so instead of pretending to work. Then, on
 * the page Paddle redirects to, the purchase is exchanged for a licence key the
 * buyer can read and copy — against a secret that browser minted, never against
 * the transaction id Paddle publishes in the URL.
 *
 * The shipped `pricing.html`, `success.html`, `assets/js/checkout.js` and
 * `assets/js/success.js` are loaded from disk into jsdom and driven through
 * their public surface — a click on the button a person sees, a click on the
 * real billing toggle. Nothing is re-implemented here; a change to the site
 * that breaks the purchase path breaks this gate.
 *
 * What it does NOT prove: that Paddle's hosted overlay renders and takes a
 * card. That needs a Paddle client-side token and a verified Paddle account,
 * neither of which exists yet (`ssh dokku@… config:show proso-api` has no
 * PADDLE_API_KEY). The boundary this gate reaches is the exact call handed to
 * Paddle.js — arguments included. Everything beyond it is Paddle's code.
 *
 * Verdicts are three-valued and none of them is silence:
 *   PASS (0)    every assertion held.
 *   FAIL (1)    a surface existed and behaved wrongly.
 *   BLOCKED (2) jsdom or a site file was missing, so nothing ran.
 *
 * Plant mode proves the assertions can fail:
 *   node scripts/checkout-surface-gate.mjs --plants
 *
 * @module scripts/checkout-surface-gate
 */

import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const siteDir = path.join(repoRoot, 'packages', 'site');
const sharedCheckoutSchema = path.join(
  repoRoot,
  'packages',
  'shared',
  'src',
  'schemas',
  'checkout.ts',
);

class Blocked extends Error {}

/** Source rewrites that each break exactly one shipped behaviour. */
const PLANTS = {
  'always-enabled': {
    file: 'checkout.js',
    from: '      if (problem) setInert(button, problem);\n      else setReady(button);',
    to: '      setReady(button);',
    breaks: 'unset price id leaves the button inert',
  },
  'silent-inert': {
    file: 'checkout.js',
    from: '    const note = noteFor(button);\n    if (note) {\n      note.textContent = reason;\n      note.hidden = false;\n    }\n  }\n\n  function setReady',
    to: '    void reason;\n  }\n\n  function setReady',
    breaks: 'the inert button states its reason',
  },
  'no-open': {
    file: 'checkout.js',
    from: '        paddle.Checkout.open({',
    to: '        if (paddle) return;\n        paddle.Checkout.open({',
    breaks: 'the buy control invokes checkout',
  },
  'monthly-only': {
    file: 'checkout.js',
    from: "    return section && section.getAttribute('data-billing') === 'annual' ? 'yearly' : 'monthly';",
    to: "    void section;\n    return 'monthly';",
    breaks: 'the annual toggle selects the annual price',
  },
  'blank-key': {
    file: 'success.js',
    from: '    if (field) field.textContent = result.licenseKey;',
    to: '    void field;',
    breaks: 'the issued key is rendered as text',
  },
  'no-poll': {
    file: 'success.js',
    from: "      if (result.status === 'issued') {",
    to: "      if (result.status === 'pending') return;\n      if (result.status === 'issued') {",
    breaks: 'a pending answer is retried until the key exists',
  },
  'claim-not-required': {
    file: 'success.js',
    from: '    const secret = claimSecret();\n    if (!secret) {',
    to: '    const secret = claimSecret();\n    if (secret === null) {',
    breaks: 'the transaction id alone buys nothing',
  },
  'raw-secret-to-paddle': {
    file: 'checkout.js',
    from: '        customData[CLAIM_HASH_FIELD] = results[1];',
    to: '        customData[CLAIM_HASH_FIELD] = window.sessionStorage.getItem(CLAIM_STORAGE_KEY);',
    breaks: 'only the digest of the claim secret leaves the browser',
  },
};

// ── harness ──────────────────────────────────────────────────────────

function readSite(relative, plant) {
  const file = path.join(siteDir, relative);
  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    throw new Blocked(`site file missing: packages/site/${relative}`);
  }
  if (plant && PLANTS[plant].file === path.basename(relative)) {
    const { from, to } = PLANTS[plant];
    if (!source.includes(from)) {
      throw new Blocked(`plant "${plant}" no longer matches ${relative} — rewrite the plant`);
    }
    source = source.replace(from, to);
  }
  return source;
}

async function loadJsdom() {
  try {
    return (await import('jsdom')).JSDOM;
  } catch {
    throw new Blocked('jsdom is not installed — run `pnpm install --frozen-lockfile`');
  }
}

/**
 * Build a page the way a browser does: markup first, then the deferred
 * scripts, in document order, followed by DOMContentLoaded.
 */
async function openPage(JSDOM, { html, url, config, scripts, plant, beforeScripts }) {
  const dom = new JSDOM(readSite(html), { url, runScripts: 'outside-only' });
  const { window } = dom;

  // jsdom ships getRandomValues but no SubtleCrypto. Node's Web Crypto is the
  // same specification the browser implements, so the claim secret and its
  // digest are produced by a real implementation, not a stub.
  Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });

  // jsdom 20 exposes no TextEncoder on the window, though every browser that
  // implements crypto.subtle also implements it. Filling the gap keeps the
  // harness's limitation from reading as a site defect.
  window.TextEncoder = TextEncoder;

  // jsdom implements no media queries; the site's progressive-enhancement JS
  // asks for prefers-reduced-motion. Answering "no preference" is the browser
  // default and keeps the gap from masquerading as a site defect.
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  });

  window.PROSO_CHECKOUT_CONFIG =
    config === undefined ? undefined : window.eval(`(${JSON.stringify(config)})`);
  if (beforeScripts) beforeScripts(window);

  // Deferred scripts run after parsing and before DOMContentLoaded, and each
  // site script initialises on that event. Waiting for jsdom's own event rather
  // than dispatching a synthetic one matters: a synthetic dispatch initialises
  // every listener twice, which doubles click handlers and hides real defects
  // behind duplicated work.
  const domReady = new Promise((resolve) => {
    if (window.document.readyState !== 'loading') resolve();
    else window.document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });

  for (const script of scripts) {
    window.eval(readSite(path.join('assets', 'js', script), plant));
  }

  await domReady;
  await tick(window);
  return window;
}

function tick(window, times = 3) {
  return new Promise((resolve) => {
    let left = times;
    const step = () => (left-- > 0 ? window.setTimeout(step, 0) : resolve());
    step();
  });
}

function installPaddle(window) {
  const opened = [];
  const initialised = [];
  window.Paddle = {
    Environment: { set: (env) => initialised.push({ environment: env }) },
    Initialize: (options) => initialised.push(options),
    Checkout: { open: (options) => opened.push(options) },
  };
  return { opened, initialised };
}

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ── fixtures ─────────────────────────────────────────────────────────

const PRICING_SCRIPTS = ['main.js', 'checkout.js'];
const PRICING_URL = 'https://proso.com.br/pricing.html';
const SUCCESS_URL = 'https://proso.com.br/success.html';

// Declared in @proso/shared/schemas/checkout.ts; asserted against it below.
const CLAIM_STORAGE_KEY = 'proso.license-claim-secret';

// Fixtures, derived rather than pasted so nothing in this file reads as a
// credential to a secret scanner — and so a real one can never hide among them.
const CLAIM_SECRET = Buffer.from('proso-149-gate-fixture-claim-32b').toString('base64url');
const fakeClientToken = (environment) =>
  `${environment === 'sandbox' ? 'test' : 'live'}_${'0'.repeat(23)}`;

const configured = {
  environment: 'sandbox',
  clientToken: fakeClientToken('sandbox'),
  apiBaseUrl: 'https://api.proso.com.br',
  prices: {
    pro: { monthly: 'pri_basic_monthly', yearly: 'pri_basic_yearly' },
    enterprise: { monthly: 'pri_pro_monthly', yearly: 'pri_pro_yearly' },
  },
};

const unconfigured = JSON.parse(JSON.stringify(configured));
unconfigured.prices.pro = { monthly: '', yearly: '' };
unconfigured.prices.enterprise = { monthly: '', yearly: '' };

function buyButton(window, tier) {
  const button = window.document.querySelector(`[data-checkout-tier="${tier}"]`);
  assert(button, `no buy control for tier "${tier}" on the pricing page`);
  return button;
}

function noteText(window, button) {
  const note = window.document.getElementById(button.getAttribute('aria-describedby'));
  assert(note, 'buy control has no aria-describedby note element');
  return { hidden: note.hidden, text: (note.textContent || '').trim() };
}

function clickToggle(window) {
  const toggle = window.document.getElementById('pricing-toggle');
  assert(toggle, 'the pricing page has no billing toggle');
  toggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

// ── pricing page ─────────────────────────────────────────────────────

check('buy controls are real, named, keyboard-operable buttons', async (JSDOM, plant) => {
  const window = await openPage(JSDOM, {
    html: 'pricing.html',
    url: PRICING_URL,
    config: configured,
    scripts: PRICING_SCRIPTS,
    plant,
    beforeScripts: installPaddle,
  });

  for (const [tier, expected] of [
    ['pro', 'Basic'],
    ['enterprise', 'Pro'],
  ]) {
    const button = buyButton(window, tier);
    assert(
      button.tagName === 'BUTTON',
      `${tier} buy control is a <${button.tagName.toLowerCase()}>`,
    );
    assert(!button.hasAttribute('disabled'), `${tier} buy control is unreachable by keyboard`);
    assert(button.tabIndex === 0, `${tier} buy control is not in the tab order`);
    const name = (button.textContent || '').trim();
    assert(
      /^Subscribe to /.test(name),
      `${tier} accessible name does not say what it does: "${name}"`,
    );
    assert(name.includes(expected), `${tier} accessible name does not name the plan: "${name}"`);
    assert(
      button.getAttribute('aria-disabled') === 'false',
      `${tier} button inert despite a valid config`,
    );
    assert(noteText(window, button).hidden, `${tier} shows a problem note despite a valid config`);
  }
});

check('a click opens Paddle checkout with the configured monthly price', async (JSDOM, plant) => {
  const window = await openPage(JSDOM, {
    html: 'pricing.html',
    url: PRICING_URL,
    config: configured,
    scripts: PRICING_SCRIPTS,
    plant,
    beforeScripts: installPaddle,
  });

  const captured = [];
  window.Paddle.Checkout.open = (options) => captured.push(options);
  const initialised = [];
  window.Paddle.Initialize = (options) => initialised.push(options);

  buyButton(window, 'pro').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick(window, 8);

  assert(captured.length === 1, `Paddle.Checkout.open called ${captured.length} times, expected 1`);
  const options = captured[0];
  assert(
    options.items?.[0]?.priceId === configured.prices.pro.monthly,
    `checkout opened with priceId "${options.items?.[0]?.priceId}"`,
  );
  assert(options.items[0].quantity === 1, 'checkout did not request exactly one subscription');
  assert(options.customData?.tier === 'pro', `custom_data.tier was "${options.customData?.tier}"`);
  assert(
    options.settings?.successUrl === 'https://proso.com.br/success.html',
    `successUrl was "${options.settings?.successUrl}"`,
  );
  assert(options.settings.displayMode === 'overlay', 'checkout is not the overlay');
  assert(
    initialised.some((entry) => entry.token === configured.clientToken),
    'Paddle was opened without being initialised with the client token',
  );
});

check('the purchase carries a claim the buyer keeps, and only its digest', async (JSDOM, plant) => {
  const window = await openPage(JSDOM, {
    html: 'pricing.html',
    url: PRICING_URL,
    config: configured,
    scripts: PRICING_SCRIPTS,
    plant,
    beforeScripts: installPaddle,
  });

  const captured = [];
  window.Paddle.Checkout.open = (options) => captured.push(options);

  assert(
    window.sessionStorage.getItem(CLAIM_STORAGE_KEY) === null,
    'a claim secret existed before anyone pressed a buy control',
  );

  buyButton(window, 'pro').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick(window, 8);
  assert(captured.length === 1, 'the buy control did not open checkout');

  const secret = window.sessionStorage.getItem(CLAIM_STORAGE_KEY);
  assert(secret, 'the buy click stored no claim secret for the success page to present');
  const decoded = Buffer.from(secret, 'base64url');
  assert(decoded.length === 32, `the claim secret decodes to ${decoded.length} bytes, expected 32`);

  const sent = captured[0].customData?.license_claim_hash;
  assert(sent, 'checkout carried no license_claim_hash');
  assert(/^[0-9a-f]{64}$/.test(sent), `license_claim_hash is not a hex SHA-256 digest: "${sent}"`);

  const expected = Buffer.from(
    await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)),
  ).toString('hex');
  assert(sent === expected, 'license_claim_hash is not the digest of the stored claim secret');

  assert(
    !JSON.stringify(captured[0]).includes(secret),
    'the raw claim secret was handed to the payment provider — only its digest may leave the browser',
  );
});

check('the annual toggle switches the price the click buys', async (JSDOM, plant) => {
  const window = await openPage(JSDOM, {
    html: 'pricing.html',
    url: PRICING_URL,
    config: configured,
    scripts: PRICING_SCRIPTS,
    plant,
    beforeScripts: installPaddle,
  });

  const captured = [];
  window.Paddle.Checkout.open = (options) => captured.push(options);

  clickToggle(window);
  await tick(window, 6);

  buyButton(window, 'enterprise').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick(window, 6);

  assert(captured.length === 1, `Paddle.Checkout.open called ${captured.length} times, expected 1`);
  assert(
    captured[0].items[0].priceId === configured.prices.enterprise.yearly,
    `annual click bought "${captured[0].items[0].priceId}", expected the yearly price`,
  );
  assert(
    captured[0].customData.billing_period === 'yearly',
    `custom_data.billing_period was "${captured[0].customData.billing_period}"`,
  );
});

check('an unset price id disables the control and states why', async (JSDOM, plant) => {
  const window = await openPage(JSDOM, {
    html: 'pricing.html',
    url: PRICING_URL,
    config: unconfigured,
    scripts: PRICING_SCRIPTS,
    plant,
    beforeScripts: installPaddle,
  });

  const captured = [];
  window.Paddle.Checkout.open = (options) => captured.push(options);

  for (const tier of ['pro', 'enterprise']) {
    const button = buyButton(window, tier);
    assert(
      button.getAttribute('aria-disabled') === 'true',
      `${tier} button is live with no price id configured`,
    );
    assert(
      button.classList.contains('btn--disabled'),
      `${tier} button is not visibly disabled with no price id configured`,
    );

    const note = noteText(window, button);
    assert(!note.hidden, `${tier} button is disabled with no reason shown`);
    assert(note.text.length > 0, `${tier} reason element is empty`);
    assert(
      note.text.includes('price id') && note.text.includes('not configured'),
      `${tier} reason does not name the missing value: "${note.text}"`,
    );

    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  }
  await tick(window, 6);

  assert(captured.length === 0, 'a disabled buy control still opened checkout');
  assert(
    window.document.querySelector('script[src*="paddle.com"]') === null,
    'a disabled buy control still fetched the payment provider',
  );
});

check(
  'a malformed price id and a mismatched token each state their own reason',
  async (JSDOM, plant) => {
    const malformed = JSON.parse(JSON.stringify(configured));
    malformed.prices.pro.monthly = '12345';

    let window = await openPage(JSDOM, {
      html: 'pricing.html',
      url: PRICING_URL,
      config: malformed,
      scripts: PRICING_SCRIPTS,
      plant,
      beforeScripts: installPaddle,
    });
    let button = buyButton(window, 'pro');
    assert(
      button.getAttribute('aria-disabled') === 'true',
      'a malformed price id produced a live button',
    );
    assert(
      noteText(window, button).text.includes('does not look like a Paddle price id'),
      `malformed price id reason was "${noteText(window, button).text}"`,
    );

    const mismatched = JSON.parse(JSON.stringify(configured));
    mismatched.clientToken = fakeClientToken('production');
    window = await openPage(JSDOM, {
      html: 'pricing.html',
      url: PRICING_URL,
      config: mismatched,
      scripts: PRICING_SCRIPTS,
      plant,
      beforeScripts: installPaddle,
    });
    button = buyButton(window, 'pro');
    assert(
      button.getAttribute('aria-disabled') === 'true',
      'a production token in the sandbox environment produced a live button',
    );
    assert(
      noteText(window, button).text.includes('test_'),
      `token mismatch reason was "${noteText(window, button).text}"`,
    );
  },
);

check('a period configured monthly but not annually disables on toggle', async (JSDOM, plant) => {
  const halfConfigured = JSON.parse(JSON.stringify(configured));
  halfConfigured.prices.pro.yearly = '';

  const window = await openPage(JSDOM, {
    html: 'pricing.html',
    url: PRICING_URL,
    config: halfConfigured,
    scripts: PRICING_SCRIPTS,
    plant,
    beforeScripts: installPaddle,
  });

  const button = buyButton(window, 'pro');
  assert(
    button.getAttribute('aria-disabled') === 'false',
    'the configured monthly price did not enable the button',
  );

  clickToggle(window);
  await tick(window, 6);

  assert(
    button.getAttribute('aria-disabled') === 'true',
    'switching to a period with no price id left the button live',
  );
  assert(
    noteText(window, button).text.includes('yearly'),
    `the toggled reason does not name the period: "${noteText(window, button).text}"`,
  );
});

// ── success page ─────────────────────────────────────────────────────

function successPage(
  JSDOM,
  { query, responses, plant, clipboard, claim = CLAIM_SECRET, clockStep = 0 },
) {
  const calls = [];
  return openPage(JSDOM, {
    html: 'success.html',
    url: `${SUCCESS_URL}${query}`,
    config: configured,
    scripts: ['main.js', 'success.js'],
    plant,
    beforeScripts: (window) => {
      if (claim) window.sessionStorage.setItem(CLAIM_STORAGE_KEY, claim);
      if (clockStep > 0) {
        // Reaching the page's own retry budget in real time would take a minute.
        // Advancing the clock the page reads exercises the shipped budget rather
        // than a shortened copy of it.
        const start = Date.now();
        let elapsed = 0;
        window.Date.now = () => {
          elapsed += clockStep;
          return start + elapsed;
        };
      }
      window.fetch = (url, init) => {
        calls.push({ url, init });
        const next = responses[Math.min(calls.length - 1, responses.length - 1)];
        return Promise.resolve({
          ok: next.status >= 200 && next.status < 300,
          status: next.status,
          json: () => Promise.resolve(next.body),
        });
      };
      if (clipboard) {
        Object.defineProperty(window.navigator, 'clipboard', {
          value: {
            writeText: (text) => {
              clipboard.push(text);
              return Promise.resolve();
            },
          },
          configurable: true,
        });
      }
    },
  }).then((window) => ({ window, calls }));
}

const issuedBody = {
  status: 'issued',
  // Derived, not pasted: a literal key-shaped string here would be indexed by
  // secret scanners forever and would teach the next reader to paste a real one.
  licenseKey: `proso_test_${Buffer.from('149-checkout-surface-gate').toString('hex')}`,
  tier: 'pro',
  issuedAt: '2026-08-12T18:00:00.000Z',
};

function panel(window, id) {
  const node = window.document.getElementById(id);
  assert(node, `success page has no #${id} panel`);
  return node;
}

check(
  'the success page exchanges the transaction id for the key and shows it',
  async (JSDOM, plant) => {
    const clipboard = [];
    const { window, calls } = await successPage(JSDOM, {
      query: '?_ptxn=txn_01hv8example',
      responses: [{ status: 200, body: issuedBody }],
      plant,
      clipboard,
    });
    await tick(window, 8);

    assert(calls.length === 1, `success page made ${calls.length} requests, expected 1`);
    assert(
      calls[0].url === 'https://api.proso.com.br/api/v1/license/by-transaction',
      `success page called "${calls[0].url}"`,
    );
    assert(calls[0].init.method === 'POST', 'the transaction id was not sent in a POST body');
    const sentBody = JSON.parse(calls[0].init.body);
    assert(
      sentBody.transactionId === 'txn_01hv8example',
      'the request body does not carry the transaction id from the URL',
    );
    assert(
      sentBody.claimSecret === CLAIM_SECRET,
      'the request body does not present the claim secret this browser minted at checkout',
    );

    const keyPanel = panel(window, 'checkout-key');
    assert(!keyPanel.hidden, 'the licence key panel stayed hidden after the key was issued');
    assert(
      panel(window, 'checkout-waiting').hidden,
      'the waiting panel stayed visible after the key arrived',
    );
    assert(
      panel(window, 'checkout-problem').hidden,
      'the problem panel is visible on a successful issue',
    );

    const field = window.document.getElementById('license-key-value');
    assert(field, 'no element holds the licence key');
    assert(
      field.textContent === issuedBody.licenseKey,
      `the key rendered as "${field.textContent}"`,
    );
    assert(
      !['IMG', 'CANVAS', 'SVG'].includes(field.tagName),
      `the key is a <${field.tagName.toLowerCase()}>, not selectable text`,
    );

    const copy = window.document.getElementById('license-key-copy');
    assert(copy && copy.tagName === 'BUTTON', 'the copy control is not a real button');
    assert((copy.textContent || '').trim().length > 0, 'the copy control has no accessible name');
    copy.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await tick(window, 6);
    assert(clipboard[0] === issuedBody.licenseKey, `copy wrote "${clipboard[0]}" to the clipboard`);
    assert(
      window.sessionStorage.getItem(CLAIM_STORAGE_KEY) === null,
      'the claim secret outlived the handoff it existed for',
    );

    const body = window.document.body.textContent;
    assert(
      /settings/i.test(body) && /paste/i.test(body),
      'the page never says where to paste the key',
    );
  },
);

check('a pending answer is retried until the key exists', async (JSDOM, plant) => {
  const { window, calls } = await successPage(JSDOM, {
    query: '?_ptxn=txn_01hv8pending',
    responses: [
      { status: 202, body: { status: 'pending', retryAfterMs: 5 } },
      { status: 202, body: { status: 'pending', retryAfterMs: 5 } },
      { status: 200, body: issuedBody },
    ],
    plant,
  });
  await tick(window, 40);

  assert(
    calls.length >= 3,
    `the page stopped after ${calls.length} request(s) instead of retrying`,
  );
  assert(!panel(window, 'checkout-key').hidden, 'the key never rendered after the pending answers');
  assert(
    window.document.getElementById('license-key-value').textContent === issuedBody.licenseKey,
    'the retried request did not render the issued key',
  );
});

check('the transaction id alone buys nothing', async (JSDOM, plant) => {
  // Paddle publishes `_ptxn` in the URL, so this is the state of every browser
  // that was merely shown the link. It must not even ask for a key.
  const { window, calls } = await successPage(JSDOM, {
    query: '?_ptxn=txn_01hv8example',
    responses: [{ status: 200, body: issuedBody }],
    plant,
    claim: null,
  });
  await tick(window, 10);

  assert(
    calls.length === 0,
    `a browser holding only the transaction id made ${calls.length} claim request(s)`,
  );
  assert(panel(window, 'checkout-key').hidden, 'a licence key was shown without a claim secret');
  assert(
    !panel(window, 'checkout-problem').hidden,
    'no claim secret produced no visible explanation',
  );

  const text = window.document.getElementById('checkout-problem-text').textContent.trim();
  assert(text.length > 0, 'the explanation is empty');
  assert(
    /commercial@proso\.com\.br/.test(text),
    `a buyer in this state is given no way out: "${text}"`,
  );
});

check('a missing transaction id explains itself without asking', async (JSDOM, plant) => {
  const { window, calls } = await successPage(JSDOM, {
    query: '',
    responses: [{ status: 200, body: issuedBody }],
    plant,
  });
  await tick(window, 6);

  assert(calls.length === 0, 'the page called the licence service with no transaction id');
  assert(
    !panel(window, 'checkout-problem').hidden,
    'no transaction id produced no visible problem',
  );
  const text = window.document.getElementById('checkout-problem-text').textContent.trim();
  assert(text.length > 0, 'the problem panel is empty');
  assert(
    /transaction id/i.test(text),
    `the missing-id reason does not name what is missing: "${text}"`,
  );
});

check('a claim that never resolves times out without revealing why', async (JSDOM, plant) => {
  // The server answers 202 for an unknown transaction, a webhook in flight and
  // a wrong claim alike. The page must survive that ambiguity and must not
  // translate it into a statement about whether the purchase exists.
  const { window, calls } = await successPage(JSDOM, {
    query: '?_ptxn=txn_01hv8stubborn',
    responses: [{ status: 202, body: { status: 'pending', retryAfterMs: 1 } }],
    plant,
    clockStep: 9000,
  });
  await tick(window, 60);

  assert(calls.length > 1, `the page gave up after ${calls.length} request(s) instead of retrying`);
  assert(panel(window, 'checkout-key').hidden, 'a licence key appeared without an issued answer');
  assert(!panel(window, 'checkout-problem').hidden, 'the timeout produced no visible explanation');

  const text = window.document.getElementById('checkout-problem-text').textContent.trim();
  assert(
    /commercial@proso\.com\.br/.test(text),
    `the timeout gives the buyer no way out: "${text}"`,
  );
  assert(
    !/(does not exist|unknown|no such|not found|invalid claim|wrong claim)/i.test(text),
    `the page turned an ambiguous answer into an existence claim: "${text}"`,
  );
});

check('the site speaks the licence contract declared in @proso/shared', async () => {
  let contract;
  try {
    contract = readFileSync(sharedCheckoutSchema, 'utf8');
  } catch {
    throw new Blocked('packages/shared/src/schemas/checkout.ts is missing');
  }

  const declared = contract.match(/LICENSE_BY_TRANSACTION_PATH = '([^']+)'/);
  assert(declared, 'the shared contract does not declare LICENSE_BY_TRANSACTION_PATH');

  const site = readSite(path.join('assets', 'js', 'success.js'));
  const mirrored = site.match(/LICENSE_BY_TRANSACTION_PATH = '([^']+)'/);
  assert(mirrored, 'the success page does not name the licence route');
  assert(
    mirrored[1] === declared[1],
    `the site calls "${mirrored[1]}" but the contract declares "${declared[1]}"`,
  );

  for (const field of [
    'transactionId',
    'claimSecret',
    'licenseKey',
    'retryAfterMs',
    "z.literal('issued')",
    "z.literal('pending')",
  ]) {
    assert(contract.includes(field), `the shared contract no longer describes ${field}`);
  }
  for (const field of [
    'transactionId',
    'claimSecret',
    'licenseKey',
    'retryAfterMs',
    "'issued'",
    "'pending'",
  ]) {
    assert(site.includes(field), `the success page no longer reads ${field}`);
  }

  const storageKey = contract.match(/LICENSE_CLAIM_STORAGE_KEY = '([^']+)'/);
  const hashField = contract.match(/LICENSE_CLAIM_HASH_FIELD = '([^']+)'/);
  assert(
    storageKey && hashField,
    'the shared contract does not name the claim storage key and hash field',
  );
  assert(
    storageKey[1] === CLAIM_STORAGE_KEY,
    `this gate seeds "${CLAIM_STORAGE_KEY}" but the contract declares "${storageKey[1]}"`,
  );

  const buy = readSite(path.join('assets', 'js', 'checkout.js'));
  assert(
    buy.includes(`'${storageKey[1]}'`),
    'the buy control does not store the claim secret under the contract\u2019s key',
  );
  assert(
    buy.includes(`'${hashField[1]}'`),
    `the buy control does not send custom_data.${hashField[1]}`,
  );
  assert(
    site.includes(`'${storageKey[1]}'`),
    'the success page does not read the claim secret from the contract\u2019s key',
  );
});

// ── runner ───────────────────────────────────────────────────────────

async function runChecks(plant) {
  const JSDOM = await loadJsdom();
  const results = [];
  for (const { name, fn } of checks) {
    try {
      await fn(JSDOM, plant);
      results.push({ name, ok: true });
    } catch (error) {
      if (error instanceof Blocked) throw error;
      results.push({ name, ok: false, message: error.message });
    }
  }
  return results;
}

async function main() {
  const plantsMode = process.argv.includes('--plants');

  if (!plantsMode) {
    const results = await runChecks(null);
    for (const result of results) {
      process.stdout.write(`  ${result.ok ? 'ok  ' : 'FAIL'} ${result.name}\n`);
      if (!result.ok) process.stdout.write(`       ${result.message}\n`);
    }
    const failed = results.filter((result) => !result.ok);
    process.stdout.write(
      `\ncheckout-surface-gate ${failed.length === 0 ? 'PASS' : 'FAIL'}: ${results.length - failed.length}/${results.length} checks held\n`,
    );
    process.exitCode = failed.length === 0 ? 0 : 1;
    return;
  }

  // Plant mode: every planted break must turn at least one check red. A plant
  // that leaves the gate green means the gate is not testing what it claims.
  const clean = await runChecks(null);
  if (clean.some((result) => !result.ok)) {
    process.stdout.write('checkout-surface-gate CRASH: the clean run is already failing\n');
    process.exitCode = 1;
    return;
  }

  let survivors = 0;
  for (const [id, plant] of Object.entries(PLANTS)) {
    const results = await runChecks(id);
    const caught = results.filter((result) => !result.ok);
    const verdict = caught.length > 0 ? 'caught' : 'SURVIVED';
    if (caught.length === 0) survivors += 1;
    process.stdout.write(`  ${verdict.padEnd(9)} ${id} — ${plant.breaks}\n`);
    for (const failure of caught) {
      process.stdout.write(`            ↳ ${failure.name}: ${failure.message}\n`);
    }
  }

  process.stdout.write(
    `\ncheckout-surface-plants ${survivors === 0 ? 'PASS' : 'FAIL'}: ${Object.keys(PLANTS).length - survivors}/${Object.keys(PLANTS).length} plants caught\n`,
  );
  process.exitCode = survivors === 0 ? 0 : 1;
}

main().catch((error) => {
  const blocked = error instanceof Blocked;
  process.stderr.write(
    `\ncheckout-surface-gate ${blocked ? 'BLOCKED' : 'CRASH'}: ${error.message}\n`,
  );
  process.exitCode = blocked ? 2 : 1;
});
