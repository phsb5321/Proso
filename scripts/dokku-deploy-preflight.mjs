#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
//
// dokku-deploy-preflight — the repo-owned, fail-closed deploy gate for the
// Proso API (Feature 168). Supersedes the operator-local runner; this one is
// tracked, reviewed, and deterministically plant-tested.
//
// Verdicts (exit codes):
//   NOOP  0 — deployed == main, or no server-affecting diff; nothing to do
//   SAFE  1 — server-affecting diff and the target tree's production env
//             contract is satisfied; `--deploy` may proceed
//   HELD  2 — server-affecting diff but required env key NAMES are missing
//             on the host; a plain deploy would mutate schema (predeploy)
//             and then crash at boot. Lists missing names only, never values.
//   ERROR 3 — missing tools, unparseable contract, or internal failure
//   FAIL  4 — deploy was attempted but live verification failed (old
//             container answering, wrong/missing revision)
//
// Success requires live `GET /health` `.revision` to equal the intended
// full SHA — an old container's 402 copy can never prove success.
//
// Env overrides (tests use these; defaults are production):
//   PROSO_REPO        repo root (default: cwd)
//   PROSO_DOKKU_HOST  default 192.168.1.184
//   PROSO_DOKKU_USER  default dokku
//   PROSO_DOKKU_APP   default proso-api
//   PROSO_API_URL     default https://api.proso.com.br

import { execFileSync } from 'node:child_process';

const MODE = process.argv.includes('--deploy') ? 'deploy' : 'check';

const REPO = process.env.PROSO_REPO ?? process.cwd();
const HOST = process.env.PROSO_DOKKU_HOST ?? '192.168.1.184';
const USER = process.env.PROSO_DOKKU_USER ?? 'dokku';
const APP = process.env.PROSO_DOKKU_APP ?? 'proso-api';
const API_URL = process.env.PROSO_API_URL ?? 'https://api.proso.com.br';

const NOOP = 0;
const SAFE = 1;
const HELD = 2;
const ERROR = 3;
const FAIL = 4;

const SERVER_DIRS = ['packages/server', 'packages/shared'];
const DRIFT_DIRS = ['packages/server/prisma', 'packages/server/scripts'];

function log(line) {
  process.stdout.write(`${line}\n`);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: REPO,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

// --- Tool presence: missing tools fail closed --------------------------------
function requireTools() {
  const missing = [];
  for (const tool of ['git', 'ssh', 'curl', 'pnpm']) {
    try {
      execFileSync('which', [tool], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      missing.push(tool);
    }
  }
  return missing;
}

// --- Ground truth -------------------------------------------------------------
function deployedSha() {
  const out = run('git', ['ls-remote', 'dokku', 'main']);
  const match = /^([0-9a-f]{40})\s+refs\/heads\/main$/m.exec(out);
  if (!match) throw new Error('could not resolve deployed SHA from git ls-remote output');
  return match[1];
}

function mainSha() {
  const out = run('git', ['rev-parse', 'origin/main']);
  const match = /^([0-9a-f]{40})$/m.exec(out);
  if (!match) throw new Error('could not resolve origin/main SHA');
  return match[1];
}

function changedFiles(deployed, main, dirs) {
  const out = run('git', ['diff', '--name-only', `${deployed}..${main}`, '--', ...dirs]);
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// --- Drift detection: schema.prisma, predeploy, bridge SQL, migrations -------
// Never reports "schema untouched" unless ALL three areas are unchanged.
function driftReport(deployed, main) {
  const changed = changedFiles(deployed, main, DRIFT_DIRS);
  if (changed.length === 0) {
    return { changed: [], summary: 'schema/bridge/migrations: no changes' };
  }
  const schema = changed.filter((f) => f.endsWith('schema.prisma'));
  const migrations = changed.filter((f) => f.includes('/migrations/'));
  const scripts = changed.filter((f) => !schema.includes(f) && !migrations.includes(f));
  const parts = [];
  if (schema.length) parts.push(`schema.prisma changed (${schema.join(', ')})`);
  if (scripts.length) parts.push(`predeploy/bridge scripts changed (${scripts.join(', ')})`);
  if (migrations.length) parts.push(`migrations changed (${migrations.join(', ')})`);
  return { changed, summary: parts.join('; ') };
}

// --- Target-tree production env contract -------------------------------------
// Derived from the tree we intend to ship — no untested duplicate list.
//   REQUIRED_IN_PRODUCTION: literal SCREAMING_SNAKE env names.
//   Paddle group: `paddleX: process.env.PADDLE_Y` mappings. Present only
//   when the target tree has the mappings — the matched group, not a
//   hardcoded one.

function parseEnvContract(appConfigSource) {
  const requiredMatch = /REQUIRED_IN_PRODUCTION\s*=\s*\[([^\]]*)\]\s*as\s+const/.exec(
    appConfigSource,
  );
  if (!requiredMatch) {
    throw new Error('could not parse REQUIRED_IN_PRODUCTION from the target tree app.config.ts');
  }
  const required = [...requiredMatch[1].matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]);
  if (required.length === 0) {
    throw new Error('REQUIRED_IN_PRODUCTION parsed to an empty list — refusing to continue');
  }

  const paddle = [
    ...appConfigSource.matchAll(/(?:[a-z][a-zA-Z0-9]+)\s*:\s*process\.env\.(PADDLE_[A-Z0-9_]+)/g),
  ].map((m) => m[1]);
  const paddleUnique = [...new Set(paddle)].sort();
  return { required, paddle: paddleUnique };
}

function targetTreeAppConfig(main) {
  return run('git', ['show', `${main}:packages/server/src/infrastructure/config/app.config.ts`]);
}

// --- Host config key NAMES only — values stripped at parse, never printed ----
function hostConfigKeyNames() {
  const out = run('ssh', ['-o', 'ConnectTimeout=10', `${USER}@${HOST}`, 'config:show', APP], {
    maxBuffer: 4 * 1024 * 1024,
  });
  const names = new Set();
  for (const line of out.split('\n')) {
    const match = /^\s*([A-Z0-9_]+):/.exec(line);
    if (match) names.add(match[1]);
  }
  return names;
}

// --- Server gates -------------------------------------------------------------
function serverGates() {
  log('gate: pnpm --filter @proso/server build');
  run('pnpm', ['--filter', '@proso/server', 'build'], { stdio: 'inherit' });
  log('gate: pnpm --filter @proso/server test (full suite, testcontainers + Nix engine)');
  run('pnpm', ['--filter', '@proso/server', 'test'], { stdio: 'inherit' });
}

// --- Deploy + revision-gated verification -------------------------------------
function pushDokku() {
  const out = run('git', ['push', 'dokku', 'main'], { stdio: ['ignore', 'pipe', 'pipe'] });
  log(out.trim());
}

function fetchHealthRevision() {
  const body = run('curl', ['-fsS', '--max-time', '20', `${API_URL}/health`]);
  let health;
  try {
    health = JSON.parse(body);
  } catch {
    throw new Error('health response is not valid JSON');
  }
  return health;
}

// --- Main ---------------------------------------------------------------------
function main() {
  const missingTools = requireTools();
  if (missingTools.length > 0) {
    log(`ERROR: missing required tools: ${missingTools.join(', ')}`);
    return ERROR;
  }

  let deployed;
  let target;
  let contract;

  try {
    deployed = deployedSha();
    target = mainSha();
  } catch (error) {
    log(`ERROR: ${error.message}`);
    return ERROR;
  }

  if (deployed === target) {
    log(`NOOP: deployed == main (${target}) — nothing to do`);
    return NOOP;
  }

  const serverFiles = changedFiles(deployed, target, SERVER_DIRS);
  if (serverFiles.length === 0) {
    log(
      `NOOP: main is ahead (${deployed.slice(0, 8)}..${target.slice(0, 8)}) but no packages/server or packages/shared changes — no server deploy needed`,
    );
    return NOOP;
  }

  log(
    `server-affecting changes: ${deployed.slice(0, 8)}..${target.slice(0, 8)} (${serverFiles.length} file(s))`,
  );
  const drift = driftReport(deployed, target);
  log(`drift: ${drift.summary}`);

  try {
    contract = parseEnvContract(targetTreeAppConfig(target));
  } catch (error) {
    log(`ERROR: ${error.message}`);
    return ERROR;
  }
  log(`target-tree required env: ${contract.required.join(', ')}`);
  if (contract.paddle.length > 0) {
    log(`commerce config present — matched Paddle group required: ${contract.paddle.join(', ')}`);
  }

  const hostKeys = hostConfigKeyNames();
  const required = [...new Set([...contract.required, ...contract.paddle])];
  const missing = required.filter((name) => !hostKeys.has(name));
  if (missing.length > 0) {
    log(`HELD: missing required env key NAME(s) on ${APP}: ${missing.join(', ')}`);
    log('HELD: no push, no predeploy — schema is not mutated by this run');
    return HELD;
  }

  if (MODE === 'check') {
    log(`SAFE: env contract satisfied — ${target.slice(0, 8)} may be deployed`);
    return SAFE;
  }

  // deploy mode
  try {
    serverGates();
  } catch (error) {
    log(
      `FAIL: server gates did not pass — ${String(error.stderr ?? error)
        .split('\n')
        .slice(-4)
        .join('\n')}`,
    );
    log('FAIL: no push was attempted');
    return FAIL;
  }
  log(`deploy: git push dokku main (${target})`);
  try {
    pushDokku();
  } catch (error) {
    log(
      `FAIL: deploy did not complete — ${String(error.stderr ?? error)
        .split('\n')
        .slice(-6)
        .join('\n')}`,
    );
    return FAIL;
  }

  let health;
  try {
    health = fetchHealthRevision();
  } catch (error) {
    log(`FAIL: /health unreachable after deploy — ${error.message}`);
    log('FAIL: an old container cannot prove success');
    return FAIL;
  }

  if (typeof health.revision !== 'string' || health.revision.length === 0) {
    log(
      'FAIL: /health carries no revision — the old container (or an unconfigured platform) is answering; deploy not proven',
    );
    return FAIL;
  }
  if (health.revision !== target) {
    log(
      `FAIL: /health.revision=${health.revision} but intended=${target} — an old container answered; deploy not proven`,
    );
    return FAIL;
  }
  log(`SUCCESS: deployed ${target} — /health.revision matches the intended SHA`);
  return NOOP;
}

process.exit(main());
