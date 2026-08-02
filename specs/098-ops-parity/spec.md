# Feature Specification: Operational Parity Bootstrap

**Feature Branch**: `098-ops-parity`
**Created**: 02/08/2026
**Status**: In progress
**Input**: Reconcile Proso with the useful local controls in the live DeliCasa fleet without copying its polyrepo or workflow complexity.

## User Scenarios & Testing

### User Story 1 - Clean local delivery from a fresh worktree (Priority: P1)

As a Proso maintainer, I can run the documented server smoke target in a fresh
worktree without manually knowing that `@proso/shared` must be built first.

**Independent Test**: With `packages/shared/dist/index.js` absent, run
`nix shell nixpkgs#gnumake --command make smoke-server-boot`. The dependency-aware
build must produce the shared package before the server and the smoke observer must
reach the HTTP route. A 503 response without PostgreSQL is an accepted boot result.

**Acceptance Scenarios**:

1. **Given** a fresh worktree with no shared build output, **when** the target runs,
   **then** the shared and server builds complete in workspace dependency order.
2. **Given** the built server has no PostgreSQL, **when** the smoke observer probes
   it, **then** the server answers HTTP with the documented 503 state rather than
   failing module resolution.
3. **Given** the fix, **when** the pnpm selection graph is inspected, **then** it
   contains only the existing shared and server workspaces and adds no dependency.

---

### User Story 2 - Product privacy and knowledge boundaries are explicit (Priority: P2)

As a product owner, I can distinguish public, project-safe, restricted operator,
and restricted user/secret data, and I can see which future controls would make each
runtime and evidence boundary falsifiable.

**Independent Test**: Review `research.md` against the Product receipt. Every data
class, audience, retention decision, browser/audio/BYOK/credit boundary, and public
Firefox oracle is present without secret values or a claim that an unimplemented
runtime control is green.

**Acceptance Scenarios**:

1. **Given** current governance, **when** telemetry is evaluated, **then** the product
   contract says zero remote telemetry until a separately ratified MAJOR amendment.
2. **Given** page text, BYOK keys, generated audio, ledger data, or raw evidence,
   **when** a knowledge/export audience is evaluated, **then** the default is deny.
3. **Given** no named consumer for generated docs, **when** vault architecture is
   chosen, **then** a private scoped Notes root plus a future deterministic local
   manifest is preferred; no repo, workflow, token, or sync is provisioned.

---

### User Story 3 - Quality gaps remain honestly split by risk (Priority: P3)

As a quality owner, I can see which controls are present, false-green, missing, or
not applicable and can implement them later as independent, negative-controlled
slices without changing workflows implicitly.

**Independent Test**: Every `present` entry in `research.md` names evidence and a
falsifier. Workflow/Sonar/action-pin changes and sync activation are explicitly
`[pending] Pedro`; local Semgrep, CodeQL, security/evidence documentation, and
complexity/performance work remain separate follow-ups.

## Requirements

### Functional Requirements

- **FR-001**: The server smoke recipe MUST select the server and its workspace
  dependencies through pnpm's existing dependency graph.
- **FR-002**: The implementation MUST NOT modify package dependencies, runtime code,
  GitHub workflows, Notes, secrets, services, tokens, or sync state.
- **FR-003**: The clean-state RED and GREEN commands and their exact outcomes MUST be
  retained in the PR evidence.
- **FR-004**: The feature MUST record a four-state operational gap matrix with file or
  command evidence and a falsifier for every `present` claim.
- **FR-005**: Product data classes MUST be P0 Public, P1 Project-safe, P2 Restricted
  operator, and P3 Restricted user/secret data, defaulting to the narrower audience.
- **FR-006**: Current product truth MUST treat remote telemetry as prohibited until a
  separately ratified constitution/product-policy change.
- **FR-007**: Server audio-cache reuse MUST remain classified false-green until it is
  requester/tenant scoped, collision resistant, and bounded by a ratified TTL.
- **FR-008**: Public privacy-copy correction, runtime privacy changes, and legal
  publication MUST remain outside this slice.
- **FR-009**: The user gate MUST remain BLOCKED until public Firefox controls and the
  unified anomaly/restart/soak receipt exist; no diagnostic shortcut may satisfy it.
- **FR-010**: Workflow/Sonar/action-pin changes and any vault/sync activation MUST be
  isolated and marked `[pending] Pedro`.
- **FR-011**: Product and Quality MUST review the exact implementation HEAD through
  the tracked owner map; Engineer is the sole implementation owner.
- **FR-012**: A different-family reviewer MUST assess the exact diff after the
  deterministic checks, with no more than two critique/fix rounds.

## Success Criteria

- **SC-001**: A fresh worktree with no shared `dist` passes `make smoke-server-boot`.
- **SC-002**: The implementation diff outside SpecKit artifacts is one Makefile line.
- **SC-003**: The audit matrix includes all three specialist receipts and contains no
  false completion claim for Sonar, browser acceptance, telemetry, cache isolation,
  evidence retention, Semgrep, or CodeQL.
- **SC-004**: No workflow, Notes, package, runtime, secret, service, token, or sync
  mutation appears in the diff.

## Assumptions and Gated Decisions

- The repository remains private; a generated docs sink is YAGNI for this slice.
- Shipped code/specs are authoritative for behavior; private Notes are authoritative
  for operator research and rationale. Any later export is one-way and read-only.
- `[pending] Pedro`: workflow edits, Sonar activation/hardening, action pinning,
  public privacy-policy publication, new repo/token/service/secret, and sync activation.
