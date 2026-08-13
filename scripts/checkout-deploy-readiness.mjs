/**
 * `make checkout-deploy-readiness` — the fail-closed gate between this
 * repository and taking money.
 *
 * The purchase surface may only be live when every dependency it cannot fake
 * is real. The three holds:
 *
 *   1. The licence-claim endpoint (POST /api/v1/license/by-transaction,
 *      LICENSE_BY_TRANSACTION_PATH in @proso/shared) must be registered in the
 *      server code that is deployed — without it, money can be taken and no
 *      key can ever be minted.
 *   2. The extension must ship the licence-key field (the "wallet") the buyer
 *      pastes the key into — without it, an issued key has nowhere to go.
 *   3. The Paddle configuration must be complete and well-formed — a
 *      client-side token matching the declared environment and a price id for
 *      every tier and billing period in the canonical checkout catalog, each
 *      starting with `pri_` — plus
 *      independent Paddle evidence that the values are real, which only the
 *      operator who verified checkout end to end can supply.
 *
 * A site whose configuration cannot enable any buy control is SAFE: its buy
 * controls render disabled and state why, so deploying the page cannot take
 * money. As soon as the shared token/API fields and any one tier/period price
 * are usable, purchase could go live and every safety hold binds. A missing
 * price elsewhere keeps the complete-configuration hold OPEN; it never makes
 * an already-usable buy control safe.
 *
 * The oracles are runnable, not greppable:
 *   - the claim-endpoint oracle looks for an actual NestJS `@Post` route
 *     registration on the shared path, on comment-stripped source — a comment
 *     mentioning the route proves nothing;
 *   - the wallet oracle looks for an actual `<input>` element bound to a
 *     licence-key setting in the extension entrypoints, on comment-stripped
 *     source — prose mentioning a licence key proves nothing;
 *   - with `--live`, the claim endpoint must answer the canonical
 *     202 `{ status: 'pending', retryAfterMs }` body. Any other code — 404,
 *     500, 501 — leaves the hold open.
 *
 * The claim-endpoint hold is three-valued. While purchase is disabled the
 * hold is NOT REQUIRED: the site cannot take money, nothing needs live proof,
 * and no `--live` probe is sent — registration is printed as information
 * only. Once any tier/period is configured well enough to enable purchase,
 * the hold binds: CLOSED only for a registered route that answered the canonical
 * 202, OPEN otherwise. A hold that is merely not required is never printed
 * CLOSED, so an operator cannot read a 404 as proof that the money path is
 * proven.
 *
 * Honest limits: this script observes the repository (and, with `--live`, the
 * configured API), not the Paddle account. "Paddle evidence" — a checkout
 * completed end to end against the configured Paddle values — is surfaced in
 * every verdict and becomes a binding hold once purchase can be enabled; no
 * script in this repository can supply it, and nothing here fakes it.
 *
 * The same config object declares the canonical catalog consumed by checkout.js.
 * Readiness also scans the shipped pricing controls and selectable billing
 * states; a paid control/period outside that catalog is a named blocking drift.
 *
 * Test seams (used by the checkout-surface gate): PROSO_CHECKOUT_CONFIG_FILE,
 * PROSO_CHECKOUT_PAGE_FILE, PROSO_SCAN_SERVER_DIR, PROSO_SCAN_EXTENSION_DIR,
 * and PROSO_PROBE_URL override the corresponding inputs.
 *
 * @module scripts/checkout-deploy-readiness
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const configFile =
  process.env.PROSO_CHECKOUT_CONFIG_FILE ??
  path.join(repoRoot, 'packages', 'site', 'assets', 'js', 'checkout-config.js');
const checkoutPageFile =
  process.env.PROSO_CHECKOUT_PAGE_FILE ?? path.join(repoRoot, 'packages', 'site', 'pricing.html');
const serverSrcDir =
  process.env.PROSO_SCAN_SERVER_DIR ?? path.join(repoRoot, 'packages', 'server', 'src');
const extensionEntrypointsDir =
  process.env.PROSO_SCAN_EXTENSION_DIR ??
  path.join(repoRoot, 'packages', 'extension', 'src', 'entrypoints');

const TOKEN_PREFIX = { sandbox: 'test_', production: 'live_' };
const LICENSE_BY_TRANSACTION_PATH = '/api/v1/license/by-transaction';

// OpenGrep misparses the literal HTML-comment token, so the equivalent
// constructor keeps its fail-closed changed-file scan runnable.
// biome-ignore lint/complexity/useRegexLiterals: required for OpenGrep parser compatibility.
const HTML_COMMENT_PATTERN = new RegExp('<!--[\\s\\S]*?-->', 'g');

/**
 * The operator's attestation that a checkout completed end to end against the
 * configured Paddle account. The script cannot verify Paddle from here, so it
 * requires a nonempty file the operator wrote — never a repo file, never
 * generated. Absent or empty, the hold is open.
 */
function paddleEvidencePresent() {
  const file = process.env.PROSO_PADDLE_EVIDENCE_FILE ?? '';
  return file.length > 0 && existsSync(file) && statSync(file).size > 0;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(HTML_COMMENT_PATTERN, '')
    .replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
}

function loadConfig() {
  const source = readFileSync(configFile, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.window.PROSO_CHECKOUT_CONFIG || null;
}

function catalogStatus(config) {
  const catalog = config && config.catalog;
  const tiers = catalog && Array.isArray(catalog.tiers) ? Array.from(catalog.tiers) : [];
  const periods = catalog && Array.isArray(catalog.periods) ? Array.from(catalog.periods) : [];
  const valid = (values) =>
    values.length > 0 &&
    new Set(values).size === values.length &&
    values.every((value) => typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value));

  if (!valid(tiers))
    return { valid: false, tiers, periods, reason: 'catalog tiers are missing or malformed' };
  if (!valid(periods)) {
    return { valid: false, tiers, periods, reason: 'catalog periods are missing or malformed' };
  }
  return { valid: true, tiers, periods, reason: 'canonical checkout catalog is well-formed' };
}

function runtimeCatalogDrift(catalog) {
  let source;
  try {
    source = stripComments(readFileSync(checkoutPageFile, 'utf8'));
  } catch {
    return `checkout catalog drift: pricing page is missing at ${checkoutPageFile}`;
  }

  const controls = Array.from(
    source.matchAll(/\bdata-checkout-tier=["']([^"']+)["']/g),
    (match) => match[1],
  );
  const unknownTier = controls.find((tier) => !catalog.tiers.includes(tier));
  if (unknownTier) {
    return `checkout catalog drift: paid control tier "${unknownTier}" is not enumerated by readiness`;
  }
  const duplicateTier = controls.find((tier, index) => controls.indexOf(tier) !== index);
  if (duplicateTier) {
    return `checkout catalog drift: paid control tier "${duplicateTier}" appears more than once`;
  }
  const missingTier = catalog.tiers.find((tier) => !controls.includes(tier));
  if (missingTier) {
    return `checkout catalog drift: catalog tier "${missingTier}" has no shipped paid control`;
  }

  const selectablePeriods = new Set(
    Array.from(
      source.matchAll(/\bdata-checkout-(?:alternate-)?period=["']([^"']+)["']/g),
      (match) => match[1],
    ),
  );
  const unknownPeriod = Array.from(selectablePeriods).find(
    (period) => !catalog.periods.includes(period),
  );
  if (unknownPeriod) {
    return `checkout catalog drift: selectable period "${unknownPeriod}" is not enumerated by readiness`;
  }
  const missingPeriod = catalog.periods.find((period) => !selectablePeriods.has(period));
  if (missingPeriod) {
    return `checkout catalog drift: catalog period "${missingPeriod}" is not selectable by the runtime`;
  }
  return null;
}

/** Walk a directory and test comment-stripped file contents. */
function scanDir(dir, pattern) {
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (scanDir(full, pattern)) return true;
    } else if (/\.(ts|html|js)$/.test(entry)) {
      if (pattern.test(stripComments(readFileSync(full, 'utf8')))) return true;
    }
  }
  return false;
}

/**
 * The claim-endpoint oracle: a real route registration. A NestJS controller
 * registers the shared path either with the imported constant or as a literal;
 * a comment mentioning the route matches neither, because comments are
 * stripped before the scan.
 */
function claimEndpointRegistered() {
  return scanDir(
    serverSrcDir,
    /@Post\(\s*(?:LICENSE_BY_TRANSACTION_PATH|['"][^'"]*by-transaction['"])/,
  );
}

/**
 * The wallet oracle: a real input control bound to the licence-key setting in
 * the extension's own UI. Prose that mentions a licence key does not match,
 * because an input element is required and HTML comments are stripped.
 */
function walletFieldPresent() {
  return scanDir(
    extensionEntrypointsDir,
    /<input\b[^>]*(?:id|name|data-config-key|aria-label)=["'][^"']*licen[cs]e[^"']*["'][^>]*>/i,
  );
}

/**
 * Report both full catalog completeness and whether any buy control could
 * enable. The shared fields and each price use the same structural rules as
 * checkout.js; one usable price is enough for a visitor to buy, even when a
 * different tier/period is missing.
 */
function configStatus(config) {
  if (!config) {
    return {
      complete: false,
      canEnablePurchase: false,
      reason: 'checkout-config.js did not load',
    };
  }

  const catalog = catalogStatus(config);
  if (!catalog.valid) {
    return {
      complete: false,
      canEnablePurchase: false,
      contractError: `checkout catalog drift: ${catalog.reason}`,
      reason: catalog.reason,
    };
  }
  const drift = runtimeCatalogDrift(catalog);
  if (drift) {
    return { complete: false, canEnablePurchase: false, contractError: drift, reason: drift };
  }

  const expectedPrefix = TOKEN_PREFIX[config.environment];
  if (!expectedPrefix) {
    return {
      complete: false,
      canEnablePurchase: false,
      reason: `unknown environment "${config.environment}"`,
    };
  }

  if (typeof config.clientToken !== 'string' || config.clientToken.length === 0) {
    return { complete: false, canEnablePurchase: false, reason: 'the client-side token is empty' };
  }
  if (!config.clientToken.startsWith(expectedPrefix)) {
    return {
      complete: false,
      canEnablePurchase: false,
      reason: `the client-side token does not start with "${expectedPrefix}" for the ${config.environment} environment`,
    };
  }

  if (typeof config.apiBaseUrl !== 'string' || !/^https:\/\//i.test(config.apiBaseUrl)) {
    return {
      complete: false,
      canEnablePurchase: false,
      reason: 'the API address is not a valid HTTPS URL',
    };
  }

  const prices = config.prices || {};
  const canEnablePurchase = catalog.tiers.some((tier) =>
    catalog.periods.some((period) => {
      const priceId = (prices[tier] || {})[period];
      return typeof priceId === 'string' && priceId.startsWith('pri_');
    }),
  );

  for (const tier of catalog.tiers) {
    const tierPrices = prices[tier] || {};
    for (const period of catalog.periods) {
      const priceId = tierPrices[period];
      if (typeof priceId !== 'string' || priceId.length === 0) {
        return {
          complete: false,
          canEnablePurchase,
          reason: `the ${period} price id for the ${tier} tier is empty`,
        };
      }
      if (!priceId.startsWith('pri_')) {
        return {
          complete: false,
          canEnablePurchase,
          reason: `the ${period} price id for the ${tier} tier does not start with "pri_"`,
        };
      }
    }
  }

  return {
    complete: true,
    canEnablePurchase: true,
    reason: 'token, API address, and every tier/period price id present and well-formed',
  };
}

/**
 * A live probe is evidence only when the endpoint answers the canonical
 * pending contract: HTTP 202 with a `pending` body whose `retryAfterMs` is a
 * positive integer. Any other code or shape — 404, 500, 501, an HTML error
 * page — leaves the hold open.
 */
async function liveClaimEndpointProbe(probeUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(probeUrl.replace(/\/+$/, '') + LICENSE_BY_TRANSACTION_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: 'proso-deploy-readiness-probe', claimSecret: 'probe' }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (response.status !== 202) {
      return {
        deployed: false,
        detail: `answered HTTP ${response.status}, expected the canonical 202`,
      };
    }
    const body = await response.json();
    const canonical =
      body &&
      body.status === 'pending' &&
      Number.isInteger(body.retryAfterMs) &&
      body.retryAfterMs > 0;
    if (!canonical) {
      return {
        deployed: false,
        detail: `answered 202 with a non-canonical body: ${JSON.stringify(body)}`,
      };
    }
    return { deployed: true, detail: 'answered the canonical 202 pending contract' };
  } catch (error) {
    return {
      deployed: false,
      detail: `unreachable or unanswered (${error instanceof Error ? error.message : String(error)})`,
    };
  }
}

async function main() {
  const config = loadConfig();
  const status = configStatus(config);
  const purchaseCanEnable = status.canEnablePurchase;
  const live = process.argv.includes('--live');

  // Catalog drift is a broken oracle, not a safely disabled checkout. Fail
  // before any live probe: otherwise an added control could sit outside the
  // hold boundary while the receipt misleadingly reports a safe deployment.
  if (status.contractError) {
    process.stderr.write(`checkout-deploy-readiness FAIL: ${status.contractError}\n`);
    process.stderr.write('Stop the deploy until runtime and readiness use the same catalog.\n');
    process.exit(1);
  }

  const registered = claimEndpointRegistered();
  let probe = { deployed: false, detail: '' };
  // The live probe exists to prove a deployment hold. While purchase is
  // disabled there is nothing to prove: probing would only produce noise, and
  // a 404 answer must never appear next to a closed-looking hold.
  if (live && purchaseCanEnable) {
    const probeUrl = process.env.PROSO_PROBE_URL ?? (config ? config.apiBaseUrl : '');
    if (!probeUrl) {
      probe = { deployed: false, detail: 'no API address to probe' };
    } else {
      probe = await liveClaimEndpointProbe(probeUrl);
    }
  }

  // The claim-endpoint hold is three-valued: NOT REQUIRED while no buy
  // control can enable, OPEN while any purchase is possible but the endpoint
  // is unproven, CLOSED only for a registered route that answered the
  // canonical 202 pending contract.
  let endpointState;
  let endpointHow;
  if (!purchaseCanEnable) {
    endpointState = 'NOT REQUIRED';
    endpointHow =
      'purchase is disabled, so the site cannot take money and no live proof is needed; ' +
      `informational: ${registered ? 'registered' : 'not registered'} as a runnable route in server sources — ` +
      'it must be registered and answer the canonical 202 before purchase can go live';
  } else if (!registered) {
    endpointState = 'OPEN';
    endpointHow =
      'not registered as a runnable route in server sources — money could be taken and no key could ever be minted';
  } else if (!probe.deployed) {
    endpointState = 'OPEN';
    endpointHow = live
      ? probe.detail
      : 'registered in server sources, but deployment is unproven — run with --live to probe the canonical answer';
  } else {
    endpointState = 'CLOSED';
    endpointHow = probe.detail;
  }

  const holds = [
    {
      name: 'Keyforge claim endpoint (POST /api/v1/license/by-transaction)',
      state: endpointState,
      how: endpointHow,
    },
    {
      name: 'licence-key wallet field in the extension',
      state: walletFieldPresent() ? 'CLOSED' : 'OPEN',
      how: 'the entrypoints must contain a real licence-key input control so an issued key has somewhere to go',
    },
    {
      name: 'complete Paddle configuration',
      state: status.complete ? 'CLOSED' : 'OPEN',
      how: status.reason,
    },
  ];
  if (purchaseCanEnable) {
    holds.push({
      name: 'independent Paddle evidence',
      state: paddleEvidencePresent() ? 'CLOSED' : 'OPEN',
      how: 'the operator who verified a checkout end to end against the configured Paddle account must point PROSO_PADDLE_EVIDENCE_FILE at their attestation',
    });
  }

  const openHolds = holds.filter((hold) => hold.state === 'OPEN');

  const operatorChecks = [];
  if (!purchaseCanEnable) {
    operatorChecks.push(
      'before enabling purchase, complete the staged configuration and run with --live to prove the deployed claim endpoint answers the canonical 202',
      'Paddle evidence: before enabling purchase, a checkout must complete end to end against the configured Paddle values, verified by the operator who holds the Paddle account (PROSO_PADDLE_EVIDENCE_FILE)',
    );
  }

  if (!purchaseCanEnable) {
    process.stdout.write(
      'checkout-deploy-readiness PASS (purchase disabled): the buy controls render inert, so the site can deploy without taking money.\n',
    );
    for (const hold of holds) {
      process.stdout.write(`  hold ${hold.state.padEnd(11)} ${hold.name} — ${hold.how}\n`);
    }
    for (const checkLine of operatorChecks) {
      process.stdout.write(`  operator check: ${checkLine}\n`);
    }
    process.exit(0);
  }

  if (openHolds.length === 0) {
    process.stdout.write(
      'checkout-deploy-readiness PASS (purchase enabled): every hold is closed.\n',
    );
    for (const hold of holds) {
      process.stdout.write(`  hold ${hold.state.padEnd(11)} ${hold.name} — ${hold.how}\n`);
    }
    for (const checkLine of operatorChecks) {
      process.stdout.write(`  operator check: ${checkLine}\n`);
    }
    process.exit(0);
  }

  process.stderr.write(
    'checkout-deploy-readiness FAIL: the configuration would enable purchase while holds are open:\n',
  );
  for (const hold of openHolds) {
    process.stderr.write(`  ${hold.name} — ${hold.how}\n`);
  }
  process.stderr.write('Stop the deploy until every hold is closed.\n');
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(
    `checkout-deploy-readiness CRASH: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
