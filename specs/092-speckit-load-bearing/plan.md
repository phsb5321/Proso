# Implementation Plan: Make spec-driven development load-bearing

**Branch**: `092-speckit-load-bearing` | **Date**: 2026-08-01
**Spec**: [spec.md](./spec.md)

## Summary

Stop ignoring `specs/` and `.specify/`; state the convention in tracked files;
bring the constitution to the project that actually exists. The change is
configuration and documentation — no runtime code is touched — but it is
load-bearing for every future slice, because it decides whether the speckit
chain produces evidence or theatre.

## Technical Context

**Language**: n/a (configuration + Markdown)
**Affected files**: `.gitignore`, `AGENTS.md`, `.specify/**`, `specs/**`
**Runtime impact**: none — no file in `packages/` or `services/` changes
**Testing**: `make verify`, `make quality`
**Scale**: 157 newly-tracked files (543 on disk minus 386 under `_archive/`)

## Constitution Check

Gated against the **incoming** constitution (v2.0.0), since this change writes
it. Against v1.1.0 the check is vacuous — it governs "VoxPage".

| Principle | Applies? | Verdict |
|---|---|---|
| I. Privacy First | No runtime change | PASS — no new data flow |
| II. Security by Default | Newly tracking 157 files | **Gate**: they must be scanned for credentials before they become public history. `make verify` runs `security-check.sh` (gitleaks over source and commits); GitGuardian runs in CI. |
| III. UX Excellence | n/a | PASS |
| IV. Modular Architecture | No source moves | PASS — `make quality` runs `depcruise` to confirm |
| V. Test Coverage | No test touched | PASS — baselines must be identical, not merely green |
| Spec-Driven Development | This *is* the principle | PASS by construction: FR-007 requires this plan to appear in its own diff |

**Complexity Tracking**: no exception claimed.

## Approach

### Why track rather than keep ignoring

Two coherent options existed. Ignoring `specs/` is defensible *if* the project
stops claiming speckit as its workflow — but Proso does claim it, dispatches
work through it, and names spec directories in binding instructions. Given that,
the untracked convention produces exactly the failure already observed: PR #73
was instructed to produce `specs/088-reading-outcome-spine/` and merged without
it, and nothing could have caught that.

Tracking also removes a mechanical hazard discovered while implementing this
slice: `.specify/` being ignored means it is **absent from every fresh
worktree**. An agent that creates a worktree per the project's own git rules
cannot run `/speckit.plan` there, because the templates and the constitution
did not come with it.

### Sequencing

1. `.gitignore` — un-ignore `specs/` and `.specify/`; add `specs/_archive/` with
   its reason. Regroup the remaining entries under an honest heading: what stays
   ignored is *agent runtime config*, not "AI development tools", since the
   specs were never that.
2. Copy `.specify/` and non-archive `specs/` into the worktree — they are not
   there, per the hazard above.
3. Amend the constitution to v2.0.0 with a SYNC IMPACT REPORT.
4. Document the convention in `AGENTS.md` (already tracked, already canonical
   for conventions).
5. Run `make verify` and `make quality`; fix any finding by scoping the tool,
   never by weakening a check.

### Risks

| Risk | Mitigation |
|---|---|
| A credential is hiding in 157 previously-private files | gitleaks in `make verify`, GitGuardian in CI, both blocking |
| Quality ratchets start scanning `specs/**/*.ts` as production source | Run `make quality` before pushing; scope the tool if it fires |
| The constitution amendment silently resolves an open product question | Explicitly deferred in the SYNC IMPACT REPORT follow-up TODOs |

## Project Structure

```
specs/092-speckit-load-bearing/
├── spec.md      # what and why
├── plan.md      # this file
└── tasks.md     # ordered, checkable
```

No source directory changes.
