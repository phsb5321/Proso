#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
//
// Deterministic guard for the browser-library isolation in
// scripts/chrome-mv3-diagnostics.mjs.
//
// The diagnostic drives Chromium and then Firefox in ONE process. On NixOS the
// bundled Chromium needs an `LD_LIBRARY_PATH` of /nix/store lib dirs. That path
// used to be written to `process.env`, so the Firefox child inherited it, the
// store `nss` (3.112.5) shadowed the Firefox wrapper's own NSS, and
// `libxul.so` aborted with `version 'NSS_3.113' not found` -> geckodriver
// reported "binary is not a Firefox executable" and the Firefox leg died even
// though the product was fine. Chromium must therefore receive the path through
// its own launch `env` and the ambient environment must stay untouched.
//
// Run: node scripts/chrome-mv3-diagnostics.self-test.mjs

import assert from 'node:assert/strict';

import { chromiumLaunchEnv } from './chrome-mv3-diagnostics.mjs';

const checks = [];

function check(name, fn) {
  fn();
  checks.push(name);
  console.log(`  ok  ${name}`);
}

// The plant this file exists to catch: a global mutation. If someone reverts to
// `process.env.LD_LIBRARY_PATH = libs`, the ambient assertion below goes red.
const AMBIENT_BEFORE = process.env.LD_LIBRARY_PATH;

check('no derived path yields no env override (Chromium keeps the ambient env)', () => {
  assert.equal(chromiumLaunchEnv(''), undefined);
  assert.equal(chromiumLaunchEnv(undefined), undefined);
});

check('a derived path is applied to the returned launch env', () => {
  const env = chromiumLaunchEnv('/nix/store/aaa/lib:/nix/store/bbb/lib', { PATH: '/usr/bin' });
  assert.equal(env.LD_LIBRARY_PATH, '/nix/store/aaa/lib:/nix/store/bbb/lib');
  assert.equal(env.PATH, '/usr/bin', 'the ambient env is carried, not replaced');
});

check('building the launch env never mutates the ambient environment', () => {
  chromiumLaunchEnv('/nix/store/ccc/lib');
  assert.equal(
    process.env.LD_LIBRARY_PATH,
    AMBIENT_BEFORE,
    'process.env.LD_LIBRARY_PATH changed — the Firefox leg would inherit Chromium libs',
  );
});

check('the returned env is a copy, so later edits cannot leak outward', () => {
  const base = { LD_LIBRARY_PATH: 'original' };
  const env = chromiumLaunchEnv('/nix/store/ddd/lib', base);
  assert.equal(base.LD_LIBRARY_PATH, 'original');
  assert.equal(env.LD_LIBRARY_PATH, '/nix/store/ddd/lib');
});

console.log(`chrome-mv3-diagnostics self-test PASS — ${checks.length} checks`);
