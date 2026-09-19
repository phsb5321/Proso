#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const GUID = '{41eb66cb-b520-4047-9b6c-63fdce6fca11}';
const SLUG = 'proso';
const API_BASE = process.env.AMO_API_BASE_URL || 'https://addons.mozilla.org/api/v5';
const PRODUCT_BASE = process.env.AMO_PRODUCT_BASE_URL || 'https://addons.mozilla.org';
const SITE_BASE = process.env.PROSO_SITE_BASE_URL || 'https://proso.com.br';

function fail(message) {
  console.error(`AMO publication FAIL: ${message}`);
  process.exitCode = 1;
}

function localized(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return value['en-US'] || Object.values(value).find((item) => typeof item === 'string') || '';
}

function versionParts(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version || '');
  return match ? match.slice(1).map(Number) : null;
}

function versionAtLeast(actual, expected) {
  const left = versionParts(actual);
  const right = versionParts(expected);
  if (!left || !right) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return true;
}

async function get(url, label) {
  let response;
  try {
    response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new Error(`${label} is unreachable: ${error instanceof Error ? error.message : error}`);
  }
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  return response;
}

const extensionPackage = JSON.parse(
  await readFile(path.join(process.cwd(), 'packages/extension/package.json'), 'utf8'),
);
const expectedVersion = extensionPackage.version;

try {
  const addonResponse = await get(
    `${API_BASE}/addons/addon/${encodeURIComponent(GUID)}/`,
    'public add-on API',
  );
  const addon = await addonResponse.json();
  const version = addon.current_version;

  if (addon.guid !== GUID) fail(`GUID is ${JSON.stringify(addon.guid)}, expected ${GUID}`);
  if (addon.slug !== SLUG) fail(`slug is ${JSON.stringify(addon.slug)}, expected ${SLUG}`);
  if (localized(addon.name) !== 'Proso') {
    fail(`name is ${JSON.stringify(localized(addon.name))}, expected Proso`);
  }
  if (addon.status !== 'public') fail(`add-on status is ${JSON.stringify(addon.status)}`);
  if (!versionAtLeast(version?.version, expectedVersion)) {
    fail(`current version ${JSON.stringify(version?.version)} is older than ${expectedVersion}`);
  }
  if (version?.file?.status !== 'public') {
    fail(`current file status is ${JSON.stringify(version?.file?.status)}`);
  }

  const product = await get(`${PRODUCT_BASE}/firefox/addon/${SLUG}/`, 'public product page');
  const finalPath = new URL(product.url).pathname;
  if (!finalPath.endsWith(`/firefox/addon/${SLUG}/`)) {
    fail(`product page redirected to unexpected path ${JSON.stringify(finalPath)}`);
  }

  const siteResponse = await get(`${SITE_BASE}/`, 'public Proso site');
  const siteHtml = await siteResponse.text();
  const listingUrl = `${PRODUCT_BASE}/firefox/addon/${SLUG}/`;
  if (!siteHtml.includes(listingUrl)) fail(`public site does not link ${listingUrl}`);
  if (!siteHtml.includes('data-amo-status="published"')) {
    fail('public site still claims a pending or unknown AMO state');
  }

  if (!process.exitCode) {
    console.log(
      `AMO publication PASS — ${localized(addon.name)} ${version.version} is public at ${product.url}`,
    );
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
