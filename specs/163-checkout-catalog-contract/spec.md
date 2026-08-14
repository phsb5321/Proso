# Feature 163 — Checkout catalog/readiness drift contract

## Goal

Mechanically ensure every paid tier and billing period that the static checkout
runtime can enable is inside the deploy-readiness hold boundary.

The shipped catalog remains Pro and Enterprise × monthly and yearly. This slice
adds no Paddle values and does not enable purchases.

## User story

A maintainer can add or change a paid checkout control only when the canonical
checkout catalog and the deploy-readiness gate change together, so no usable
price can take money outside the endpoint, wallet, complete-catalog, and evidence
holds.

## Functional requirements

- **FR-001:** The static site exposes one canonical checkout catalog containing
  every paid tier and billing period accepted by the runtime.
- **FR-002:** Runtime button discovery and period selection reject controls not
  present in that catalog.
- **FR-003:** Deploy readiness derives both `canEnablePurchase` and complete
  price-matrix validation from the same canonical catalog; it must not retain
  duplicated fixed tier/period arrays.
- **FR-004:** The canonical catalog must agree with shipped
  `data-checkout-tier` controls and the periods the billing toggle can select.
- **FR-005:** Zero usable catalog prices remains purchase-disabled: readiness
  exits 0, the endpoint hold reads NOT REQUIRED, and `--live` sends no probe.
- **FR-006:** Any usable catalog price binds every readiness hold, while a
  partial catalog leaves complete Paddle configuration OPEN.
- **FR-007:** A complete live pass still requires a registered claim route, the
  canonical HTTP 202 pending response, the extension wallet, every catalog
  price, and independent Paddle evidence.
- **FR-008:** A mutation that adds a runtime-enablable paid tier or period
  without adding it to readiness must fail and name checkout catalog drift.

## Acceptance criteria

Gherkin is intentionally not used: this repository has no Gherkin runner for
static checkout contracts. The executable oracle is
`scripts/checkout-surface-gate.mjs`.

- `node scripts/checkout-surface-gate.mjs` reports at least 28 passing checks,
  including a named catalog/readiness contract.
- `node scripts/checkout-surface-gate.mjs --plants` catches at least 34
  mutations, including a paid-control catalog-drift plant whose failure names
  the introduced tier or period.
- Existing empty, partial, 404, and canonical-202 readiness rows retain their
  PR #158 semantics.
- `make verify`, dependency/secret checks, and different-family review pass.

## Non-goals

- Provisioning Paddle tokens, price IDs, products, webhooks, or evidence.
- Enabling checkout or deploying site/server code.
- Adding a framework, bundler, runtime package, database change, or schema
  migration.
- Changing tier prices, credits, or legal terms.
