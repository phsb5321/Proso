<!--
  SYNC IMPACT REPORT
  =================
  Version change: 2.0.0 → 2.1.0 (MINOR)

  Why MINOR — one materially expanded permission, no principle removed or
  redefined:

  Principle I gains a third permitted destination: a synthesis host the user
  operates and configured explicitly. Nothing already permitted is withdrawn,
  no business invariant changes, and no existing code becomes non-compliant.

  Rationale. Feature 099 (`specs/099-local-appliance-tts/`) exists because
  Proso currently cannot read an article to a user who has no account, no
  license key, and no provider key: Free managed synthesis returns 402 (commit
  `7e4cda0`) and browser `speechSynthesis` was removed (commit `9797dc6`).
  INV-001 — the free tier never requires account creation — therefore has no
  delivery path. A host the user runs restores one.

  Impact review. v2.0.0's Principle I enumerated destinations by ownership:
  first-party, or a named cloud BYOK vendor. A machine on the user's own
  network fits neither label while being, in privacy terms, stronger than
  both — the text reaches hardware the user controls and no third party. The
  enumeration, not the intent, was the obstacle. No shipped code depends on
  the narrower list; the only consumer is the `/speckit.plan` Constitution
  Check, which gated Feature 099's plan and produced this amendment.

  Modified principles:
    - I. Privacy First → third destination added, with conditions: off by
      default, user-supplied address, runtime-granted host permission, and no
      page content to any host the user did not configure

  Added sections: none. Removed sections: none.

  Propagation: `specs/099-local-appliance-tts/plan.md` Constitution Check
  (currently recording this as a FAIL pending ratification) becomes PASS with
  conditions once this merges. No template references the destination list.

  Ratification: this widens what the extension may do with page text. Per
  Governance it is the maintainer's call, and the amendment is held for that
  decision rather than self-merged.

  ---
  Previous report (retained)
  Version change: 1.1.0 → 2.0.0 (MAJOR)

  Why MAJOR — two backward-incompatible redefinitions, not additions:

  1. Project identity. The document still carried the pre-rebrand product name
     in its title and in Principle I's rationale. `068-proso-infra-rebrand`
     landed and the constitution never followed, so every `/speckit.plan`
     Constitution Check since has gated work against a project that no longer
     exists. The old name is deliberately not repeated here — a grep for it
     across the repository should return nothing, and this report is part of
     the repository.

  2. Governed scope. v1.1.0 governed a single Firefox WebExtension and closed
     with "refer to the project README.md". The repository now ships three
     deployables (`packages/extension` MIT, `packages/server` AGPL-3.0,
     `services/proso-log-gateway`). Principle I as written — "MUST NOT transmit
     any data to servers other than the explicitly selected TTS provider" —
     forbade the first-party Proso API that `069-server-tts-centralization`
     built and that `AGENTS.md` documents as the live synthesis path. The
     constitution contradicted the shipped product; a rule nobody can satisfy
     is not a gate. Principle I is redefined to permit exactly one first-party
     destination under stated limits, which is a narrowing of user guarantees
     versus v1.1.0 and therefore MAJOR.

  Modified principles:
    - I. Privacy First → rewritten: permits the first-party Proso API,
      keeps local-only credential storage and no-telemetry
    - II. Security by Default → extended to server-side secrets and the
      credit ledger
    - IV. Modular Architecture → restated as the hexagonal contract both
      the extension and the server actually follow
    - V. Test Coverage for Critical Paths → adds the deployable-boots gate

  Added sections:
    - "Business Invariants" (INV-001..INV-006, previously only in local notes)
    - "Spec-Driven Development" (specs are tracked; see AGENTS.md)

  Removed sections: none

  Templates status:
    ✅ .specify/templates/plan-template.md — Constitution Check section present
    ✅ .specify/templates/tasks-template.md — phase structure aligns
    ✅ .specify/templates/checklist-template.md — compatible
    ⚠️  .specify/templates/spec-template.md — file absent from `.specify/`;
        `/speckit.specify` supplies its own. Not introduced by this amendment.

  Follow-up TODOs:
    - `packages/shared` still exports `'browser'` in its TTS provider union
      while `AGENTS.md` records that browser `speechSynthesis` was deliberately
      removed. One of the two is stale. Deliberately NOT resolved here: this
      amendment may not silently pick a winner on a product question. Resolve
      in its own slice.
-->

# Proso Constitution

Proso is a Firefox-first text-to-speech reader: a WebExtension, a first-party
API that performs synthesis, and the shared domain types between them. This
document governs all three.

## Core Principles

### I. Privacy First

User credentials and preferences MUST be stored locally using the browser's
extension storage APIs. The extension MUST NOT transmit page content or user
data to any destination other than:

1. **The first-party Proso API**, for synthesis and credit accounting, and only
   for text the user has explicitly asked to have read aloud; or
2. **A TTS provider the user selected under BYOK** (OpenAI, ElevenLabs,
   Cartesia), using a key the user supplied; or
3. **A synthesis host the user operates**, at an address the user entered
   themselves.

No telemetry, no analytics, no behavioural tracking, in either direction.

The third destination carries conditions, because it is the one the user could
be led into without noticing. It MUST be off by default, so a build that the
user has not configured behaves exactly as one without the capability. The
address MUST come from the user, never from a shipped constant, a discovery
probe, or a remote configuration. The host permission MUST be requested at
runtime for that exact origin, not granted at install. Page content MUST NOT
reach any host the user did not enter, and the interface MUST state where the
text is being sent.

On retention: the server MAY hold synthesized audio in a cache keyed to the
requesting user — INV-006 ("cached content is never re-charged") depends on that
cache existing — and MUST NOT retain the source page text for any purpose other
than serving that cache entry, nor past its lifetime.

**This principle narrows a user-facing guarantee and requires ratification.**
v1.1.0 promised that no server other than the user's chosen TTS provider would
ever receive their data. The shipped product has not honoured that since
`069-server-tts-centralization`, so the text above describes reality rather than
introducing a new data flow. It is still a weaker promise than the one it
replaces, and the weakening — not the documenting — is the maintainer's call to
ratify or reject.

**Rationale**: Users trust a reader with the page in front of them. Proso
handles page content and API credentials; a privacy violation would be a
fundamental breach of that trust. v1.1.0 tried to guarantee this by forbidding
first-party servers outright — but the product needs one to centralize provider
keys and meter credits, so the honest guarantee is a *named, bounded*
destination rather than a prohibition the code already broke.

### II. Security by Default

All external requests MUST use HTTPS exclusively. BYOK keys MUST live in
`browser.storage.local`, never `localStorage`, and MUST NOT be exposed to
content scripts or page contexts. Server-side provider keys MUST come from the
environment and MUST NOT be logged, even in debug mode. Content Security Policy
MUST be as restrictive as the surface allows. Page-extracted text MUST be
sanitized before processing.

Credit deduction MUST be transactional: a synthesis that fails MUST NOT charge,
and a charge that commits MUST correspond to delivered audio.

**Rationale**: Browser extensions are high-value attack targets, and a metered
API is a high-value abuse target. A compromised extension can read every site
the user visits; an unmetered endpoint bills the operator for a stranger's
traffic.

### III. User Experience Excellence

Every user action MUST produce immediate, visible feedback. Playback controls
MUST be intuitive and keyboard-reachable. Error states MUST state what happened
and what the user can do about it. The UI MUST work in both light and dark
Firefox themes.

**Rationale**: TTS is accessibility-adjacent. Users may have visual impairments
or cognitive needs that make clear, responsive UI essential rather than
decorative.

### IV. Modular Architecture

Both the extension and the server follow hexagonal architecture:

- `core/` — pure domain logic, **zero framework imports**
- `ports/` — abstract interfaces
- `adapters/` — port implementations; every port SHOULD have a NoOp or
  in-memory adapter for tests
- a single composition root is the only place adapters are instantiated

Fallible operations MUST return `Result<T, E>` rather than throwing. `try/catch`
belongs at adapter boundaries, converting to `Err()`.

**Rationale**: Provider APIs change, browser APIs evolve, features get
requested. Isolating change behind ports is what lets a provider be added
without touching domain logic — and what lets a contract suite prove any adapter
meeting a port is substitutable.

### V. Test Coverage for Critical Paths

- Every port MUST have a contract suite that **all** its adapters run.
- Text extraction MUST have unit tests across varied HTML structures.
- Bug fixes MUST include a regression test that fails before the fix.
- **Each deployable MUST have an acceptance check that starts the built
  artifact.** Unit and contract suites construct the DI container directly and
  never execute the bootstrap chain, so they stay green while the shipped
  artifact cannot start.

A test MUST NOT be weakened, skipped, deleted, or re-baselined to reach green.

**Rationale**: The deployable-boots gate is written in blood. A dependency
override once resolved `path-to-regexp` to an incompatible major and the server
died at `NestFactory.create`, with roughly 2900 tests still passing.

## Business Invariants

These are product commitments. Changing one is a MAJOR amendment, not a feature.

| ID | Invariant |
|---|---|
| INV-001 | The free tier never requires account creation |
| INV-002 | BYOK is available on every tier |
| INV-004 | Credits never expire mid-billing-cycle |
| INV-005 | Client-side-only playback is never metered |
| INV-006 | Cached content is never re-charged |

## Spec-Driven Development

`specs/` and `.specify/` are **tracked in git**. A feature's spec, plan, and
tasks MUST be visible in the pull request that implements it. A spec that lives
only on one machine cannot be reviewed, cannot survive `git worktree remove`,
and cannot tell a future reader why the code looks the way it does.

Feature directories are `specs/NNN-slug/`, where `NNN` matches the branch and PR
number range for that work. See `AGENTS.md` for the full convention.

## Development Workflow

### Code Review Requirements

Every change MUST be reviewed for privacy compliance (no new data collection),
security posture (no credential exposure, input sanitized), correct permission
scoping, and graceful error handling.

### Quality Gates

The tracked delivery contract is `docs/agent-delivery-harness.md`.

- `make verify` — the fast deterministic floor; MUST pass before review
- `make quality` — changed-code ratchets
- `make gate` — adds the real-browser journey and a **different-model-family**
  adversarial review. The reviewer MUST NOT be from the same family as the
  author; a model reviewing its own family's output is not a gate.
- All declared extension permissions MUST be justified in the PR description
- Breaking storage-schema changes MUST ship migration logic

### Browser Compatibility

Firefox 109+ (Manifest V3 baseline). Firefox-specific API usage that diverges
from Chrome MUST be documented at the call site.

## Governance

This constitution supersedes conflicting guidance in any other project
documentation. Amendments require:

1. A written rationale for the change
2. A review of its impact on existing code, templates, and documentation
3. A semantic version bump — MAJOR for a removed or redefined principle or a
   changed business invariant, MINOR for a new principle or materially expanded
   guidance, PATCH for clarification that changes no rule
4. A SYNC IMPACT REPORT at the top of this file recording all of the above
5. Propagation to dependent templates

Reviewers MUST reject changes that violate these principles without a documented
exception justified in the implementation plan's Complexity Tracking section.

**Version**: 2.1.0 | **Ratified**: 2025-12-30 | **Last Amended**: 2026-08-05
