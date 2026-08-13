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
 * Feature 154 extends the claim to the promises the surface makes to humans:
 * recovery copy never treats the transaction id as identity, the success page
 * claims nothing the server has not confirmed, every priced tier and credit
 * volume on the site equals the shared source of truth, install controls link
 * nowhere private and name the Firefox signing wait, a malformed retry delay
 * cannot hot-loop the licence service, a hung request is aborted, one checkout
 * (and one claim secret) exists at a time, a failed provider load is not
 * cached, a non-string configuration value disables visibly instead of
 * throwing, and the deploy-readiness receipt fails closed while purchase holds
 * are open — and never prints an unproven claim endpoint CLOSED: while
 * purchase is disabled the endpoint hold is NOT REQUIRED.
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

import { spawn } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

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

// Assembled from parts so the gate source never contains a credential-shaped
// literal a secret scanner could flag — and so a real credential can never
// hide among the fixtures.
const plantClientToken = `test_${'0'.repeat(23)}`;
const plantPriceId = (index) =>
  `pri_${'plant'.repeat(2).slice(0, 5)}${String(index).padStart(4, '0')}`;

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
    from: "    return section && section.getAttribute('data-billing') === 'annual' ? yearly : monthly;",
    to: '    void yearly;\n    return monthly;',
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

  // Feature 154 — claim-shield regressions. Each plant re-breaks exactly one
  // shipped behaviour and must turn at least one assertion red.
  'we-will-send-your-key': {
    file: 'success.js',
    from: "'its own is not proof of payment. Email ' +",
    to: "'its own is not proof of payment. Email us and we will send your key; also ' +",
    breaks: 'recovery copy names Paddle verification and never releases a key against the id alone',
  },
  'claims-active': {
    file: 'success.html',
    from: '<h1>Claiming your licence key</h1>',
    to: '<h1>Thank you &mdash; your subscription is active</h1>',
    breaks: 'the success page never claims an active subscription before an issued response',
  },
  'credit-volume': {
    file: 'pricing.html',
    from: '500,000 managed characters per month',
    to: '300,000 managed characters per month',
    breaks: 'the priced credit volume matches the shared TIER_CREDITS table',
  },
  'github-install': {
    file: 'index.html',
    from: '<a href="#install-status" class="btn btn--primary btn--lg">',
    to: '<a href="https://github.com/phsb5321/Proso/releases" class="btn btn--primary btn--lg">',
    breaks: 'install controls never link a private GitHub releases page',
  },
  'stale-jsonld': {
    file: 'index.html',
    from: '"softwareVersion": "1.2.9",',
    to: '"softwareVersion": "1.0.0",',
    breaks: 'JSON-LD advertises the extension version in packages/extension/package.json',
  },
  'hot-loop': {
    file: 'success.js',
    from: "      return { status: 'pending', retryAfterMs: clampRetryAfterMs(retry) };",
    to: "      return { status: 'pending', retryAfterMs: retry };",
    breaks: 'a pending retry delay is clamped to a safe floor and ceiling',
  },
  'double-mint': {
    file: 'checkout.js',
    from: "        if (button.getAttribute('aria-disabled') === 'true') {\n          const note = noteFor(button);\n          if (note) note.hidden = false;\n          return;\n        }\n        if (checkoutInFlight) return;\n        holdControls(buttons, config);\n        openCheckout(button, config);",
    to: "        if (button.getAttribute('aria-disabled') === 'true') {\n          const note = noteFor(button);\n          if (note) note.hidden = false;\n          return;\n        }\n        openCheckout(button, config);",
    breaks: 'one active checkout and one preserved claim secret at a time',
  },
  'hung-forever': {
    file: 'success.js',
    from: '    const timer = window.setTimeout(() => controller.abort(), timeoutMs);',
    to: '    const timer = null;',
    breaks: 'a hung licence-service request is aborted instead of stalling the page',
  },
  'poisoned-loader': {
    file: 'checkout.js',
    from: '    window.__prosoPaddleLoading.catch(() => {\n      window.__prosoPaddleLoading = null;\n    });',
    to: '    void window.__prosoPaddleLoading;',
    breaks: 'a failed provider load is not cached against the next buy click',
  },
  'throws-on-numeric': {
    file: 'checkout.js',
    from: "    if (typeof config.clientToken !== 'string' || config.clientToken.length === 0) {",
    to: '    if (!config.clientToken) {',
    breaks: 'a non-string configuration value disables the control with a stated reason',
  },
  'live-config': {
    file: 'checkout-config.js',
    from: "  clientToken: '',\n  apiBaseUrl: 'https://api.proso.com.br',\n  catalog: Object.freeze({\n    tiers: Object.freeze(['pro', 'enterprise']),\n    periods: Object.freeze(['monthly', 'yearly']),\n  }),\n  prices: {\n    pro: { monthly: '', yearly: '' },\n    enterprise: { monthly: '', yearly: '' },\n  },",
    to:
      `  clientToken: '${plantClientToken}',\n` +
      "  apiBaseUrl: 'https://api.proso.com.br',\n" +
      '  catalog: Object.freeze({\n' +
      "    tiers: Object.freeze(['pro', 'enterprise']),\n" +
      "    periods: Object.freeze(['monthly', 'yearly']),\n" +
      '  }),\n' +
      '  prices: {\n' +
      `    pro: { monthly: '${plantPriceId(1)}', yearly: '${plantPriceId(2)}' },\n` +
      `    enterprise: { monthly: '${plantPriceId(3)}', yearly: '${plantPriceId(4)}' },\n` +
      '  },',
    breaks: 'the deploy receipt fails closed while purchase holds are open',
  },

  // GPT-5.6 Sol review regressions. Each plant re-breaks one reviewed behaviour.
  'event-callback-seam': {
    file: 'checkout.js',
    from: "    paddle.Initialize({\n      token: config.clientToken,\n      eventCallback: (event) => {\n        if (event && (event.name === 'checkout.closed' || event.name === 'checkout.completed')) {\n          releaseCheckout();\n        }\n      },\n    });",
    to: '    paddle.Initialize({ token: config.clientToken, eventCallback: null });',
    breaks: 'the lifecycle callback is registered at the Initialize seam, not on Checkout.open',
  },
  'live-controls': {
    file: 'checkout.js',
    from: '        if (checkoutInFlight) return;\n        holdControls(buttons, config);\n        openCheckout(button, config);',
    to: '        if (checkoutInFlight) return;\n        checkoutInFlight = true;\n        openCheckout(button, config);',
    breaks: 'all buy controls stay visibly disabled with a stated reason while checkout is open',
  },
  'toggle-unlock': {
    file: 'checkout.js',
    from: '      if (checkoutInFlight) {\n        setInert(button, CHECKOUT_OPEN_REASON);\n        return;\n      }',
    to: '      void checkoutInFlight;',
    breaks: 'the billing toggle never re-enables buy controls while checkout is in flight',
  },
  'bad-api-url': {
    file: 'checkout.js',
    from: "    if (typeof config.apiBaseUrl !== 'string' || !/^https:\\/\\//i.test(config.apiBaseUrl)) {",
    to: '    if (!config.apiBaseUrl) {',
    breaks: 'a malformed API address disables purchase in checkout',
  },
  'sync-throw': {
    file: 'success.js',
    from: "    const apiBaseUrl =\n      config && typeof config.apiBaseUrl === 'string' && /^https:\\/\\//i.test(config.apiBaseUrl)\n        ? config.apiBaseUrl\n        : null;\n    if (!apiBaseUrl) {\n      fail('Checkout is unavailable: the Proso API address is not a valid HTTPS URL.');\n      return;\n    }",
    to: "    const apiBaseUrl = config ? config.apiBaseUrl : null;\n    if (!apiBaseUrl) {\n      fail('Checkout is unavailable: the Proso API address is not configured on this site.');\n      return;\n    }",
    breaks:
      'a malformed API address lands in the visible problem panel, never a stuck waiting panel',
  },
  'active-headline': {
    file: 'success.html',
    from: '<meta name="description" content="The page that exchanges a Paddle purchase for the Proso licence key.">',
    to: '<meta name="description" content="Your licence key is ready &mdash; your completed purchase is confirmed.">',
    breaks: 'success-page metadata stays neutral until the server issues the key',
  },
  'hidden-panels': {
    file: 'success.html',
    from: 'id="checkout-waiting" role="status" aria-live="polite" hidden',
    to: 'id="checkout-waiting" role="status" aria-live="polite"',
    breaks: 'every outcome panel starts hidden and JavaScript reveals exactly one',
  },
  'stale-legal': {
    file: 'packages/legal/terms.html',
    from: '500,000 characters',
    to: '300,000 characters',
    breaks: 'the authoritative legal terms match the shared tier truth',
  },
  'builtin-voices': {
    file: 'index.html',
    from: '<p>Choose from OpenAI, ElevenLabs, Groq, or Cartesia. Bring your own API key or use managed credits.</p>',
    to: '<p>Choose from OpenAI, ElevenLabs, Groq, Cartesia, or your browser&rsquo;s built-in voices. Bring your own API key or use managed credits.</p>',
    breaks: 'no deployed surface advertises browser-built-in voices',
  },
  'subscribe-links': {
    file: 'index.html',
    from: '>View Pro plan<',
    to: '>Subscribe to Pro<',
    breaks: 'landing page CTAs read as navigation to plans, not as live checkout',
  },
  'free-managed-voices': {
    file: 'pricing.html',
    from: '              <li><span class="pricing-card__dash" aria-hidden="true">&mdash;</span> <span class="text-muted">Managed voices</span></li>\n              <li><span class="pricing-card__dash" aria-hidden="true">&mdash;</span> <span class="text-muted">Premium voices</span></li>\n              <li><span class="pricing-card__dash" aria-hidden="true">&mdash;</span> <span class="text-muted">Priority support</span></li>',
    to: '              <li><span class="pricing-card__check" aria-hidden="true">&#10003;</span> Managed voices</li>\n              <li><span class="pricing-card__dash" aria-hidden="true">&mdash;</span> <span class="text-muted">Premium voices</span></li>\n              <li><span class="pricing-card__dash" aria-hidden="true">&mdash;</span> <span class="text-muted">Priority support</span></li>',
    breaks: 'each priced card claims exactly the features its tier has in the shared matrix',
  },
  'gullible-receipt': {
    file: 'scripts/checkout-deploy-readiness.mjs',
    from: "      if (pattern.test(stripComments(readFileSync(full, 'utf8')))) return true;",
    to: "      if (pattern.test(readFileSync(full, 'utf8'))) return true;",
    breaks: 'the deploy receipt oracles are not fooled by comments',
  },
  'disabled-claims-closed': {
    file: 'scripts/checkout-deploy-readiness.mjs',
    from: "    endpointState = 'NOT REQUIRED';",
    to: "    endpointState = 'CLOSED';",
    breaks: 'an unproven claim endpoint never reads CLOSED while purchase is disabled',
  },
  'partial-config-ignored': {
    file: 'scripts/checkout-deploy-readiness.mjs',
    from: '  const purchaseCanEnable = status.canEnablePurchase;',
    to: '  const purchaseCanEnable = status.complete;',
    breaks: 'one usable price binds every readiness hold even when other prices are missing',
  },
  'catalog-drift-paid-control': {
    file: 'pricing.html',
    from: '          <!-- Enterprise -->',
    to:
      '          <button type="button" class="btn btn--primary" data-checkout-tier = "team" aria-describedby="checkout-note-team">Subscribe to paid plan</button>\n' +
      '          <p class="checkout-note" id="checkout-note-team" role="status" aria-live="polite" hidden></p>\n\n' +
      '          <!-- Enterprise -->',
    breaks:
      'a whitespace-separated paid control outside the readiness catalog is named as checkout catalog drift',
    mustFailCheck: 'the deploy receipt fails closed and its oracles are runnable, not greppable',
    mustFailMessage: /catalog-drift falsifier fired and named Team/i,
  },
};

// ── harness ──────────────────────────────────────────────────────────

function readSite(relative, plant) {
  const file = /^(packages|scripts)\//.test(relative)
    ? path.join(repoRoot, relative)
    : path.join(siteDir, relative);
  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    throw new Blocked(`file missing: ${relative}`);
  }
  if (plant) {
    const wanted = PLANTS[plant].file;
    const matches = wanted.includes('/') ? wanted === relative : wanted === path.basename(relative);
    if (matches) {
      const { from, to } = PLANTS[plant];
      if (!source.includes(from)) {
        throw new Blocked(`plant "${plant}" no longer matches ${relative} — rewrite the plant`);
      }
      source = source.replace(from, to);
    }
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
async function openPage(
  JSDOM,
  { html, url, config, scripts, plant, beforeScripts, clockStep = 0 },
) {
  const dom = new JSDOM(readSite(html, plant), { url, runScripts: 'outside-only' });
  const { window } = dom;

  // jsdom ships getRandomValues but no SubtleCrypto. Node's Web Crypto is the
  // same specification the browser implements, so the claim secret and its
  // digest are produced by a real implementation, not a stub.
  Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });

  // jsdom 20 exposes no TextEncoder on the window, though every browser that
  // implements crypto.subtle also implements it. Filling the gap keeps the
  // harness's limitation from reading as a site defect.
  window.TextEncoder = TextEncoder;

  // jsdom also exposes no AbortController; browsers that implement fetch
  // implement it. Node's is the same specification.
  window.AbortController = AbortController;

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

  // A virtual clock, so the page's own retry budget and request deadlines can
  // be exercised without waiting for them in real time. When present, timers
  // fire only while __advanceClock runs, and the delay each timer asked for is
  // recorded for the clamping assertions.
  if (clockStep > 0) {
    const start = Date.now();
    let now = start;
    const timers = [];
    window.Date.now = () => now;
    window.setTimeout = (fn, ms) => {
      const delay = typeof ms === 'number' ? ms : 0;
      const timer = { at: now + (delay > 0 ? delay : 0), delay, fn, cleared: false };
      timers.push(timer);
      timers.sort((a, b) => a.at - b.at);
      return timer;
    };
    window.clearTimeout = (timer) => {
      if (timer) timer.cleared = true;
    };
    window.__pendingTimers = () => timers;
    window.__advanceClock = (ms) => {
      now += ms;
      const due = timers.filter((timer) => !timer.cleared && timer.at <= now);
      due.forEach((timer) => {
        timer.cleared = true;
      });
      due.forEach((timer) => {
        timer.fn();
      });
    };
  }

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
  await tick(window, 3, clockStep);
  return window;
}

function tick(window, times = 3, stepMs = 0) {
  return new Promise((resolve) => {
    const advance = window.__advanceClock;
    if (advance && stepMs > 0) {
      (async () => {
        for (let i = 0; i < times; i += 1) {
          advance(stepMs);
          // A macrotask yield, so every promise chain the fired timers
          // unblocked settles — and schedules its next timer — before the
          // clock moves again. A microtask await would interleave with the
          // page's own chains and stretch one poll over several advances.
          await new Promise((resolve) => setImmediate(resolve));
        }
        resolve();
      })();
      return;
    }
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
  catalog: {
    tiers: ['pro', 'enterprise'],
    periods: ['monthly', 'yearly'],
  },
  prices: {
    pro: { monthly: 'pri_basic_monthly', yearly: 'pri_basic_yearly' },
    enterprise: { monthly: 'pri_pro_monthly', yearly: 'pri_pro_yearly' },
  },
};

async function sha256hex(text) {
  return Buffer.from(
    await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
  ).toString('hex');
}

const unconfigured = JSON.parse(JSON.stringify(configured));
unconfigured.prices.pro = { monthly: '', yearly: '' };
unconfigured.prices.enterprise = { monthly: '', yearly: '' };

const partiallyConfigured = JSON.parse(JSON.stringify(configured));
partiallyConfigured.prices.pro.yearly = '';
partiallyConfigured.prices.enterprise = { monthly: '', yearly: '' };

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
    ['pro', 'Pro'],
    ['enterprise', 'Enterprise'],
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

check('the runtime derives period values from the toggle catalog attributes', async (JSDOM) => {
  const custom = JSON.parse(JSON.stringify(configured));
  custom.catalog.periods = ['monthly-v2', 'yearly-v2'];
  custom.prices.pro = { monthly: '', yearly: '' };
  custom.prices.pro['monthly-v2'] = 'pri_custom_monthly';
  custom.prices.pro['yearly-v2'] = 'pri_custom_yearly';

  const html = readSite('pricing.html')
    .replace('data-checkout-period="monthly"', 'data-checkout-period="monthly-v2"')
    .replace(
      'data-checkout-alternate-period="yearly"',
      'data-checkout-alternate-period="yearly-v2"',
    );
  const dir = mkdtempSync(path.join(os.tmpdir(), 'proso-period-contract-'));
  const page = path.join(dir, 'pricing.html');
  writeFileSync(page, html);
  const dom = new JSDOM(readFileSync(page, 'utf8'), {
    url: PRICING_URL,
    runScripts: 'outside-only',
  });
  const { window } = dom;
  Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
  window.TextEncoder = TextEncoder;
  window.AbortController = AbortController;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.PROSO_CHECKOUT_CONFIG = window.eval(`(${JSON.stringify(custom)})`);
  const paddle = installPaddle(window);
  window.eval(readSite(path.join('assets', 'js', 'main.js')));
  window.eval(readSite(path.join('assets', 'js', 'checkout.js')));
  await new Promise((resolve) =>
    window.document.addEventListener('DOMContentLoaded', resolve, { once: true }),
  );
  await tick(window, 3);

  buyButton(window, 'pro').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick(window, 8);
  assert(
    paddle.opened[0]?.items[0]?.priceId === 'pri_custom_monthly',
    `monthly runtime ignored data-checkout-period: ${JSON.stringify(paddle.opened[0])}`,
  );
  const lifecycle = paddle.initialised.find((entry) => typeof entry.eventCallback === 'function');
  assert(lifecycle, 'custom-period runtime registered no checkout lifecycle callback');
  lifecycle.eventCallback({ name: 'checkout.closed' });
  clickToggle(window);
  await tick(window, 4);
  buyButton(window, 'pro').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick(window, 8);
  assert(
    paddle.opened[1]?.items[0]?.priceId === 'pri_custom_yearly',
    `annual runtime ignored data-checkout-alternate-period: ${JSON.stringify(paddle.opened[1])}`,
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

check('one usable price enables only its tier and period', async (JSDOM, plant) => {
  const window = await openPage(JSDOM, {
    html: 'pricing.html',
    url: PRICING_URL,
    config: partiallyConfigured,
    scripts: PRICING_SCRIPTS,
    plant,
    beforeScripts: installPaddle,
  });

  const proButton = buyButton(window, 'pro');
  assert(
    proButton.getAttribute('aria-disabled') === 'false',
    'the sole configured monthly price did not enable the Pro button',
  );
  assert(
    buyButton(window, 'enterprise').getAttribute('aria-disabled') === 'true',
    'an unconfigured Enterprise price left its button live',
  );

  clickToggle(window);
  await tick(window, 6);

  assert(
    proButton.getAttribute('aria-disabled') === 'true',
    'switching to a period with no price id left the Pro button live',
  );
  assert(
    noteText(window, proButton).text.includes('yearly'),
    `the toggled reason does not name the period: "${noteText(window, proButton).text}"`,
  );
});

// ── success page ─────────────────────────────────────────────────────

function successPage(
  JSDOM,
  {
    query,
    responses,
    plant,
    clipboard,
    claim = CLAIM_SECRET,
    clockStep = 0,
    hung = false,
    config = configured,
  },
) {
  const calls = [];
  return openPage(JSDOM, {
    html: 'success.html',
    url: `${SUCCESS_URL}${query}`,
    config,
    scripts: ['main.js', 'success.js'],
    plant,
    clockStep,
    beforeScripts: (window) => {
      if (claim) window.sessionStorage.setItem(CLAIM_STORAGE_KEY, claim);
      window.fetch = (url, init) => {
        calls.push({ url, init });
        return new Promise((resolve, reject) => {
          const next = responses[Math.min(calls.length - 1, responses.length - 1)];
          if (hung) {
            // A hung connection: never answers unless the page's own
            // AbortController fires, exactly as a stalled socket behaves.
            if (init && init.signal) {
              init.signal.addEventListener('abort', () => {
                reject(
                  Object.assign(new Error('The operation was aborted.'), {
                    name: 'AbortError',
                  }),
                );
              });
            }
            return;
          }
          resolve({
            ok: next.status >= 200 && next.status < 300,
            status: next.status,
            json: () => Promise.resolve(next.body),
          });
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
    clockStep: 250,
  });
  await tick(window, 12, 250);
  await tick(window, 12, 250);

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
  await tick(window, 60, 9000);

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

check('recovery copy never turns the transaction id into an identity', async (JSDOM, plant) => {
  const html = readSite('success.html', plant);
  assert(
    !/we will send your key/i.test(html),
    'the success page promises to send a key to whoever writes in the transaction id',
  );
  assert(
    !/hand it over against the transaction id/i.test(html),
    'the success page says support hands keys over against the transaction id',
  );

  const { window, calls } = await successPage(JSDOM, {
    query: '?_ptxn=txn_01hv8example',
    responses: [{ status: 200, body: issuedBody }],
    plant,
    claim: null,
  });
  await tick(window, 10);

  assert(calls.length === 0, 'a browser holding only the transaction id made claim requests');
  const text = window.document.getElementById('checkout-problem-text').textContent.trim();
  assert(
    /paddle/i.test(text),
    `the recovery explanation does not name Paddle-identity verification: "${text}"`,
  );
  assert(
    /(on its own|alone|not enough|not proof of payment)/i.test(text),
    `the recovery explanation does not say the transaction id is insufficient: "${text}"`,
  );
  assert(
    !/we will send your key/i.test(text),
    `the recovery explanation promises key release against the transaction id: "${text}"`,
  );
});

check('the success page claims nothing before the server issues the key', async (JSDOM, plant) => {
  const html = readSite('success.html', plant);
  assert(
    !/(subscription is active|payment is unaffected|subscription is real|payment went through)/i.test(
      html,
    ),
    'the success page claims payment or activation it has not verified',
  );

  const { window, calls } = await successPage(JSDOM, {
    query: '?_ptxn=txn_01hv8waiting',
    responses: [{ status: 202, body: { status: 'pending', retryAfterMs: 5000 } }],
    plant,
    clockStep: 1000,
  });
  await tick(window, 1, 1000);

  assert(calls.length === 1, `a still-pending claim made ${calls.length} requests`);
  assert(
    !panel(window, 'checkout-waiting').hidden,
    'the waiting panel hid before any issued response',
  );
  const waiting = panel(window, 'checkout-waiting').textContent;
  assert(
    !/(payment went through|subscription is active|subscription is real|confirmed)/i.test(waiting),
    `the waiting panel claims a success nobody confirmed: "${waiting.trim()}"`,
  );
  assert(
    /licence service|checking|confirm/i.test(waiting),
    'the waiting panel does not say what the page is doing',
  );
});

check(
  'pricing tiers, credits, and features match the shared source of truth',
  async (JSDOM, plant) => {
    const tiersPath = path.join(repoRoot, 'packages', 'shared', 'src', 'constants', 'tiers.ts');
    let tiersSource;
    try {
      tiersSource = readFileSync(tiersPath, 'utf8');
    } catch {
      throw new Blocked('packages/shared/src/constants/tiers.ts is missing');
    }

    const credits = {};
    for (const match of tiersSource.matchAll(/\[SubscriptionTier\.(\w+)\]:\s*([\d_]+)/g)) {
      credits[match[1]] = Number(match[2].replace(/_/g, ''));
    }
    assert(
      credits.Free === 0 && credits.Pro === 500000 && credits.Enterprise === 2000000,
      `the shared credit table changed under this gate: ${JSON.stringify(credits)}`,
    );

    // Feature matrix, derived from the same file the cards must obey.
    const matrix = {};
    for (const match of tiersSource.matchAll(/\[SubscriptionTier\.(\w+)\]:\s*\{([^}]*)\}/g)) {
      matrix[match[1]] = {
        managedTts: /managedTts:\s*true/.test(match[2]),
        premiumVoices: /premiumVoices:\s*true/.test(match[2]),
        prioritySupport: /prioritySupport:\s*true/.test(match[2]),
      };
    }
    assert(
      matrix.Free && matrix.Pro && matrix.Enterprise,
      `the shared feature matrix changed under this gate: ${JSON.stringify(matrix)}`,
    );
    assert(
      matrix.Free.managedTts === false &&
        matrix.Pro.managedTts === true &&
        matrix.Enterprise.prioritySupport === true,
      'the shared feature matrix no longer matches the product the site describes',
    );

    const pages = {
      'pricing.html': readSite('pricing.html', plant),
      'index.html': readSite('index.html', plant),
      'terms.html': readSite('terms.html', plant),
      'privacy.html': readSite('privacy.html', plant),
      'legal/terms.html': readSite('packages/legal/terms.html', plant),
    };

    const pricing = pages['pricing.html'];
    for (const tier of ['Free', 'Pro', 'Enterprise']) {
      assert(pricing.includes(tier), `pricing.html no longer names the ${tier} tier`);
    }
    for (const forbidden of [
      'Basic',
      'Multilingual',
      'Team',
      '$19.99',
      '100K',
      '300K',
      '100,000',
      '300,000',
      'MP3',
      'cloud sync',
      'PDF',
      'rollover',
      'free trial',
      '7-day',
      '7-day grace',
      'browser TTS',
      'Browser TTS',
      'built-in TTS',
      'browser-native',
      'built-in',
      'Google Cloud',
    ]) {
      for (const [name, source] of Object.entries(pages)) {
        assert(!source.includes(forbidden), `${name} still promises "${forbidden}"`);
      }
    }
    for (const [tier, volume] of Object.entries(credits)) {
      if (tier === 'Free') continue;
      const formatted = volume.toLocaleString('en-US');
      for (const name of ['pricing.html', 'index.html', 'legal/terms.html']) {
        assert(
          pages[name].includes(formatted),
          `${name} does not advertise the ${tier} allocation of ${formatted}`,
        );
      }
    }

    // The authoritative legal document names the real tiers and carries the
    // version/effective-date treatment its README requires.
    const legal = pages['legal/terms.html'];
    assert(legal.includes('Version 2.0'), 'the authoritative terms no longer carry a version');
    assert(
      /<time datetime="20\d\d-\d\d-\d\d">September/.test(legal) ||
        legal.includes('Previous versions'),
      'the authoritative terms lost their effective-date or previous-version treatment',
    );

    // Per-card feature truth on both pages that show cards: a tier must claim
    // exactly the features its matrix row grants, and deny exactly the ones it
    // does not — a check-marked claim on the Free card is the near-miss this
    // assertion exists to catch.
    for (const page of ['pricing.html', 'index.html']) {
      const window = await openPage(JSDOM, {
        html: page,
        url: page === 'pricing.html' ? PRICING_URL : 'https://proso.com.br/',
        config: page === 'pricing.html' ? configured : undefined,
        scripts: ['main.js'],
        plant,
      });
      const cards = Array.from(window.document.querySelectorAll('.pricing-card')).map((card) => ({
        name: (card.querySelector('.pricing-card__name')?.textContent || '').trim(),
        node: card,
      }));
      const byName = Object.fromEntries(cards.map((card) => [card.name, card.node]));
      assert(
        byName.Free && byName.Pro && byName.Enterprise,
        `${page} cards are ${Object.keys(byName).join(', ')}`,
      );
      const featureState = (card, text) => {
        let claimed = false;
        let denied = false;
        for (const line of card.querySelectorAll('li')) {
          const label = line.textContent || '';
          if (!label.includes(text)) continue;
          if (line.querySelector('.pricing-card__check')) claimed = true;
          else if (line.querySelector('.pricing-card__dash')) denied = true;
          else claimed = true;
        }
        return { claimed, denied };
      };
      for (const [tier, features] of Object.entries(matrix)) {
        for (const [label, key] of [
          ['Managed voices', 'managedTts'],
          ['Premium voices', 'premiumVoices'],
          ['Priority support', 'prioritySupport'],
        ]) {
          const state = featureState(byName[tier], label);
          assert(
            state.claimed === features[key] && state.denied === !features[key],
            `${page} ${tier} card ${features[key] ? 'lost' : 'claims'} ${label.toLowerCase()}`,
          );
        }
      }
    }

    const pricingWindow = await openPage(JSDOM, {
      html: 'pricing.html',
      url: PRICING_URL,
      config: configured,
      scripts: ['main.js'],
      plant,
    });
    const byName = Object.fromEntries(
      Array.from(pricingWindow.document.querySelectorAll('.pricing-card')).map((card) => [
        (card.querySelector('.pricing-card__name')?.textContent || '').trim(),
        card.textContent || '',
      ]),
    );
    assert(byName.Free.includes('$0'), 'the Free card is not free');
    assert(byName.Pro.includes('$4.99'), 'the Pro card does not carry the $4.99 price');
    assert(
      byName.Enterprise.includes('$14.99'),
      'the Enterprise card does not carry the $14.99 price',
    );
  },
);

check(
  'install controls name the Firefox signing wait and link nowhere private',
  async (JSDOM, plant) => {
    for (const page of [
      'index.html',
      'pricing.html',
      'success.html',
      'privacy.html',
      'terms.html',
    ]) {
      const source = readSite(page, plant);
      assert(!/github\.com/i.test(source), `${page} still links github.com`);
    }

    const indexHtml = readSite('index.html', plant);
    let extensionPkg;
    try {
      extensionPkg = JSON.parse(
        readFileSync(path.join(repoRoot, 'packages', 'extension', 'package.json'), 'utf8'),
      );
    } catch {
      throw new Blocked('packages/extension/package.json is missing');
    }
    assert(
      indexHtml.includes(`"softwareVersion": "${extensionPkg.version}"`),
      `JSON-LD does not advertise the extension's real version ${extensionPkg.version}`,
    );
    assert(!indexHtml.includes('"downloadUrl"'), 'JSON-LD still offers a download it cannot serve');

    const window = await openPage(JSDOM, {
      html: 'index.html',
      url: 'https://proso.com.br/',
      config: undefined,
      scripts: ['main.js'],
      plant,
    });
    const installs = Array.from(window.document.querySelectorAll('a.btn, a[class*="btn"]')).filter(
      (link) => /install/i.test(link.textContent || ''),
    );
    assert(installs.length > 0, 'the landing page has no install control to check');
    for (const link of installs) {
      const href = link.getAttribute('href') || '';
      assert(
        !/^https?:\/\//i.test(href),
        `an install control still navigates away from the site: "${href}"`,
      );
    }

    const status = window.document.getElementById('install-status');
    assert(status, 'the landing page has no install-status section');
    const statusText = status.textContent || '';
    assert(
      /AMO|Mozilla|signing/i.test(statusText),
      `the install status does not name the Firefox signing wait: "${statusText.trim()}"`,
    );
  },
);

check('a pending retry delay is clamped to a safe floor and ceiling', async (JSDOM, plant) => {
  const source = readSite(path.join('assets', 'js', 'success.js'), plant);
  const min = Number((source.match(/MIN_RETRY_MS = (\d+)/) || [])[1]);
  const max = Number((source.match(/MAX_RETRY_MS = (\d+)/) || [])[1]);
  const fallback = Number((source.match(/DEFAULT_RETRY_MS = (\d+)/) || [])[1]);
  assert(
    min > 0 && max >= min && fallback > 0,
    'the success page does not declare sane retry bounds',
  );

  const scenarios = [
    {
      label: 'negative',
      value: -50,
      holds: (delays) => delays.length > 0 && delays.every((delay) => delay >= min),
    },
    {
      label: 'huge',
      value: 99999999,
      holds: (delays) => delays.length > 0 && delays.every((delay) => delay <= max),
    },
    {
      label: 'NaN',
      value: Number.NaN,
      holds: (delays) => delays.length > 0 && Math.min(...delays) === fallback,
    },
    {
      label: 'Infinity',
      value: Number.POSITIVE_INFINITY,
      holds: (delays) => delays.length > 0 && delays.every((delay) => delay <= max),
    },
  ];

  for (const scenario of scenarios) {
    const { window } = await successPage(JSDOM, {
      query: '?_ptxn=txn_01hv8clamp',
      responses: [{ status: 202, body: { status: 'pending', retryAfterMs: scenario.value } }],
      plant,
      clockStep: 2500,
    });
    await tick(window, 8, 2500);
    const delays = window
      .__pendingTimers()
      .filter((timer) => !timer.cleared)
      .map((timer) => timer.delay);
    assert(
      scenario.holds(delays),
      `the ${scenario.label} retry delay was not clamped: [${delays.join(', ')}]`,
    );
  }
});

check('one active checkout at a time, released only on a proved close', async (JSDOM, plant) => {
  // No provider stub up front: the load is delayed, so the window between the
  // buy click and the overlay opening is exercised — exactly the window in
  // which the billing toggle used to re-enable the controls.
  const window = await openPage(JSDOM, {
    html: 'pricing.html',
    url: PRICING_URL,
    config: configured,
    scripts: PRICING_SCRIPTS,
    plant,
  });

  const created = [];
  const originalCreate = window.document.createElement.bind(window.document);
  window.document.createElement = (tag, ...rest) => {
    const node = originalCreate(tag, ...rest);
    if (tag === 'script') created.push(node);
    return node;
  };
  const providerScripts = () => created.filter((node) => /paddle/i.test(String(node.src || '')));

  const captured = [];
  const initialised = [];
  const pro = buyButton(window, 'pro');
  const enterprise = buyButton(window, 'enterprise');

  pro.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick(window, 10);

  assert(
    providerScripts().length === 1,
    `the buy click requested ${providerScripts().length} provider scripts`,
  );
  const secretBeforeToggle = window.sessionStorage.getItem(CLAIM_STORAGE_KEY);
  assert(secretBeforeToggle, 'the buy click stored no claim secret');

  const assertInFlight = (label) => {
    for (const button of [pro, enterprise]) {
      assert(
        button.getAttribute('aria-disabled') === 'true',
        `${label}: a buy control stayed live while checkout was in flight`,
      );
      assert(
        button.classList.contains('btn--disabled'),
        `${label}: an in-flight checkout left a control looking enabled`,
      );
      const note = noteText(window, button);
      assert(
        !note.hidden && /already open/i.test(note.text),
        `${label}: an in-flight checkout announced no reason: "${note.text}"`,
      );
    }
  };

  // The PUBLIC billing toggle must not re-enable the controls while the
  // provider is still loading.
  clickToggle(window);
  await tick(window, 8);
  assertInFlight('toggle while the provider was loading');

  // The provider arrives and the overlay opens with the period the click
  // selected — the toggle that happened afterwards must not change it.
  installPaddle(window);
  window.Paddle.Initialize = (options) => initialised.push(options);
  window.Paddle.Checkout.open = (options) => captured.push(options);
  providerScripts()[0].onload();
  await tick(window, 10);

  assert(captured.length === 1, `checkout opened ${captured.length} times for one purchase intent`);
  assert(
    captured[0].items?.[0]?.priceId === configured.prices.pro.monthly,
    `the toggled period leaked into the open checkout: "${captured[0].items?.[0]?.priceId}"`,
  );

  // The lifecycle callback lives on the Initialize seam Paddle documents, not
  // on Checkout.open — a contract-conforming Paddle build must still unlock.
  assert(initialised.length === 1, 'checkout was opened without initialising the provider');
  assert(
    typeof initialised[0].eventCallback === 'function',
    'the Initialize seam registers no lifecycle callback',
  );
  assert(
    !('eventCallback' in captured[0]),
    'a lifecycle callback was passed to Checkout.open instead of the Initialize seam',
  );

  // Toggle again while the overlay is OPEN: still disabled, still announced.
  clickToggle(window);
  await tick(window, 8);
  assertInFlight('toggle while the overlay was open');

  // A second tier click while open does nothing: no second open, no second
  // provider script, no second claim secret.
  enterprise.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick(window, 10);
  assert(captured.length === 1, 'a tier click while checkout was open opened a second checkout');
  assert(
    providerScripts().length === 1,
    'a tier click while checkout was open requested another provider script',
  );
  assert(
    window.sessionStorage.getItem(CLAIM_STORAGE_KEY) === secretBeforeToggle,
    'the claim secret changed while checkout was in flight',
  );
  assert(
    captured[0].customData?.license_claim_hash === (await sha256hex(secretBeforeToggle)),
    'the stored claim secret no longer matches the digest that opened checkout',
  );

  initialised[0].eventCallback({ name: 'checkout.closed' });
  await tick(window, 10);
  for (const button of [pro, enterprise]) {
    assert(
      button.getAttribute('aria-disabled') === 'false',
      'a proved close left a buy control disabled',
    );
    assert(noteText(window, button).hidden, 'a proved close left a reason visible');
  }

  enterprise.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick(window, 10);
  assert(captured.length === 2, 'a proved checkout close did not allow the next purchase');
  const nextSecret = window.sessionStorage.getItem(CLAIM_STORAGE_KEY);
  assert(
    captured[1].customData?.license_claim_hash === (await sha256hex(nextSecret)),
    'the reopened checkout did not carry the freshly minted claim',
  );
});

check('a hung licence service cannot stall the page past its budget', async (JSDOM, plant) => {
  const { window, calls } = await successPage(JSDOM, {
    query: '?_ptxn=txn_01hv8hung',
    responses: [{ status: 202, body: { status: 'pending', retryAfterMs: 5000 } }],
    plant,
    hung: true,
    clockStep: 2000,
  });
  await tick(window, 20, 2000);

  assert(calls.length === 1, `the page made ${calls.length} requests to a hung service`);
  assert(
    !panel(window, 'checkout-problem').hidden,
    'a hung request produced no visible explanation',
  );
  const text = window.document.getElementById('checkout-problem-text').textContent.trim();
  assert(
    /did not answer/i.test(text),
    `the hung-request explanation does not say the service did not answer: "${text}"`,
  );
  assert(/commercial@proso\.com\.br/.test(text), 'the hung-request explanation offers no way out');
});

check('a failed provider load does not poison the next buy click', async (JSDOM, plant) => {
  const window = await openPage(JSDOM, {
    html: 'pricing.html',
    url: PRICING_URL,
    config: configured,
    scripts: PRICING_SCRIPTS,
    plant,
  });

  const created = [];
  const originalCreate = window.document.createElement.bind(window.document);
  window.document.createElement = (tag, ...rest) => {
    const node = originalCreate(tag, ...rest);
    // The src attribute is assigned after creation, so filtering happens at
    // assertion time, not here.
    if (tag === 'script') created.push(node);
    return node;
  };
  const providerScripts = () => created.filter((node) => /paddle/i.test(String(node.src || '')));

  const button = buyButton(window, 'pro');
  button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick(window, 10);
  assert(
    providerScripts().length === 1,
    `the buy click requested ${providerScripts().length} provider scripts`,
  );
  providerScripts()[0].onerror();
  await tick(window, 10);

  const note = noteText(window, button);
  assert(
    !note.hidden && /could not be reached/i.test(note.text),
    `the failed load states no reason: "${note.text}"`,
  );

  button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick(window, 10);
  assert(providerScripts().length === 2, 'the retry click did not fetch the provider script again');

  installPaddle(window);
  const captured = [];
  window.Paddle.Checkout.open = (options) => captured.push(options);
  providerScripts()[1].onload();
  await tick(window, 10);
  assert(captured.length === 1, 'the retry click did not open checkout once the provider loaded');
});

check(
  'a non-string configuration value disables the control with a stated reason',
  async (JSDOM, plant) => {
    const numericToken = JSON.parse(JSON.stringify(configured));
    numericToken.clientToken = 1234567890;

    let window = await openPage(JSDOM, {
      html: 'pricing.html',
      url: PRICING_URL,
      config: numericToken,
      scripts: PRICING_SCRIPTS,
      plant,
      beforeScripts: installPaddle,
    });
    let button = buyButton(window, 'pro');
    assert(
      button.getAttribute('aria-disabled') === 'true',
      'a numeric client token left the buy control live',
    );
    let note = noteText(window, button);
    assert(
      !note.hidden && note.text.includes('token'),
      `the numeric token reason was "${note.text}"`,
    );

    const numericPrice = JSON.parse(JSON.stringify(configured));
    numericPrice.prices.pro.monthly = 12345;

    window = await openPage(JSDOM, {
      html: 'pricing.html',
      url: PRICING_URL,
      config: numericPrice,
      scripts: PRICING_SCRIPTS,
      plant,
      beforeScripts: installPaddle,
    });
    button = buyButton(window, 'pro');
    assert(
      button.getAttribute('aria-disabled') === 'true',
      'a numeric price id left the buy control live',
    );
    note = noteText(window, button);
    assert(
      !note.hidden && note.text.includes('price id'),
      `the numeric price id reason was "${note.text}"`,
    );
  },
);

check('the success page stays neutral until the server issues the key', async (_JSDOM, plant) => {
  const html = readSite('success.html', plant);
  assert(
    !/<title>Your licence key/i.test(html),
    'the success page title claims a key it has not shown',
  );
  const description = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  assert(description.length > 0, 'the success page has no description');
  assert(
    !/(completed|ready|confirmed|active)/i.test(description),
    `the success-page description claims an outcome: "${description}"`,
  );
  assert(
    !html.includes('completed Paddle purchase'),
    'the success page calls the purchase completed before the server confirms it',
  );
  for (const panel of ['checkout-waiting', 'checkout-key', 'checkout-problem']) {
    assert(
      new RegExp(`id="${panel}"[^>]*hidden`).test(html),
      `the ${panel} panel is not hidden until JavaScript reveals it`,
    );
  }
  assert(/<noscript>/i.test(html), 'the success page has no no-JS fallback');
  const noScriptBlocks = html.match(/<noscript>[\s\S]*?<\/noscript>/gi) || [];
  assert(
    noScriptBlocks.some(
      (block) => /Paddle/i.test(block) && /commercial@proso\.com\.br/i.test(block),
    ),
    'the no-JS fallback is not actionable',
  );
});

check(
  'landing page CTAs read as plan navigation, and no surface advertises built-in voices',
  async (JSDOM, plant) => {
    const indexHtml = readSite('index.html', plant);
    assert(
      !/built-in/i.test(indexHtml),
      'the landing page still advertises browser-built-in voices',
    );

    const window = await openPage(JSDOM, {
      html: 'index.html',
      url: 'https://proso.com.br/',
      config: undefined,
      scripts: ['main.js'],
      plant,
    });
    const ctas = Array.from(
      window.document.querySelectorAll('#pricing-cards a[href^="pricing.html"]'),
    );
    assert(ctas.length === 2, `the landing pricing section has ${ctas.length} plan CTAs`);
    for (const cta of ctas) {
      const label = (cta.textContent || '').trim();
      assert(
        /^View .+ plan$/.test(label),
        `a landing CTA still reads like live checkout: "${label}"`,
      );
    }
  },
);

check(
  'a malformed API address disables purchase and lands visibly on the success page',
  async (JSDOM, plant) => {
    const numericUrl = JSON.parse(JSON.stringify(configured));
    numericUrl.apiBaseUrl = 12345;

    const window = await openPage(JSDOM, {
      html: 'pricing.html',
      url: PRICING_URL,
      config: numericUrl,
      scripts: PRICING_SCRIPTS,
      plant,
      beforeScripts: installPaddle,
    });
    for (const tier of ['pro', 'enterprise']) {
      const button = buyButton(window, tier);
      assert(
        button.getAttribute('aria-disabled') === 'true',
        `a numeric API address left the ${tier} buy control live`,
      );
      const note = noteText(window, button);
      assert(
        !note.hidden && /API address/i.test(note.text) && /HTTPS/i.test(note.text),
        `the numeric API address reason was "${note.text}"`,
      );
    }

    const success = await successPage(JSDOM, {
      query: '?_ptxn=txn_01hv8badurl',
      responses: [{ status: 200, body: issuedBody }],
      plant,
      config: numericUrl,
    });
    await tick(success.window, 10);
    assert(success.calls.length === 0, 'a malformed API address still produced claim requests');
    assert(
      !panel(success.window, 'checkout-problem').hidden,
      'a malformed API address produced no visible problem',
    );
    const text = success.window.document.getElementById('checkout-problem-text').textContent.trim();
    assert(/not a valid HTTPS URL/i.test(text), `the success-page reason was "${text}"`);
  },
);

function runReceipt(receiptPath, env, args = []) {
  // spawn, not execFileSync: the receipt's --live probe may target a server
  // running in THIS process, and a synchronous exec would block the event loop
  // that server needs.
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [receiptPath, ...args], { cwd: repoRoot, env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => resolve({ exitCode: code ?? 1, output: `${stdout}${stderr}` }));
    child.on('error', (error) =>
      resolve({ exitCode: 1, output: error instanceof Error ? error.message : String(error) }),
    );
  });
}

check(
  'the deploy receipt fails closed and its oracles are runnable, not greppable',
  async (_JSDOM, plant) => {
    const receiptSource = readSite('scripts/checkout-deploy-readiness.mjs', plant);
    const dir = mkdtempSync(path.join(os.tmpdir(), 'proso-receipt-'));
    const receiptPath = path.join(dir, 'checkout-deploy-readiness.mjs');
    writeFileSync(receiptPath, receiptSource);

    // Disabled configuration: PASS, and every hold is named. The shipped config
    // is read through readSite so the live-config plant (a complete config in
    // the shipped file) turns this scenario red.
    const shippedConfig = readSite(path.join('assets', 'js', 'checkout-config.js'), plant);
    const shippedFile = path.join(dir, 'checkout-shipped.js');
    writeFileSync(shippedFile, shippedConfig);
    const checkoutPage = readSite('pricing.html', plant);
    const checkoutPageFile = path.join(dir, 'pricing.html');
    writeFileSync(checkoutPageFile, checkoutPage);
    const baseEnv = {
      ...process.env,
      PROSO_CHECKOUT_CONFIG_FILE: shippedFile,
      PROSO_CHECKOUT_PAGE_FILE: checkoutPageFile,
    };

    // Disabled configuration: PASS, and every hold is named.
    const clean = await runReceipt(receiptPath, baseEnv);
    if (plant === 'catalog-drift-paid-control') {
      if (
        clean.exitCode === 1 &&
        /checkout catalog drift/i.test(clean.output) &&
        /team/i.test(clean.output)
      ) {
        throw new Error(`catalog-drift falsifier fired and named Team:\n${clean.output}`);
      }
      return;
    }
    assert(
      clean.exitCode === 0,
      `the receipt exited ${clean.exitCode} on a disabled config:\n${clean.output}`,
    );
    assert(
      /Keyforge|claim endpoint/i.test(clean.output) &&
        /wallet/i.test(clean.output) &&
        /Paddle/i.test(clean.output),
      `the receipt does not name its holds:\n${clean.output}`,
    );

    // A configuration that would enable purchase fails closed while holds are open.
    const completeConfig = readSite(path.join('assets', 'js', 'checkout-config.js'), 'live-config');
    const completeFile = path.join(dir, 'checkout-complete.js');
    writeFileSync(completeFile, completeConfig);
    const liveEnv = { ...baseEnv, PROSO_CHECKOUT_CONFIG_FILE: completeFile };
    const failClosed = await runReceipt(receiptPath, liveEnv);
    assert(
      failClosed.exitCode === 1,
      `the receipt did not fail closed with a live config and open holds:\n${failClosed.output}`,
    );

    // One valid tier/period can take money even though the full matrix is
    // incomplete. It binds every safety hold and leaves full configuration
    // OPEN; treating only a complete matrix as live is the old false-green.
    const partialFile = path.join(dir, 'checkout-partial.js');
    writeFileSync(
      partialFile,
      `window.PROSO_CHECKOUT_CONFIG = ${JSON.stringify(partiallyConfigured, null, 2)};\n`,
    );
    const partialEnv = { ...baseEnv, PROSO_CHECKOUT_CONFIG_FILE: partialFile };
    const partialFailClosed = await runReceipt(receiptPath, partialEnv);
    assert(
      partialFailClosed.exitCode === 1,
      `one usable price bypassed the readiness holds:\n${partialFailClosed.output}`,
    );
    assert(
      !/hold NOT REQUIRED .*Keyforge claim endpoint/i.test(partialFailClosed.output),
      `one usable price left the claim endpoint NOT REQUIRED:\n${partialFailClosed.output}`,
    );
    assert(
      /complete Paddle configuration/i.test(partialFailClosed.output),
      `a partial price matrix did not leave full configuration OPEN:\n${partialFailClosed.output}`,
    );

    // Comment-only fixtures must not close the oracles: a comment that quotes
    // the exact oracle pattern, or an HTML comment wrapping a fake input, proves
    // nothing — only comment-stripped source may match.
    const commentServerDir = path.join(dir, 'server-comment');
    mkdirSync(commentServerDir);
    writeFileSync(
      path.join(commentServerDir, 'planned.controller.ts'),
      '// Planned: @Post(LICENSE_BY_TRANSACTION_PATH) claimByTransaction() {}\n',
    );
    const proseExtDir = path.join(dir, 'ext-prose');
    mkdirSync(proseExtDir);
    writeFileSync(
      path.join(proseExtDir, 'settings.html'),
      '<p>No account needed.</p>\n<!-- <input id="license-key" name="licenseKey"> -->\n',
    );
    const commentEnv = {
      ...baseEnv,
      PROSO_SCAN_SERVER_DIR: commentServerDir,
      PROSO_SCAN_EXTENSION_DIR: proseExtDir,
    };
    const commentRun = await runReceipt(receiptPath, commentEnv);
    assert(
      commentRun.exitCode === 0,
      `the receipt exited ${commentRun.exitCode} on comment-only fixtures:\n${commentRun.output}`,
    );
    // While purchase is disabled the claim-endpoint hold is NOT REQUIRED, never
    // CLOSED — an unproven endpoint must not be readable as proven.
    assert(
      /hold NOT REQUIRED .*Keyforge claim endpoint/i.test(commentRun.output),
      `a disabled config printed a claim-endpoint hold that is not NOT REQUIRED:\n${commentRun.output}`,
    );
    assert(
      !/hold CLOSED .*Keyforge claim endpoint/i.test(commentRun.output),
      `a disabled config printed the claim-endpoint hold CLOSED:\n${commentRun.output}`,
    );
    assert(
      /not registered as a runnable route/.test(commentRun.output),
      `a comment closed the claim-endpoint oracle:\n${commentRun.output}`,
    );
    assert(
      /hold OPEN .*licence-key wallet/i.test(commentRun.output),
      `prose closed the wallet oracle:\n${commentRun.output}`,
    );

    // Runnable contracts close them: a real route registration and a real input.
    const routeServerDir = path.join(dir, 'server-route');
    mkdirSync(routeServerDir);
    writeFileSync(
      path.join(routeServerDir, 'license.controller.ts'),
      '@Post(LICENSE_BY_TRANSACTION_PATH)\n  claimByTransaction() {}\n',
    );
    const inputExtDir = path.join(dir, 'ext-input');
    mkdirSync(inputExtDir);
    writeFileSync(
      path.join(inputExtDir, 'settings.html'),
      '<input id="license-key" name="licenseKey" type="text">\n',
    );

    // --live: only the canonical 202 pending answer counts as deployed.
    let liveMode = 'bad';
    let probeHits = 0;
    const server = http.createServer((req, res) => {
      if (String(req.url || '').includes('by-transaction')) {
        probeHits += 1;
        if (liveMode === 'canonical') {
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'pending', retryAfterMs: 5000 }));
        } else if (liveMode === 'notfound') {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        } else {
          res.writeHead(501, { 'Content-Type': 'text/plain' });
          res.end('Not Implemented');
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const evidenceFile = path.join(dir, 'paddle-evidence.txt');
    writeFileSync(evidenceFile, 'verified by the operator\n');
    const liveEnvBoth = {
      ...liveEnv,
      PROSO_SCAN_SERVER_DIR: routeServerDir,
      PROSO_SCAN_EXTENSION_DIR: inputExtDir,
      PROSO_PROBE_URL: `http://127.0.0.1:${port}`,
      PROSO_PADDLE_EVIDENCE_FILE: evidenceFile,
    };
    const partialEnvBoth = {
      ...liveEnvBoth,
      PROSO_CHECKOUT_CONFIG_FILE: partialFile,
    };
    try {
      const bad = await runReceipt(receiptPath, liveEnvBoth, ['--live']);
      assert(bad.exitCode === 1, `a 501 live answer did not fail closed:\n${bad.output}`);
      assert(
        /claim endpoint/i.test(bad.output) && /202/.test(bad.output),
        `the non-canonical live answer does not name the canonical 202:\n${bad.output}`,
      );

      // Falsifier matrix (PROSO-40): the claim-endpoint hold is three-valued.
      // Row 1 — empty config + a 404 endpoint: exit 0, the hold reads NOT
      // REQUIRED and never CLOSED, and no probe is even sent while purchase
      // is disabled.
      liveMode = 'notfound';
      const hitsBefore = probeHits;
      const disabled404 = await runReceipt(
        receiptPath,
        { ...baseEnv, PROSO_PROBE_URL: `http://127.0.0.1:${port}` },
        ['--live'],
      );
      assert(
        disabled404.exitCode === 0,
        `empty config with a 404 endpoint exited ${disabled404.exitCode}:\n${disabled404.output}`,
      );
      assert(
        /hold NOT REQUIRED .*Keyforge claim endpoint/i.test(disabled404.output),
        `empty config + 404 did not print the endpoint hold NOT REQUIRED:\n${disabled404.output}`,
      );
      assert(
        !/hold CLOSED .*Keyforge claim endpoint/i.test(disabled404.output),
        `empty config + 404 printed the endpoint hold CLOSED:\n${disabled404.output}`,
      );
      assert(
        /complete the staged configuration and run with --live/i.test(disabled404.output),
        `disabled output implies --live alone probes the endpoint:\n${disabled404.output}`,
      );
      assert(probeHits === hitsBefore, 'a --live probe was sent while purchase is disabled');

      // Row 2 — one usable price + a 404 endpoint: exit 1, the endpoint is
      // required and the probe is sent even though the full matrix is OPEN.
      const hitsBeforePartial = probeHits;
      const partial404 = await runReceipt(receiptPath, partialEnvBoth, ['--live']);
      assert(
        partial404.exitCode === 1,
        `partial config with a usable price did not fail closed:\n${partial404.output}`,
      );
      assert(
        !/hold NOT REQUIRED .*Keyforge claim endpoint/i.test(partial404.output) &&
          /claim endpoint/i.test(partial404.output) &&
          /404/.test(partial404.output),
        `partial config did not bind the failed claim-endpoint probe:\n${partial404.output}`,
      );
      assert(
        probeHits === hitsBeforePartial + 1,
        'one usable price did not trigger the live probe',
      );

      // Row 3 — complete config + a 404 endpoint: exit 1, the hold stays OPEN.
      const complete404 = await runReceipt(receiptPath, liveEnvBoth, ['--live']);
      assert(
        complete404.exitCode === 1,
        `complete config with a 404 endpoint did not fail closed:\n${complete404.output}`,
      );
      assert(
        /claim endpoint/i.test(complete404.output) && /404/.test(complete404.output),
        `the 404 failure does not name the endpoint and its answer:\n${complete404.output}`,
      );

      // Row 4 — complete config + the canonical 202: exit 0 and the hold is
      // printed CLOSED with the proven answer.
      liveMode = 'canonical';
      const good = await runReceipt(receiptPath, liveEnvBoth, ['--live']);
      assert(good.exitCode === 0, `a canonical live answer did not pass:\n${good.output}`);
      assert(
        /hold CLOSED .*Keyforge claim endpoint/i.test(good.output) &&
          /canonical 202/.test(good.output),
        `a proven endpoint did not print the hold CLOSED with its proof:\n${good.output}`,
      );

      // Without the operator's Paddle evidence, even a proven endpoint and a
      // complete config must fail closed.
      const noEvidence = await runReceipt(
        receiptPath,
        { ...liveEnvBoth, PROSO_PADDLE_EVIDENCE_FILE: '' },
        ['--live'],
      );
      assert(
        noEvidence.exitCode === 1,
        `missing Paddle evidence did not fail closed:\n${noEvidence.output}`,
      );
      assert(
        /Paddle evidence/i.test(noEvidence.output),
        `the missing-evidence failure does not name the evidence hold:\n${noEvidence.output}`,
      );
    } finally {
      server.close();
    }
  },
);

check('runtime controls and selectable periods match the readiness catalog', async () => {
  const source = readSite(path.join('assets', 'js', 'checkout-config.js'));
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const catalog = sandbox.window.PROSO_CHECKOUT_CONFIG?.catalog;
  assert(catalog, 'checkout-config.js does not declare the canonical catalog');

  const pricing = readSite('pricing.html');
  const tiers = Array.from(
    pricing.matchAll(/\bdata-checkout-tier\s*=\s*["']([^"']+)["']/g),
    (match) => match[1],
  );
  assert(
    JSON.stringify(tiers) === JSON.stringify(Array.from(catalog.tiers)),
    `runtime paid controls ${JSON.stringify(tiers)} drift from readiness catalog ${JSON.stringify(Array.from(catalog.tiers))}`,
  );
  const periods = Array.from(
    pricing.matchAll(/\bdata-checkout-(?:alternate-)?period\s*=\s*["']([^"']+)["']/g),
    (match) => match[1],
  );
  assert(
    JSON.stringify(periods) === JSON.stringify(Array.from(catalog.periods)),
    `runtime periods ${JSON.stringify(periods)} drift from readiness catalog ${JSON.stringify(Array.from(catalog.periods))}`,
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
    // Explicit exit: a jsdom page that runs a recurring animation (the landing
    // page's hero highlight loop) would otherwise keep the Node process alive
    // forever after the verdict is printed.
    process.exit(failed.length === 0 ? 0 : 1);
  }

  // Plant mode: every planted break must turn at least one check red. A plant
  // that leaves the gate green means the gate is not testing what it claims.
  const clean = await runChecks(null);
  if (clean.some((result) => !result.ok)) {
    process.stdout.write('checkout-surface-gate CRASH: the clean run is already failing\n');
    process.exit(1);
  }

  // Self-check: an HTML plant must reach the DOM actor, not just the source
  // greps. If a planted label is invisible to the jsdom page, plant mode is
  // blind to DOM-only regressions and must crash rather than report green.
  {
    const JSDOM = await loadJsdom();
    const plantedWindow = await openPage(JSDOM, {
      html: 'index.html',
      url: 'https://proso.com.br/',
      config: undefined,
      scripts: ['main.js'],
      plant: 'subscribe-links',
    });
    const plantedLabels = Array.from(
      plantedWindow.document.querySelectorAll('#pricing-cards a[href^="pricing.html"]'),
    ).map((cta) => (cta.textContent || '').trim());
    if (!plantedLabels.some((label) => /subscribe/i.test(label))) {
      process.stdout.write(
        'checkout-surface-plants CRASH: an HTML plant did not reach the DOM actor\n',
      );
      process.exit(1);
    }
  }

  let survivors = 0;
  for (const [id, plant] of Object.entries(PLANTS)) {
    const results = await runChecks(id);
    const failures = results.filter((result) => !result.ok);
    const caught = plant.mustFailCheck
      ? failures.filter(
          (result) =>
            result.name === plant.mustFailCheck && plant.mustFailMessage.test(result.message),
        )
      : failures;
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
  process.exit(survivors === 0 ? 0 : 1);
}

main().catch((error) => {
  const blocked = error instanceof Blocked;
  process.stderr.write(
    `\ncheckout-surface-gate ${blocked ? 'BLOCKED' : 'CRASH'}: ${error.message}\n`,
  );
  process.exit(blocked ? 2 : 1);
});
