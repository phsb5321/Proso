#!/usr/bin/env bash

# Fail-closed dependency audit gate (PROSO-3).
#
# Mirrors the CI security-audit job's command (`pnpm audit --audit-level=high`)
# without its `continue-on-error: true`: any high or critical finding exits
# non-zero and fails the build. The CI job's continue-on-error removal is a
# separately gated workflow change (.github/workflows/ci.yml) — until then this
# local gate is the enforceable audit, and no green CI job is security evidence.
#
# The gate is falsifiable by plant: pin a vulnerable version of any dependency
# (e.g. vite 8.0.1 in services/proso-log-gateway), re-run `pnpm install`, and
# this script must exit 1; reverting the pin must restore exit 0.

set -Eeuo pipefail

cd "$(dirname "$0")/.."

pnpm audit --audit-level=high
