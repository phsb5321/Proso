#!/usr/bin/env node
/**
 * Release-channel gate (25/08/2026).
 *
 * Proso ships the SAME code down two Firefox channels, and the only difference
 * is who serves updates:
 *
 *   unlisted (self-distributed) -> MUST carry
 *       browser_specific_settings.gecko.update_url
 *     because Firefox never checks AMO for a self-distributed add-on, so the
 *     feed is the only way an installed copy ever updates.
 *
 *   listed (Mozilla-hosted)     -> MUST NOT carry it
 *     AMO's validator rejects the submission outright:
 *       MANIFEST_UPDATE_URL "update_url" is not allowed.
 *     Discovered mechanically by `web-ext lint` on the 1.2.9 build, where it
 *     was the ONLY error standing between the extension and an AMO listing.
 *
 * Getting this backwards is silent in both directions: a listed build with the
 * key is refused at submission, and an unlisted build without it produces
 * installs that never update again. Both are worth failing a gate over.
 *
 * Usage: node scripts/release-channels-check.mjs
 * Assumes both builds exist (see `make release-channels`).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const UNLISTED = 'packages/extension/.output/firefox-mv2/manifest.json';
const LISTED = 'packages/extension/.output-listed/firefox-mv2/manifest.json';

async function gecko(relative) {
  let raw;
  try {
    raw = await readFile(path.join(root, relative), 'utf8');
  } catch {
    throw new Error(`missing build: ${relative} — run \`make release-channels\` first`);
  }
  const manifest = JSON.parse(raw);
  const settings = manifest.browser_specific_settings?.gecko;
  if (!settings) throw new Error(`${relative} has no browser_specific_settings.gecko`);
  return { manifest, settings };
}

const unlisted = await gecko(UNLISTED);
const listed = await gecko(LISTED);

const failures = [];

if (!unlisted.settings.update_url) {
  failures.push(
    `unlisted build (${UNLISTED}) has no update_url — self-distributed installs would never update`,
  );
}

if (listed.settings.update_url) {
  failures.push(
    `listed build (${LISTED}) carries update_url — AMO rejects this with MANIFEST_UPDATE_URL`,
  );
}

// Same add-on, same version: the channels must not drift apart, or a user
// moving between them would see a downgrade or an id mismatch.
if (listed.settings.id !== unlisted.settings.id) {
  failures.push(
    `extension id differs between channels: ${unlisted.settings.id} vs ${listed.settings.id}`,
  );
}
if (listed.manifest.version !== unlisted.manifest.version) {
  failures.push(
    `version differs between channels: ${unlisted.manifest.version} vs ${listed.manifest.version}`,
  );
}

// AMO defines collection as any data handled outside the add-on or local
// browser. Reading necessarily transmits the requested page text, so claiming
// `none` is false even though telemetry is absent. The listed build must name
// websiteContent as required. BYOK transmits a provider credential only when
// selected, so authenticationInfo is optional; telemetry categories stay out.
const collection = listed.settings.data_collection_permissions;
if (!collection) {
  failures.push('listed build has no data_collection_permissions — AMO requires it');
} else {
  if (JSON.stringify(collection.required) !== JSON.stringify(['websiteContent'])) {
    failures.push(
      `listed build declares required data ${JSON.stringify(collection.required)} — expected websiteContent`,
    );
  }
  if (JSON.stringify(collection.optional) !== JSON.stringify(['authenticationInfo'])) {
    failures.push(
      `listed build declares optional data ${JSON.stringify(collection.optional)} — expected authenticationInfo only`,
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log(
  `release channels OK — v${listed.manifest.version}: unlisted keeps update_url, listed omits it, ids match.`,
);
