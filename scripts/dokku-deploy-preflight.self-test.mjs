#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
//
// Deterministic fake-boundary plant suite for scripts/dokku-deploy-preflight.mjs.
//
// Every external boundary (git, ssh, curl, pnpm) is faked with PATH shims that
// answer from per-scenario files and record invocations (pushed.log, pnpm.log).
// Each old bug from the operator-local runner is planted and must fail closed:
//   - migrations-only scan (drift in schema.prisma/bridge must be reported,
//     "schema untouched" must never appear),
//   - absent LICENSE_KEY_SECRET -> HELD, no push,
//   - absent Paddle group with commerce config present -> HELD, names listed,
//   - push-before-preflight (HELD never invokes the push shim),
//   - old-health response (no revision) -> FAIL after push,
//   - wrong revision -> FAIL after push,
//   - secret values from config:show never reach stdout,
//   - missing tools -> ERROR.
//
// Run: node scripts/dokku-deploy-preflight.self-test.mjs

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repositoryRoot = process.cwd();
const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'proso-preflight-self-test.'));
const runner = path.join(repositoryRoot, 'scripts', 'dokku-deploy-preflight.mjs');

const MAIN_SHA = 'e8e4ec54e19dad18f52860da2c9d3f47c4af7672';
const DEPLOYED_SHA = '7e4cda0ec3f483dbf76231163f9a705527177a49';

let passed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(message);
}

// --- Scenario machinery --------------------------------------------------------
function scenario(name) {
  const dir = path.join(fixtureRoot, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function write(dir, file, content) {
  writeFileSync(path.join(dir, file), content.endsWith('\n') ? content : `${content}\n`);
}

function writeScenario(dir, files) {
  for (const [file, content] of Object.entries(files)) write(dir, file, content);
}

const CONFIG_KEYS = `=====> proso-api env vars
DATABASE_URL:      postgres://redacted
JWT_SECRET:        redacted-jwt
LICENSE_KEY_SECRET: redacted-license
PADDLE_WEBHOOK_SECRET: redacted-paddle
PADDLE_PRICE_PRO_MONTHLY: pri_redacted
PADDLE_PRICE_PRO_YEARLY: pri_redacted
PADDLE_PRICE_ENTERPRISE_MONTHLY: pri_redacted
PADDLE_PRICE_ENTERPRISE_YEARLY: pri_redacted
GATEWAY_TOKEN:     super-secret-value-123
`;

const CONFIG_KEYS_NO_LICENSE = `=====> proso-api env vars
DATABASE_URL:      postgres://redacted
JWT_SECRET:        redacted-jwt
GATEWAY_TOKEN:     super-secret-value-123
`;

const APP_CONFIG_FULL = `const REQUIRED_IN_PRODUCTION = ['DATABASE_URL', 'JWT_SECRET', 'LICENSE_KEY_SECRET'] as const;
export default registerAs('app', () => ({
  licenseKeySecret: process.env.LICENSE_KEY_SECRET || '',
  paddleWebhookSecret: process.env.PADDLE_WEBHOOK_SECRET || '',
  paddlePriceProMonthly: process.env.PADDLE_PRICE_PRO_MONTHLY || '',
  paddlePriceProYearly: process.env.PADDLE_PRICE_PRO_YEARLY || '',
  paddlePriceEnterpriseMonthly: process.env.PADDLE_PRICE_ENTERPRISE_MONTHLY || '',
  paddlePriceEnterpriseYearly: process.env.PADDLE_PRICE_ENTERPRISE_YEARLY || '',
}));
`;

const APP_CONFIG_NO_COMMERCE = `const REQUIRED_IN_PRODUCTION = ['DATABASE_URL', 'JWT_SECRET', 'LICENSE_KEY_SECRET'] as const;
export default registerAs('app', () => ({
  jwtSecret: process.env.JWT_SECRET || '',
}));
`;

function defaultScenario(dir) {
  writeScenario(dir, {
    'ls-remote.txt': `${DEPLOYED_SHA}\trefs/heads/main`,
    'main-sha.txt': MAIN_SHA,
    'name-only-server.txt': 'packages/server/src/main.ts',
    'name-only-drift.txt': 'packages/server/prisma/schema.prisma',
    'app-config.txt': APP_CONFIG_FULL,
    'config-show.txt': CONFIG_KEYS,
    'health.json': JSON.stringify({
      status: 'ok',
      version: '1.0.0',
      revision: MAIN_SHA,
      uptime: 30,
      details: { database: { status: 'up' } },
    }),
  });
}

// --- Fake shims -----------------------------------------------------------------
const GIT_SHIM = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const s = process.env.SCENARIO;
const cat = (f) => { try { return fs.readFileSync(path.join(s, f), 'utf8'); } catch { return ''; } };
const args = process.argv.slice(2);
if (args[0] === 'ls-remote') process.stdout.write(cat('ls-remote.txt'));
else if (args[0] === 'rev-parse') process.stdout.write(cat('main-sha.txt'));
else if (args[0] === 'show') { const f = cat('app-config.txt'); if (!f) { process.stderr.write('fatal: path not found'); process.exit(1); } process.stdout.write(f); }
else if (args[0] === 'diff') {
  const drift = args.some((a) => a.includes('packages/server/prisma'));
  process.stdout.write(cat(drift ? 'name-only-drift.txt' : 'name-only-server.txt'));
}
else if (args[0] === 'push') {
  if (fs.existsSync(path.join(s, 'push-fail'))) { process.stderr.write('remote: deploy failed'); process.exit(1); }
  fs.appendFileSync(path.join(s, 'pushed.log'), 'push dokku main\\n');
  process.exit(0);
}
else process.exit(0);
`;

const SSH_SHIM = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const s = process.env.SCENARIO;
try { process.stdout.write(fs.readFileSync(path.join(s, 'config-show.txt'), 'utf8')); }
catch { process.exit(1); }
`;

const CURL_SHIM = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const s = process.env.SCENARIO;
if (fs.existsSync(path.join(s, 'health-fail'))) process.exit(7);
try { process.stdout.write(fs.readFileSync(path.join(s, 'health.json'), 'utf8')); }
catch { process.exit(7); }
`;

const PNPM_SHIM = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const s = process.env.SCENARIO;
if (fs.existsSync(path.join(s, 'pnpm-fail'))) process.exit(1);
fs.appendFileSync(path.join(s, 'pnpm.log'), process.argv.slice(2).join(' ') + '\\n');
`;

function makeFakeBin() {
  const bin = path.join(fixtureRoot, 'fakebin');
  mkdirSync(bin, { recursive: true });
  for (const [name, body] of Object.entries({
    git: GIT_SHIM,
    ssh: SSH_SHIM,
    curl: CURL_SHIM,
    pnpm: PNPM_SHIM,
  })) {
    const file = path.join(bin, name);
    writeFileSync(file, body);
    chmodSync(file, 0o755);
  }
  return bin;
}

const fakeBin = makeFakeBin();
const realPath = process.env.PATH ?? '';

function runPreflight(dir, modeArgs, extraPath = '') {
  const env = {
    ...process.env,
    PATH: `${extraPath}${fakeBin}:${realPath}`,
    PROSO_REPO: dir,
    PROSO_DOKKU_HOST: 'dokku.test',
    PROSO_DOKKU_USER: 'dokku',
    PROSO_DOKKU_APP: 'proso-api',
    PROSO_API_URL: 'https://api.test',
    SCENARIO: dir,
  };
  return spawnSync(process.execPath, [runner, ...modeArgs], {
    cwd: dir,
    encoding: 'utf8',
    env,
  });
}

function hasPushed(dir) {
  return existsSync(path.join(dir, 'pushed.log'));
}

function pnpmCalls(dir) {
  try {
    return readFileSync(path.join(dir, 'pnpm.log'), 'utf8');
  } catch {
    return '';
  }
}

// --- Cases ----------------------------------------------------------------------
try {
  {
    const dir = scenario('noop-equal');
    defaultScenario(dir);
    write(dir, 'ls-remote.txt', `${MAIN_SHA}\trefs/heads/main`);
    const r = runPreflight(dir, ['--check']);
    assert(r.status === 0, `[noop-equal] exit 0, got ${r.status}`);
    assert(r.stdout.includes('NOOP'), '[noop-equal] stdout names NOOP');
  }
  {
    const dir = scenario('noop-extension-only');
    defaultScenario(dir);
    write(dir, 'name-only-server.txt', '');
    write(dir, 'name-only-drift.txt', '');
    const r = runPreflight(dir, ['--check']);
    assert(r.status === 0, `[noop-extension-only] exit 0, got ${r.status}`);
    assert(r.stdout.includes('NOOP'), '[noop-extension-only] stdout names NOOP');
  }
  {
    // Plant: migrations-only scan must NOT hide schema/bridge drift.
    const dir = scenario('drift-migrations-only');
    defaultScenario(dir);
    write(
      dir,
      'name-only-drift.txt',
      [
        'packages/server/prisma/schema.prisma',
        'packages/server/scripts/prepare-license-issuance-schema.sql',
        'packages/server/scripts/predeploy.sh',
      ].join('\n'),
    );
    const r = runPreflight(dir, ['--check']);
    assert(
      r.stdout.includes('schema.prisma changed'),
      '[drift-migrations-only] reports schema.prisma drift',
    );
    assert(
      r.stdout.includes('prepare-license-issuance-schema.sql'),
      '[drift-migrations-only] reports bridge SQL drift',
    );
    assert(!r.stdout.includes('no changes'), '[drift-migrations-only] never prints "no changes"');
  }
  {
    // Plant: absent LICENSE_KEY_SECRET -> HELD, no push.
    const dir = scenario('held-missing-license-secret');
    defaultScenario(dir);
    write(dir, 'config-show.txt', CONFIG_KEYS_NO_LICENSE);
    write(dir, 'app-config.txt', APP_CONFIG_NO_COMMERCE);
    const r = runPreflight(dir, ['--check']);
    assert(r.status === 2, `[held-missing-license-secret] exit HELD(2), got ${r.status}`);
    assert(r.stdout.includes('HELD'), '[held-missing-license-secret] stdout names HELD');
    assert(
      r.stdout.includes('LICENSE_KEY_SECRET'),
      '[held-missing-license-secret] names the missing key',
    );
    assert(!hasPushed(dir), '[held-missing-license-secret] never pushes');
    assert(
      !r.stdout.includes('super-secret-value-123'),
      '[held-missing-license-secret] never prints values',
    );
  }
  {
    // Plant: absent Paddle group with commerce config present -> HELD, names listed.
    const dir = scenario('held-missing-paddle');
    defaultScenario(dir);
    write(dir, 'config-show.txt', CONFIG_KEYS_NO_LICENSE);
    const r = runPreflight(dir, ['--check']);
    assert(r.status === 2, `[held-missing-paddle] exit HELD(2), got ${r.status}`);
    for (const name of [
      'LICENSE_KEY_SECRET',
      'PADDLE_WEBHOOK_SECRET',
      'PADDLE_PRICE_PRO_MONTHLY',
    ]) {
      assert(r.stdout.includes(name), `[held-missing-paddle] names ${name}`);
    }
    assert(!hasPushed(dir), '[held-missing-paddle] never pushes');
  }
  {
    // Plant: push-before-preflight — deploy mode with HELD must refuse before push.
    const dir = scenario('held-deploy-refuses');
    defaultScenario(dir);
    write(dir, 'config-show.txt', CONFIG_KEYS_NO_LICENSE);
    write(dir, 'app-config.txt', APP_CONFIG_NO_COMMERCE);
    const r = runPreflight(dir, ['--deploy']);
    assert(r.status === 2, `[held-deploy-refuses] exit HELD(2), got ${r.status}`);
    assert(!hasPushed(dir), '[held-deploy-refuses] no push while HELD');
    assert(pnpmCalls(dir) === '', '[held-deploy-refuses] no gates while HELD');
  }
  {
    // SAFE check is read-only.
    const dir = scenario('safe-check-read-only');
    defaultScenario(dir);
    const r = runPreflight(dir, ['--check']);
    assert(r.status === 1, `[safe-check-read-only] exit SAFE(1), got ${r.status}`);
    assert(r.stdout.includes('SAFE'), '[safe-check-read-only] stdout names SAFE');
    assert(!hasPushed(dir), '[safe-check-read-only] --check never pushes');
  }
  {
    // Plant: old-health response (no revision) cannot prove success.
    const dir = scenario('fail-old-health');
    defaultScenario(dir);
    write(
      dir,
      'health.json',
      JSON.stringify({ status: 'ok', version: '1.0.0', uptime: 120, details: {} }),
    );
    const r = runPreflight(dir, ['--deploy']);
    assert(r.status === 4, `[fail-old-health] exit FAIL(4), got ${r.status}`);
    assert(r.stdout.includes('no revision'), '[fail-old-health] names the missing revision');
    assert(hasPushed(dir), '[fail-old-health] push happened, verification caught it');
  }
  {
    // Plant: wrong revision (old container answering) -> FAIL.
    const dir = scenario('fail-wrong-revision');
    defaultScenario(dir);
    write(
      dir,
      'health.json',
      JSON.stringify({
        status: 'ok',
        version: '1.0.0',
        revision: '1111111111111111111111111111111111111111',
        uptime: 120,
        details: {},
      }),
    );
    const r = runPreflight(dir, ['--deploy']);
    assert(r.status === 4, `[fail-wrong-revision] exit FAIL(4), got ${r.status}`);
    assert(
      r.stdout.includes('old container'),
      '[fail-wrong-revision] names the old-container cause',
    );
  }
  {
    // Success path: gates run, push happens, revision matches exactly.
    const dir = scenario('success');
    defaultScenario(dir);
    const r = runPreflight(dir, ['--deploy']);
    assert(r.status === 0, `[success] exit 0, got ${r.status} stderr=${r.stderr.slice(0, 200)}`);
    assert(r.stdout.includes('SUCCESS'), '[success] stdout names SUCCESS');
    assert(hasPushed(dir), '[success] push happened');
    const calls = pnpmCalls(dir);
    assert(
      calls.includes('build') && calls.includes('test'),
      `[success] server gates ran: ${calls}`,
    );
  }
  {
    // Gates failing must abort before push.
    const dir = scenario('fail-gates');
    defaultScenario(dir);
    write(dir, 'pnpm-fail', '');
    const r = runPreflight(dir, ['--deploy']);
    assert(r.status === 4, `[fail-gates] exit FAIL(4), got ${r.status}`);
    assert(r.stdout.includes('no push was attempted'), '[fail-gates] states no push');
    assert(!hasPushed(dir), '[fail-gates] never pushes');
  }
  {
    // Push failure surfaces as FAIL with the deploy output, not a mislabel.
    const dir = scenario('fail-push');
    defaultScenario(dir);
    write(dir, 'push-fail', '');
    const r = runPreflight(dir, ['--deploy']);
    assert(r.status === 4, `[fail-push] exit FAIL(4), got ${r.status}`);
    assert(
      r.stdout.includes('deploy did not complete'),
      '[fail-push] honest deploy-failure message',
    );
  }
  {
    // Missing tools fail closed.
    const dir = scenario('missing-tool');
    defaultScenario(dir);
    const bare = path.join(fixtureRoot, 'bare');
    mkdirSync(bare, { recursive: true });
    // A failing 'which' makes every tool resolution fail closed without
    // reaching the real system git/ssh/curl/pnpm on PATH.
    const whichStub = path.join(bare, 'which');
    writeFileSync(whichStub, '#!/usr/bin/env node\nprocess.exit(1);\n');
    chmodSync(whichStub, 0o755);
    const env = {
      ...process.env,
      PATH: `${bare}`,
      PROSO_REPO: dir,
      SCENARIO: dir,
    };
    const r = spawnSync(process.execPath, [runner, '--check'], { cwd: dir, encoding: 'utf8', env });
    assert(r.status === 3, `[missing-tool] exit ERROR(3), got ${r.status}`);
    assert(r.stdout.includes('missing required tools'), '[missing-tool] names the missing tools');
  }
  {
    // Unparseable target-tree contract fails closed.
    const dir = scenario('unparseable-contract');
    defaultScenario(dir);
    write(dir, 'app-config.txt', 'export default registerAs(() => ({}));');
    const r = runPreflight(dir, ['--check']);
    assert(r.status === 3, `[unparseable-contract] exit ERROR(3), got ${r.status}`);
  }
  {
    // HELD with drift still reports drift (env first, but drift never hidden).
    const dir = scenario('held-drift-visible');
    defaultScenario(dir);
    write(dir, 'config-show.txt', CONFIG_KEYS_NO_LICENSE);
    write(dir, 'app-config.txt', APP_CONFIG_NO_COMMERCE);
    write(
      dir,
      'name-only-drift.txt',
      'packages/server/prisma/schema.prisma\npackages/server/prisma/migrations/20260813000000_x/migration.sql',
    );
    const r = runPreflight(dir, ['--check']);
    assert(r.stdout.includes('schema.prisma changed'), '[held-drift-visible] reports schema drift');
    assert(
      r.stdout.includes('migrations changed'),
      '[held-drift-visible] reports migrations drift',
    );
  }
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

if (failures.length > 0) {
  process.stderr.write(`PREFLIGHT SELF-TEST FAILED — ${failures.length} assertion(s):\n`);
  for (const failure of failures) process.stderr.write(`  - ${failure}\n`);
  process.exit(1);
}
process.stdout.write(`preflight self-test: ${passed} assertions passed\n`);
process.exit(0);
