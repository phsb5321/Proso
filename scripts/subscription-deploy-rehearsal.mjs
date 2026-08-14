#!/usr/bin/env node

/**
 * Rehearse the built subscription server against a disposable PostgreSQL.
 *
 * This runner deliberately joins boundaries that the focused integration suite
 * cannot: the exact pre-commerce schema, checked-in predeploy script, built
 * `dist/main.js`, a real process restart, and an environment-injected fault.
 * It never contacts Paddle or any deployed Proso host.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const serverRoot = join(repoRoot, 'packages/server');
const artifactDir = join(repoRoot, '.artifacts/subscription-deploy-rehearsal');
const receiptPath = join(artifactDir, 'receipt.json');
const plant = process.argv[2] === '--plant' ? process.argv[3] : null;

if (process.argv.length > 2 && plant !== 'skip-predeploy') {
  fail('usage: node scripts/subscription-deploy-rehearsal.mjs [--plant skip-predeploy]');
}

const PRE_COMMERCE_COMMIT = '087607c';
const FIXTURE_PATH = 'packages/server/tests/fixtures/paddle/transaction-completed.json';
const dummyValue = (purpose, minimumBytes = 0) => {
  let value = ['subscription', 'deploy', 'rehearsal', purpose].join('-');
  while (Buffer.byteLength(value) < minimumBytes) value += '-local';
  return value;
};
const CLAIM_SECRET = dummyValue('claim', 32);
const CLAIM_HASH = createHash('sha256').update(CLAIM_SECRET).digest('hex');
const LICENSE_KEY_SECRET = dummyValue('license', 32);
const WEBHOOK_SECRET = dummyValue('webhook', 32);
const JWT_SECRET = dummyValue('jwt', 32);
const PRICE_CATALOG = Object.freeze({
  proMonthly: 'pri_promonth',
  proYearly: 'pri_rehearsalproyear',
  enterpriseMonthly: 'pri_rehearsalentmonth',
  enterpriseYearly: 'pri_rehearsalentyear',
});
const TABLES = ['User', 'Subscription', 'CreditAllocation', 'LicenseKey', 'PaddleWebhookEvent'];
const REQUIRED_INDEXES = [
  'User_paddleCustomerId_key',
  'Subscription_paddleTransactionId_key',
  'CreditAllocation_paddleTransactionId_key',
  'LicenseKey_userId_key',
  'PaddleWebhookEvent_pkey',
];
const REQUIRED_CONSTRAINT = 'Subscription_paddle_claim_pair_check';
const POLL_MS = 200;
const BOOT_TIMEOUT_MS = 45_000;

let containerName = '';
let server = null;
const serverLogs = [];
const phases = [];

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function record(phase, detail = '') {
  phases.push(phase);
  process.stdout.write(`  ok  ${phase}${detail ? ` — ${detail}` : ''}\n`);
}

function command(name, args, options = {}) {
  const result = spawnSync(name, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    input: options.input,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) fail(`${name} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    const diagnostic = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    fail(`${name} ${args[0] ?? ''} exited ${result.status}${diagnostic ? `\n${diagnostic}` : ''}`);
  }
  return result.stdout;
}

function requireCommand(name) {
  const probe = spawnSync(name, ['--version'], { encoding: 'utf8' });
  if (probe.error?.code === 'ENOENT') fail(`missing required command: ${name}`);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address();
      if (!address || typeof address === 'string')
        return reject(new Error('could not reserve port'));
      socket.close(() => resolvePort(address.port));
    });
  });
}

function docker(...args) {
  return command('docker', args);
}

function sql(databaseUrl, statement, tuplesOnly = false) {
  const url = new URL(databaseUrl);
  assert(url.hostname === '127.0.0.1' || url.hostname === 'localhost', 'database must be loopback');
  const args = ['exec', '-i', containerName, 'psql', '-v', 'ON_ERROR_STOP=1'];
  if (tuplesOnly) args.push('-At');
  args.push('-U', 'rehearsal', '-d', 'rehearsal', '-c', statement);
  return docker(...args).trim();
}

function countRows(databaseUrl) {
  const union = TABLES.map((table) => `SELECT '${table}', COUNT(*) FROM "${table}"`).join(
    ' UNION ALL ',
  );
  const rows = Object.fromEntries(
    sql(databaseUrl, union, true)
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [table, count] = line.split('|');
        return [table, Number(count)];
      }),
  );
  return rows;
}

function assertCounts(counts, expected, context) {
  for (const table of TABLES) {
    assert(
      counts[table] === expected,
      `${context}: ${table}=${counts[table]}, expected ${expected}`,
    );
  }
}

function fixtureBytes() {
  const fixture = JSON.parse(readFileSync(join(repoRoot, FIXTURE_PATH), 'utf8'));
  fixture.data.custom_data = {
    ...fixture.data.custom_data,
    license_claim_hash: CLAIM_HASH,
  };
  const periodStart = new Date(Date.now() - 60_000);
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000);
  fixture.occurred_at = periodStart.toISOString();
  fixture.data.billing_period = {
    starts_at: periodStart.toISOString(),
    ends_at: periodEnd.toISOString(),
  };
  return Buffer.from(JSON.stringify(fixture));
}

function signature(body) {
  const timestamp = Math.floor(Date.now() / 1_000);
  const digest = createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}:`)
    .update(body)
    .digest('hex');
  return `ts=${timestamp};h1=${digest}`;
}

async function request(url, init) {
  const response = await fetch(url, init);
  let body = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body };
}

async function claim(baseUrl, transactionId) {
  return request(`${baseUrl}/api/v1/license/by-transaction`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transactionId, claimSecret: CLAIM_SECRET }),
  });
}

async function deliver(baseUrl, body) {
  return request(`${baseUrl}/webhooks/paddle`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'paddle-signature': signature(body),
    },
    body,
  });
}

function serverEnv(databaseUrl, port, fault = false) {
  return {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    DATABASE_URL: databaseUrl,
    JWT_SECRET,
    LICENSE_KEY_SECRET,
    PADDLE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    PADDLE_PRICE_PRO_MONTHLY: PRICE_CATALOG.proMonthly,
    PADDLE_PRICE_PRO_YEARLY: PRICE_CATALOG.proYearly,
    PADDLE_PRICE_ENTERPRISE_MONTHLY: PRICE_CATALOG.enterpriseMonthly,
    PADDLE_PRICE_ENTERPRISE_YEARLY: PRICE_CATALOG.enterpriseYearly,
    LOG_LEVEL: 'debug',
    LOKI_HOST: '',
    ...(fault ? { PROSO_REHEARSAL_FAIL_BEFORE_COMMIT: '1' } : {}),
  };
}

async function startServer(databaseUrl, fault = false) {
  const port = await reservePort();
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: serverRoot,
    env: serverEnv(databaseUrl, port, fault),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server = child;
  let output = '';
  const collect = (chunk) => {
    output += chunk.toString();
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  let exit = null;
  child.once('exit', (code, signal) => {
    exit = { code, signal };
  });
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exit) fail(`built server exited before listen (code ${exit.code}, signal ${exit.signal})`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.status > 0) {
        return { baseUrl: `http://127.0.0.1:${port}`, child, output: () => output };
      }
    } catch {
      await sleep(POLL_MS);
    }
  }
  fail(`built server did not listen within ${BOOT_TIMEOUT_MS}ms`);
}

async function stopServer(running) {
  if (!running?.child || running.child.exitCode !== null) {
    server = null;
    return;
  }
  running.child.kill('SIGTERM');
  const deadline = Date.now() + 10_000;
  while (running.child.exitCode === null && Date.now() < deadline) await sleep(50);
  if (running.child.exitCode === null) running.child.kill('SIGKILL');
  serverLogs.push(running.output());
  server = null;
}

function resetDatabase(databaseUrl) {
  sql(databaseUrl, 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}

function prismaEngineEnvironment() {
  const configured = process.env.PRISMA_SCHEMA_ENGINE_BINARY;
  if (configured) {
    assert(existsSync(configured), 'PRISMA_SCHEMA_ENGINE_BINARY does not exist');
    return { ...process.env, PRISMA_SCHEMA_ENGINE_BINARY: configured };
  }
  if (!existsSync('/etc/NIXOS')) return process.env;
  const output = command('nix', [
    'build',
    '--no-link',
    '--print-out-paths',
    'nixpkgs#prisma-engines',
  ]);
  const engine = join(output.trim(), 'bin/schema-engine');
  assert(existsSync(engine), 'NixOS Prisma schema engine bootstrap failed');
  return { ...process.env, PRISMA_SCHEMA_ENGINE_BINARY: engine };
}

function applyPreCommerce(databaseUrl) {
  const schema = command('git', [
    'show',
    `${PRE_COMMERCE_COMMIT}:packages/server/prisma/schema.prisma`,
  ]);
  const tempSchema = `${artifactDir}/pre-commerce-schema.prisma`;
  writeFileSync(tempSchema, schema);
  const prismaEnv = prismaEngineEnvironment();
  command(
    'pnpm',
    [
      '--filter',
      '@proso/server',
      'exec',
      'prisma',
      'db',
      'push',
      '--url',
      databaseUrl,
      '--schema',
      tempSchema,
    ],
    { env: { ...prismaEnv, DATABASE_URL: databaseUrl } },
  );
  record('pre-commerce schema applied', PRE_COMMERCE_COMMIT);
}

function applyReleaseSchema(databaseUrl) {
  const env = {
    ...prismaEngineEnvironment(),
    DATABASE_URL: databaseUrl,
    PROSO_APP_ROOT: serverRoot,
  };
  if (plant === 'skip-predeploy') {
    command(
      'pnpm',
      [
        '--filter',
        '@proso/server',
        'exec',
        'prisma',
        'db',
        'push',
        '--url',
        databaseUrl,
        '--schema',
        join(serverRoot, 'prisma/schema.prisma'),
        '--accept-data-loss',
      ],
      { env },
    );
    record('PLANT bypassed checked-in predeploy');
    return;
  }
  const output = command('sh', [join(serverRoot, 'scripts/predeploy.sh')], {
    cwd: serverRoot,
    env,
  });
  assert(
    output.includes('Preparing the licence issuance schema bridge...'),
    'first bridge phase absent',
  );
  assert(output.includes('Running prisma db push...'), 'Prisma reconciliation phase absent');
  assert(
    output.includes('Finalizing Paddle provisioning constraints...'),
    'second bridge phase absent',
  );
  record('checked-in predeploy completed', 'bridge → db push → bridge');
}

function assertSchema(databaseUrl) {
  const indexes = new Set(
    sql(
      databaseUrl,
      `SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY indexname`,
      true,
    ).split('\n'),
  );
  for (const index of REQUIRED_INDEXES)
    assert(indexes.has(index), `required index absent: ${index}`);
  const constraints = new Set(
    sql(databaseUrl, 'SELECT conname FROM pg_constraint ORDER BY conname', true).split('\n'),
  );
  assert(
    constraints.has(REQUIRED_CONSTRAINT),
    `required constraint absent: ${REQUIRED_CONSTRAINT}`,
  );
  const nullable = sql(
    databaseUrl,
    `SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='licenseKey'`,
    true,
  );
  assert(nullable === 'YES', 'legacy User.licenseKey must become nullable');
  record('schema invariants observed', `${REQUIRED_INDEXES.length} indexes + claim-pair check`);
}

function assertProductionBootRefusesShortSecret(databaseUrl) {
  const port = 9_999;
  const result = spawnSync(process.execPath, ['dist/main.js'], {
    cwd: serverRoot,
    env: { ...serverEnv(databaseUrl, port), LICENSE_KEY_SECRET: 'short' },
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert(result.status !== 0, 'production boot accepted a short LICENSE_KEY_SECRET');
  assert(
    `${result.stdout}${result.stderr}`.includes('at least 32 bytes'),
    'short-secret boot did not fail at production validation',
  );
  record('production boot fails closed on short licence secret');
}

function assertStoredSecretsAbsent(databaseUrl, issuedKey) {
  const textColumns = sql(
    databaseUrl,
    `SELECT COALESCE(string_agg(value, E'\\n'), '') FROM (
       SELECT COALESCE("licenseKey", '') AS value FROM "User"
       UNION ALL SELECT COALESCE("paddleCustomerId", '') FROM "User"
       UNION ALL SELECT COALESCE("licenseClaimHash", '') FROM "Subscription"
       UNION ALL SELECT COALESCE("keyHash", '') FROM "LicenseKey"
       UNION ALL SELECT COALESCE("eventId", '') FROM "PaddleWebhookEvent"
     ) values_to_scan`,
    true,
  );
  assert(!textColumns.includes(CLAIM_SECRET), 'plaintext claim secret persisted');
  assert(!textColumns.includes(issuedKey), 'plaintext licence key persisted');
  const logs = serverLogs.join('\n');
  for (const secret of [CLAIM_SECRET, issuedKey, LICENSE_KEY_SECRET, WEBHOOK_SECRET]) {
    assert(!logs.includes(secret), 'plaintext secret reached server logs');
  }
  record('hash-only persistence and redacted logs observed');
}

async function exerciseHappyPath(databaseUrl, body) {
  let running = await startServer(databaseUrl);
  assertProductionBootRefusesShortSecret(databaseUrl);
  record('built real AppModule booted', 'NODE_ENV=production');

  const event = JSON.parse(body.toString('utf8'));
  const transactionId = event.data.id;
  const pending = await claim(running.baseUrl, transactionId);
  assert(pending.status === 202, `pre-webhook claim returned HTTP ${pending.status}`);
  assert(
    JSON.stringify(pending.body) === JSON.stringify({ status: 'pending', retryAfterMs: 2_000 }),
    'pre-webhook claim was not canonical pending',
  );
  record('account-free claim pending', 'HTTP 202');

  const accepted = await deliver(running.baseUrl, body);
  assert(
    accepted.status === 200,
    `signed canonical webhook returned HTTP ${accepted.status}\n${running.output().trim()}`,
  );
  assertCounts(countRows(databaseUrl), 1, 'committed purchase');
  record('signed canonical event committed atomically', 'HTTP 200; 1× each row');

  const issued = await claim(running.baseUrl, transactionId);
  assert(issued.status === 200, `post-webhook claim returned HTTP ${issued.status}`);
  assert(issued.body?.status === 'issued', 'post-webhook claim was not issued');
  const issuedKey = issued.body.licenseKey;
  assert(typeof issuedKey === 'string' && issuedKey.length > 20, 'issued key absent');

  const validated = await request(`${running.baseUrl}/api/v1/license/validate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ licenseKey: issuedKey }),
  });
  assert(validated.status === 200, `licence validation returned HTTP ${validated.status}`);
  assert(validated.body?.valid === true, 'issued key did not validate');
  assert(validated.body?.tier === 'pro', `issued tier was ${validated.body?.tier}`);
  assert(
    validated.body?.credits?.total === 500_000,
    `paid credit total was ${validated.body?.credits?.total}, expected 500000`,
  );
  record('claim issued and paid key validated', 'HTTP 200; pro/500000');

  await stopServer(running);
  running = await startServer(databaseUrl);
  const replay = await deliver(running.baseUrl, body);
  assert(replay.status === 200, `restart replay returned HTTP ${replay.status}`);
  assertCounts(countRows(databaseUrl), 1, 'restart replay');
  record('fresh-process replay stayed exactly once', 'HTTP 200');
  assertStoredSecretsAbsent(databaseUrl, issuedKey);
  await stopServer(running);
  return { issuedKeyHash: createHash('sha256').update(issuedKey).digest('hex') };
}

async function exerciseRollbackRetry(databaseUrl, body) {
  resetDatabase(databaseUrl);
  applyPreCommerce(databaseUrl);
  applyReleaseSchema(databaseUrl);
  assertSchema(databaseUrl);
  let running = await startServer(databaseUrl, true);
  const failed = await deliver(running.baseUrl, body);
  assert(failed.status === 503, `injected pre-commit fault returned HTTP ${failed.status}`);
  assertCounts(countRows(databaseUrl), 0, 'injected rollback');
  record('injected pre-commit fault rolled back', 'HTTP 503; 0× every commerce row');
  await stopServer(running);

  running = await startServer(databaseUrl);
  const retried = await deliver(running.baseUrl, body);
  assert(retried.status === 200, `retry after rollback returned HTTP ${retried.status}`);
  assertCounts(countRows(databaseUrl), 1, 'retry after rollback');
  record('same-event retry committed once', 'HTTP 200; 1× each row');
  await stopServer(running);
}

async function main() {
  for (const tool of ['docker', 'git', 'pnpm', 'sh']) requireCommand(tool);
  assert(
    existsSync(join(serverRoot, 'dist/main.js')),
    'built server missing; build shared then server',
  );
  assert(existsSync(join(repoRoot, FIXTURE_PATH)), `canonical fixture missing: ${FIXTURE_PATH}`);
  mkdirSync(artifactDir, { recursive: true });
  if (!plant) rmSync(receiptPath, { force: true });

  command('docker', ['info', '--format', '{{.ServerVersion}}']);
  containerName = `proso-subscription-rehearsal-${process.pid}-${randomBytes(3).toString('hex')}`;
  const hostPort = await reservePort();
  docker(
    'run',
    '--detach',
    '--rm',
    '--name',
    containerName,
    '--publish',
    `127.0.0.1:${hostPort}:5432`,
    '--env',
    'POSTGRES_USER=rehearsal',
    '--env',
    'POSTGRES_PASSWORD=rehearsal',
    '--env',
    'POSTGRES_DB=rehearsal',
    'postgres:16-alpine',
  );
  const databaseUrl = `postgresql://rehearsal:rehearsal@127.0.0.1:${hostPort}/rehearsal`;
  const readyDeadline = Date.now() + 45_000;
  while (Date.now() < readyDeadline) {
    const ready = spawnSync('docker', [
      'exec',
      containerName,
      'pg_isready',
      '-h',
      '127.0.0.1',
      '-U',
      'rehearsal',
      '-d',
      'rehearsal',
    ]);
    if (ready.status === 0) break;
    await sleep(250);
  }
  const ready = spawnSync('docker', [
    'exec',
    containerName,
    'pg_isready',
    '-h',
    '127.0.0.1',
    '-U',
    'rehearsal',
    '-d',
    'rehearsal',
  ]);
  assert(ready.status === 0, 'disposable PostgreSQL did not become ready');
  record('disposable PostgreSQL ready', 'postgres:16-alpine on loopback');

  applyPreCommerce(databaseUrl);
  applyReleaseSchema(databaseUrl);
  assertSchema(databaseUrl);
  if (plant === 'skip-predeploy')
    fail('plant escaped: bypassed predeploy still satisfied schema oracle');

  const body = fixtureBytes();
  const happy = await exerciseHappyPath(databaseUrl, body);
  await exerciseRollbackRetry(databaseUrl, body);

  const head = command('git', ['rev-parse', 'HEAD']).trim();
  const fixtureHash = createHash('sha256')
    .update(readFileSync(join(repoRoot, FIXTURE_PATH)))
    .digest('hex');
  const receipt = {
    schemaVersion: 1,
    command: 'make subscription-deploy-rehearsal',
    head,
    preCommerceCommit: PRE_COMMERCE_COMMIT,
    fixture: { path: FIXTURE_PATH, sha256: fixtureHash },
    database: { image: 'postgres:16-alpine', disposable: true, loopbackOnly: true },
    predeploy: { checkedInScript: 'packages/server/scripts/predeploy.sh', executed: true },
    app: { entrypoint: 'packages/server/dist/main.js', nodeEnv: 'production', restarted: true },
    claim: { pendingHttpStatus: 202, issuedHttpStatus: 200, requestsPerWindow: 2 },
    provisioning: {
      eventIdsDelivered: 1,
      committedCounts: Object.fromEntries(TABLES.map((table) => [table, 1])),
      issuedKeySha256: happy.issuedKeyHash,
      replayExactlyOnce: true,
      rollbackHttpStatus: 503,
      rollbackCounts: Object.fromEntries(TABLES.map((table) => [table, 0])),
      retrySucceeded: true,
    },
    secrets: { plaintextPersisted: false, plaintextLogged: false },
    plant: null,
    phases,
    completedAt: new Date().toISOString(),
  };
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`subscription-deploy-rehearsal PASS at ${head}\n`);
  process.stdout.write(`receipt: ${receiptPath}\n`);
}

async function cleanup() {
  if (server && server.exitCode === null) server.kill('SIGKILL');
  if (containerName) spawnSync('docker', ['rm', '--force', containerName], { stdio: 'ignore' });
}

main()
  .then(async () => {
    await cleanup();
  })
  .catch(async (error) => {
    await cleanup();
    const label = plant
      ? `subscription-deploy-rehearsal plant ${plant}`
      : 'subscription-deploy-rehearsal';
    process.stderr.write(
      `${label} FAILED: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
