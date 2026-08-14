#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
//
// `make browser-linkage` — prove the browsers this repo's gates drive can
// actually START in the current environment.
//
// The gap this closes: `shell.nix` put the top-level `nss` (3.112.5) on
// `LD_LIBRARY_PATH` while also shipping `firefox` (152.0.6), whose `libxul.so`
// requires the `NSS_3.113` symbol version. The shell's NSS shadowed the one the
// Firefox wrapper resolves for itself, so every launch inside `nix-shell` died:
//
//   XPCOMGlueLoad error for file .../firefox-152.0.6/lib/firefox/libxul.so:
//   .../nss-3.112.5/lib/libnss3.so: version `NSS_3.113' not found
//   Couldn't load XPCOM.
//
// geckodriver reported that as `Could not start Firefox: binary is not a
// Firefox executable`, which reads like a broken build or a product
// regression. It was neither — the browser was fine and the environment was
// wrong. A linkage failure must therefore be named as a linkage failure,
// before any acceptance run spends minutes reaching a misleading error.
//
// This check is deliberately a STARTUP check, not a presence check: resolving a
// path and stat-ing it proves nothing about symbol versions. Only executing the
// binary does.
//
// Run: node scripts/browser-linkage-check.mjs

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const results = [];
let failed = 0;

function record(ok, name, detail) {
  results.push({ ok, name, detail });
  process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'} ${name} — ${detail}\n`);
  if (!ok) failed += 1;
}

/** The Firefox the gates will use: FIREFOX_BIN, else PATH, in that order. */
function resolveFirefox() {
  const explicit = process.env.FIREFOX_BIN;
  if (explicit) return existsSync(explicit) ? explicit : null;
  for (const name of ['firefox', 'firefox-nightly', 'firefox-developer-edition']) {
    const found = spawnSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  return null;
}

/**
 * Start the binary and demand a real version banner.
 *
 * `firefox --version` exits 0 even when XPCOM fails to load — the glue writes
 * the error to stderr and the shell still sees success. Exit status alone is
 * therefore NOT a usable oracle here; the version string is.
 */
function startupVerdict(binary) {
  const run = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 120_000 });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const version = /Mozilla Firefox ([\w.ab]+)/.exec(run.stdout ?? '');
  if (version) return { ok: true, detail: `started — Mozilla Firefox ${version[1]}` };
  const nss = /version `(NSS_[\d.]+)' not found/.exec(output);
  if (nss) {
    const lib = /(\/nix\/store\/[^:\s]*nss-[\d.]+)/.exec(output);
    return {
      ok: false,
      detail:
        `LINKAGE FAILURE: libxul requires ${nss[1]} but ${lib ? lib[1] : 'the NSS on LD_LIBRARY_PATH'} ` +
        'does not export it. An NSS on LD_LIBRARY_PATH is shadowing the Firefox wrapper. ' +
        'Use nss_latest (see shell.nix), or run the gates outside nix-shell, or set FIREFOX_BIN.',
    };
  }
  return {
    ok: false,
    detail: `no version banner; output: ${output.trim().slice(0, 200) || '(empty)'}`,
  };
}

const firefox = resolveFirefox();
if (!firefox) {
  record(false, 'firefox resolved', 'no Firefox via FIREFOX_BIN or PATH');
} else {
  record(true, 'firefox resolved', firefox);
  const verdict = startupVerdict(firefox);
  record(verdict.ok, 'firefox starts (XPCOM/NSS linkage)', verdict.detail);
}

const gecko = spawnSync('/bin/sh', ['-c', 'command -v geckodriver'], { encoding: 'utf8' });
if (gecko.status === 0 && gecko.stdout.trim()) {
  const path = gecko.stdout.trim();
  const version = spawnSync(path, ['--version'], { encoding: 'utf8', timeout: 60_000 });
  const line = (version.stdout ?? '').split('\n')[0].trim();
  record(Boolean(line), 'geckodriver present', line || path);
} else {
  record(false, 'geckodriver present', 'not on PATH — the Firefox acceptance harness cannot run');
}

process.stdout.write(
  `browser-linkage ${failed === 0 ? 'PASS' : 'FAIL'} — ${results.length} check(s), ${failed} failed\n`,
);
if (failed > 0) process.exitCode = 1;
