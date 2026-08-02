# Feature 097 — Reading journey contract delta

## Goal

Make the merged Feature 095 contract operational without duplicating it:
define what falsifies every required journey, align the BYOK oracle with the
shipped server-proxy route, and remove active documentation claims contradicted
by current `main`.

## Requirements

- **FR-001:** Every Feature 095 product outcome must name deterministic evidence
  that makes the outcome fail.
- **FR-002:** The BYOK oracle must permit the Proso API to receive a key only for
  the explicit request while forbidding retention, logging, wrong-provider
  forwarding, and managed-credit deduction.
- **FR-003:** The evidence ledger must classify the 02/08 Firefox run as a
  downstream diagnostic because its actor invoked an internal command path.
- **FR-004:** README and agent guidance must not claim that current `main`
  provides no-key managed Free-tier synthesis.
- **FR-005:** The delivery harness must link to the merged Feature 095 contract
  and distinguish diagnostic smoke from public-control acceptance.
- **FR-006:** The active-document policy must own the canonical merged contract
  directly.
- **FR-007:** No second copy of the reading contract may be introduced.

## Acceptance

- A reviewer can identify a positive oracle and a falsifier for each journey.
- The BYOK path names both permitted destinations in the shipped architecture:
  the Proso API transiently and the explicitly selected provider.
- Active docs contain no green claim that current no-key managed reading works.
- The Firefox evidence ledger records what the internal-dispatch run proved and
  what it did not prove.
- `make docs`, contradiction searches, and `git diff --check` pass.

## Out of scope

- Choosing or implementing the anonymous managed-TTS entitlement.
- Editing Feature 093/096 runtime code or acceptance harnesses.
- Re-running the real Firefox/user gate owned by Quality.
- Re-submitting the already-merged Feature 095 spec as a new contract.
