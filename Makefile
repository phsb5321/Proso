SHELL := /bin/bash
.SHELLFLAGS := -Eeuo pipefail -c
.DEFAULT_GOAL := help
.DELETE_ON_ERROR:
.NOTPARALLEL:

PNPM ?= pnpm
GENERATOR_FAMILY ?=
ADVERSARIAL_REVIEWER ?= default
FC_SEED ?= 20260730
FC_NUM_RUNS ?= 100

.PHONY: help doctor bootstrap format-check lint typecheck smoke-reader smoke-reading \
	smoke-server-boot local-host-journey-gate local-host-journey-plants \
	checkout-surface-gate checkout-surface-plants checkout-deploy-readiness \
	license-settings-gate license-settings-plants \
	fuzz user-gate-diagnostic chrome-mv3-diagnostics user-gate test-fast test build build-chrome build-all coverage architecture \
	stale duplication semantic docs dependencies quality inventory security verify \
	verify-full adversarial gate ci status

help: ## Show the delivery commands.
	@awk 'BEGIN {FS = ":.*## "; printf "Proso delivery harness\n\n"} \
		/^[a-zA-Z0-9_-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

doctor: ## Fail when required local delivery tools or generated Prisma types are missing.
	@./scripts/delivery-doctor.sh

bootstrap: ## Install the frozen workspace and generate Prisma types.
	$(PNPM) install --frozen-lockfile
	@./scripts/generate-prisma.sh

format-check: ## Check tracked TypeScript/JavaScript formatting.
	$(PNPM) --filter @proso/extension format:check
	$(PNPM) --dir packages/server exec biome format src/
	$(PNPM) exec biome format packages/shared/src
	$(PNPM) --filter @proso/log-gateway format:check
	@./scripts/biome-changed.sh format

lint: ## Lint every shipped TypeScript workspace with the pinned Biome.
	$(PNPM) --filter @proso/extension lint
	$(PNPM) --dir packages/server exec biome lint src/
	$(PNPM) exec biome lint packages/shared/src
	$(PNPM) --filter @proso/log-gateway lint
	@./scripts/biome-changed.sh lint

typecheck: doctor ## Type-check all TypeScript workspace packages in parallel.
	$(PNPM) --parallel --filter @proso/extension --filter @proso/server \
		--filter @proso/shared --filter @proso/log-gateway exec tsc --noEmit

smoke-reader: ## Run the in-process (jsdom) extraction-to-playback reader oracle.
	NODE_OPTIONS='--experimental-vm-modules' $(PNPM) --filter @proso/extension exec jest \
		--selectProjects integration --runInBand tests/integration/reader-journey.test.ts

smoke-reading: ## Drive the built extension in a real Firefox and assert the reading journey.
	$(PNPM) --filter @proso/extension build:firefox
	@node scripts/smoke-reading.mjs

public-actor-gate: ## Drive the built extension through public controls only (no internal dispatch).
	$(PNPM) --filter @proso/extension build:firefox
	@node scripts/public-actor-gate.mjs

public-actor-plants: ## Prove every public-actor-gate assertion catches a planted break.
	$(PNPM) --filter @proso/extension build:firefox
	@node scripts/public-actor-plants.mjs

local-host-journey-gate: ## Prove the account-free read: the reader's own host serves the article and the managed route is never called.
	$(PNPM) --filter @proso/extension build:firefox
	@node scripts/local-host-journey-gate.mjs

local-host-journey-plants: ## Prove every local-host-journey-gate assertion catches a planted break.
	$(PNPM) --filter @proso/extension build:firefox
	@node scripts/local-host-journey-plants.mjs

license-settings-gate: ## Prove the paid-account settings surface: a typed licence key is validated, saved, and still configured after a reopen.
	$(PNPM) --filter @proso/extension build:firefox
	@node scripts/license-settings-gate.mjs

license-settings-plants: ## Prove every license-settings-gate assertion catches a planted break.
	$(PNPM) --filter @proso/extension build:firefox
	@node scripts/license-settings-plants.mjs

smoke-server-boot: ## Start the built server and assert it bootstraps and routes HTTP.
	$(PNPM) --filter '@proso/server...' build
	@node scripts/smoke-server-boot.mjs

checkout-surface-gate: ## Drive the purchase surface (buy controls, claim secret, licence handoff) in jsdom.
	@node scripts/checkout-surface-gate.mjs

checkout-surface-plants: ## Prove every checkout-surface-gate assertion catches a planted break.
	@node scripts/checkout-surface-gate.mjs --plants

checkout-deploy-readiness: ## Fail closed: purchase must stay disabled until the claim endpoint, the licence-key wallet, and a complete Paddle config exist.
	@node scripts/checkout-deploy-readiness.mjs

fuzz: ## Run seeded extension/server properties; override FC_SEED and FC_NUM_RUNS.
	FC_SEED=$(FC_SEED) FC_NUM_RUNS=$(FC_NUM_RUNS) NODE_OPTIONS='--experimental-vm-modules' \
		$(PNPM) --filter @proso/extension exec jest --selectProjects unit --runInBand \
		tests/unit/playback/playback-state.property.test.ts \
		tests/unit/license/license-mask.property.test.ts
	FC_SEED=$(FC_SEED) FC_NUM_RUNS=$(FC_NUM_RUNS) \
		$(PNPM) --filter @proso/server exec jest --runInBand \
		tests/unit/core/shared/tts-schema.property.spec.ts \
		tests/unit/core/tts/tts-credit.property.spec.ts

user-gate-diagnostic: fuzz smoke-reading ## Run seeded models and the internal-dispatch Firefox diagnostic.

chrome-mv3-diagnostics: ## Reproduce the Chrome MV3 reading failures on current main (Feature 106).
	$(PNPM) --filter @proso/extension build:chrome
	$(PNPM) --filter @proso/extension build:firefox
	@node scripts/chrome-mv3-diagnostics.mjs

user-gate: user-gate-diagnostic ## Fail closed until a public-control Firefox actor satisfies Feature 095.
	@echo 'BLOCKED: smoke-reading invokes Firefox internal shortcuts.onCommand and is diagnostic-only.' >&2
	@echo 'BLOCKED: public-control, anomaly/restart/soak, and unified receipt evidence are required by Feature 095.' >&2
	@exit 2

test-fast: smoke-reader ## Alias for the fast outcome-level reader check.

test: ## Run workspace test suites concurrently.
	@./scripts/test-workspace.sh

build: ## Build every buildable pnpm workspace package.
	$(PNPM) --filter @proso/shared build
	$(PNPM) --parallel --aggregate-output --filter @proso/extension \
		--filter @proso/server --filter @proso/log-gateway run build

build-chrome: ## Compile the Chromium extension artifact (not a journey acceptance test).
	$(PNPM) --filter @proso/extension build:chrome

build-all: ## Build the workspace plus Chromium and Edge extension artifacts.
	$(PNPM) --filter @proso/shared build
	$(PNPM) --parallel --aggregate-output --filter @proso/extension \
		--filter @proso/server --filter @proso/log-gateway run build
	$(PNPM) --filter @proso/extension build:chrome
	$(PNPM) --filter @proso/extension exec wxt build -b edge

coverage: ## Run every suite and require at least 80% coverage on changed production lines.
	@node scripts/quality/diff-coverage.self-test.mjs
	@./scripts/coverage-workspace.sh

architecture: ## Enforce package and layer import boundaries.
	$(PNPM) exec depcruise --config .dependency-cruiser.cjs packages services scripts \
		--output-type err

stale: ## Reject new unused code/dependencies and expired or stale baseline entries.
	@node scripts/quality/knip-ratchet.mjs

duplication: ## Reject duplication touching changed production lines.
	@node scripts/quality/duplication-ratchet.mjs

semantic: ## Reject new fail-open policy patterns with tested OpenGrep rules.
	@./scripts/opengrep-check.sh

docs: ## Check ownership, review expiry, and relative links for active documentation.
	@node scripts/quality/check-active-docs.mjs

dependencies: ## Reject new advisories and expired or stale OSV baseline entries.
	@./scripts/osv-check.sh

quality: architecture stale duplication semantic docs ## Enforce changed-code quality ratchets.
	$(PNPM) --filter @proso/extension quality

inventory: stale ## Compatibility alias for the fail-closed unused-code ratchet.

security: doctor build ## Build required fixtures, run security tests, and scan source plus commits.
	NODE_OPTIONS='--experimental-vm-modules' $(PNPM) --filter @proso/extension exec jest \
		--selectProjects security --maxWorkers=100%
	@./scripts/security-check.sh
	@./scripts/dependency-audit.sh

verify: doctor format-check lint typecheck smoke-reader smoke-server-boot security brand-assets icons ## Fast delivery floor.

brand-assets: ## Brand segments, SVG masters, proofs, and icon topology must stay reproducible.
	node scripts/verify-brand-assets.mjs

icons: ## Icon PNGs must be regenerable from their band SVGs (anti-rot gate).
	$(PNPM) --filter @proso/extension icons:check

verify-full: verify coverage build-all quality dependencies ## Deep deterministic gate before review.
	@./scripts/write-gate-receipt.sh

adversarial: ## Run a different-family, typed, fail-closed review (requires GENERATOR_FAMILY).
	@test -n "$(GENERATOR_FAMILY)" || { \
		echo "GENERATOR_FAMILY is required: openai, anthropic, or zhipu" >&2; exit 2; }
	@DETERMINISTIC_GATE='make verify-full: PASS' \
		GENERATOR_FAMILY='$(GENERATOR_FAMILY)' \
		ADVERSARIAL_REVIEWER='$(ADVERSARIAL_REVIEWER)' ./scripts/adversarial-review.sh

gate: verify-full smoke-reading adversarial ## Deterministic checks, the real-browser journey, then the typed adversarial gate.

# `ci` deliberately stops at verify-full: smoke-reading needs a real Firefox and
# geckodriver on the host, and a missing browser must fail the local gate loudly
# rather than turn every hosted run red on a tooling gap.
ci: verify-full ## Deterministic CI entry point; model review remains an explicit local gate.

status: ## Show branch, worktree, and diff state without claiming unrun checks are green.
	@git status --short --branch
	@git diff --stat
	@git diff --check
