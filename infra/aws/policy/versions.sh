# shellcheck shell=bash
# Single source of truth for the gate's pinned versions and paths. Sourced by
# every script in `scripts/` and echoed by CI, so a version drift shows up in
# the log rather than as a mystery result change.
#
# terraform / tflint / trivy are pinned by `flake.lock`, not here — nix already
# does that job. Checkov is the exception: its nixpkgs build currently fails
# its own runtime dependency check (`aiohttp<3.14.0,>=3.8.0 not satisfied by
# version 3.14.1`), so it comes from PyPI via `uv`. Pinning the exact version
# here plus `--skip-download` (no policy fetch from api0.prismacloud.io at scan
# time) is what keeps that path deterministic.
#
# Contains no secrets — pins only. Named `.sh`, not `.env`, so it does not look
# like a credentials file to tooling that greps for one.

CHECKOV_VERSION=3.3.13

# The FAIL fixture. `gate.sh` skips it; `falsify-gates.sh` targets it.
# One name, so the skip and the falsification can never drift apart.
FIXTURE_VIOLATIONS_DIR=policy/fixtures/violations
FIXTURE_COMPLIANT_DIR=policy/fixtures/compliant

# Written by `scripts/gate.sh --write-baseline`, enforced by
# `scripts/check-baseline.sh`.
CHECKOV_BASELINE=quality-baselines/checkov-baseline.json
ACCEPTED_FINDINGS=quality-baselines/accepted-findings.json
