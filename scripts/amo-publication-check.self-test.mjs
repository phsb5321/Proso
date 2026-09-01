#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';

const GUID = '{41eb66cb-b520-4047-9b6c-63fdce6fca11}';
const baseAddon = {
  guid: GUID,
  slug: 'proso',
  name: { 'en-US': 'Proso' },
  status: 'public',
  current_version: { version: '1.2.10', file: { status: 'public' } },
};

let response = baseAddon;
let siteHtml =
  '<a href="http://placeholder/firefox/addon/proso/"></a><section data-amo-status="published"></section>';
const server = http.createServer((request, reply) => {
  if (request.url?.startsWith('/api/v5/addons/addon/')) {
    reply.writeHead(response ? 200 : 404, { 'content-type': 'application/json' });
    reply.end(JSON.stringify(response || { detail: 'Not found.' }));
    return;
  }
  if (request.url === '/firefox/addon/proso/') {
    reply.writeHead(200, { 'content-type': 'text/html' });
    reply.end('<!doctype html><title>Proso</title>');
    return;
  }
  if (request.url === '/') {
    reply.writeHead(200, { 'content-type': 'text/html' });
    reply.end(siteHtml.replace('http://placeholder', origin));
    return;
  }
  reply.writeHead(404).end();
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();
assert(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;

function run() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/amo-publication-check.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AMO_API_BASE_URL: `${origin}/api/v5`,
        AMO_PRODUCT_BASE_URL: origin,
        PROSO_SITE_BASE_URL: origin,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (status) => resolve({ status, stdout, stderr }));
  });
}

try {
  let result = await run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /AMO publication PASS/);

  const failures = [
    { ...baseAddon, status: 'unlisted' },
    { ...baseAddon, slug: 'voxpage' },
    { ...baseAddon, name: { 'en-US': 'VoxPage' } },
    { ...baseAddon, current_version: { version: '1.2.9', file: { status: 'public' } } },
    { ...baseAddon, current_version: { version: '1.2.10', file: { status: 'awaiting_review' } } },
    null,
  ];

  for (const planted of failures) {
    response = planted;
    result = await run();
    assert.notEqual(result.status, 0, `plant passed: ${JSON.stringify(planted)}`);
    assert.match(result.stderr, /AMO publication FAIL/);
  }

  response = baseAddon;
  siteHtml =
    '<a href="http://placeholder/firefox/addon/proso/"></a><section data-amo-status="awaiting-review"></section>';
  result = await run();
  assert.notEqual(result.status, 0, 'pending-site plant passed');
  assert.match(result.stderr, /AMO publication FAIL/);

  console.log(`AMO publication self-test PASS — ${failures.length + 1} false-green plants caught`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
