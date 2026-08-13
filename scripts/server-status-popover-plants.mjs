#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
//
// server-status-popover-plants — prove every assertion in
// scripts/server-status-popover-gate.mjs catches a planted break.
//
// A green harness is evidence of nothing until each assertion has been shown
// to fail under a severed link. Scoring reads the gate's own verdict line
// (never exit codes alone), and a gate that never starts is never counted —
// inherited from scripts/license-settings-plants.mjs.
//
// @module scripts/server-status-popover-plants

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const GATE = path.join(here, 'server-status-popover-gate.mjs');
const VERDICT_LINE = /^server-status-popover-gate (PASS|FAIL|BLOCKED)\b/m;

/** One entry per assertion the gate makes. */
const PLANTS = [
  {
    plant: '',
    expect: 'PASS',
    guards: 'the unsevered settings page across desktop/narrow/zoom/dark (control run)',
  },
  {
    plant: 'grid-areas',
    expect: 'FAIL',
    guards:
      'the narrow single-column grid areas — the planted pre-170 base .container (no named areas) must turn the narrow-header assertion red',
  },
  {
    plant: 'aria-static',
    expect: 'FAIL',
    guards:
      'the aria-hidden visibility reflection — a static "true" while the popover is visible must turn the aria assertion red',
  },
];

function runPlant(plant) {
  const env = { ...process.env };
  if (plant === '') env.POPOVER_PLANT = undefined;
  else env.POPOVER_PLANT = plant;
  const result = spawn(process.execPath, [GATE], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  result.stdout.on('data', (chunk) => (stdout += String(chunk)));
  result.stderr.on('data', (chunk) => (stderr += String(chunk)));
  return new Promise((resolve) => {
    result.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

let caught = 0;
let missed = 0;
const evidence = [];

for (const entry of PLANTS) {
  const { code, stdout, stderr } = await runPlant(entry.plant);
  const match = VERDICT_LINE.exec(stdout);
  const reported = match ? match[1] : null;
  const label = entry.plant === '' ? 'control' : entry.plant;
  if (reported === entry.expect) {
    caught += 1;
    evidence.push({ plant: label, verdict: reported, code, caught: true });
    process.stdout.write(`  ok  plant ${label}: ${reported} (guards ${entry.guards})\n`);
  } else {
    missed += 1;
    evidence.push({ plant: label, verdict: reported ?? 'no-verdict', code, caught: false, stderr });
    process.stdout.write(
      `  not ok  plant ${label}: expected ${entry.expect}, gate reported ${reported ?? 'nothing'} (exit ${code})\n`,
    );
    if (stderr.trim())
      process.stdout.write(`        ${stderr.trim().split('\n').slice(-3).join('\n        ')}\n`);
  }
}

// Self-check inherited from the fleet convention: a gate that never starts
// must never count as caught — the verdict line is required, so a crash
// (no verdict) lands in `missed` above by construction.
process.stdout.write(
  `server-status-popover-plants ${missed === 0 ? 'PASS' : 'FAIL'}: ${caught} caught, ${missed} missed\n`,
);
process.exit(missed === 0 ? 0 : 1);
