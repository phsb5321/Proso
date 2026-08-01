SHELL := /bin/bash
.SHELLFLAGS := -Eeuo pipefail -c
.DEFAULT_GOAL := help
.DELETE_ON_ERROR:
.NOTPARALLEL:

PNPM ?= pnpm
GENERATOR_FAMILY ?=
ADVERSARIAL_REVIEWER ?= default

.PHONY: help doctor bootstrap format-check lint typecheck smoke-reader smoke-reading \
	smoke-server-boot test-fast test build build-chrome build-all coverage architecture \
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

smoke-server-boot: ## Start the built server and assert it bootstraps and routes HTTP.
	$(PNPM) --filter @proso/server build
	@node scripts/smoke-server-boot.mjs

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

verify: doctor format-check lint typecheck smoke-reader smoke-server-boot security ## Fast delivery floor.

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
