# Agent delivery harness

Last reconciled: 30/07/2026 16:55 BRT.

This is the persistent delivery contract for Proso. The Makefile is the single command surface;
package scripts remain implementation details. A green build is not a browser acceptance result,
and an agent review cannot override a red deterministic check.

## Startup protocol

1. Confirm `git rev-parse --show-toplevel` is an isolated `proso-NNN-slug` worktree. Never mutate
   the shared main worktree.
2. Read this file and `docs/reading-journey-status.md`.
3. State one causal hypothesis and one falsifier before changing code.
4. Run `make doctor`. Run `make bootstrap` only when dependencies or generated Prisma types are
   missing.
5. Capture the smallest relevant failing check before implementation.

## Command contract

| Command | Enforced outcome |
|---|---|
| `make smoke-reader` | Real extractor → no-license API request → server TTS adapter → cache/audio/highlight state → controls |
| `make verify` | Tool readiness, formatting, lint, type checks, reader smoke, security tests, source secret scan |
| `make verify-full` | Fast floor plus all workspace tests, Firefox/Chrome/Edge builds, cycles, duplication |
| `make inventory` | Reports Knip debt; informational until its workspace model is configured and baselined |
| `GENERATOR_FAMILY=openai make gate` | Full deterministic gate, then exact-ID Anthropic typed review |
| `GENERATOR_FAMILY=openai ADVERSARIAL_REVIEWER=meta-llama make gate` | Capacity fallback: exact Meta Llama 3.3 70B review through the configured Groq lane |
| `GENERATOR_FAMILY=anthropic make gate` | Full deterministic gate, then exact-ID OpenAI typed review |
| `make status` | Branch/diff facts only; it never labels unrun checks green |

`GENERATOR_FAMILY=zhipu` also routes to an OpenAI reviewer. The Meta fallback is permitted only for
OpenAI-generated work: Meta Llama is a different Western model family, while Groq's GPT-OSS models
remain disallowed for that case because they share OpenAI lineage. Same-family review is rejected.
The review schema requires `PASS` or `BLOCK`, exactly one concrete trace for each `REQ-1` through
`REQ-6`, and typed findings. Malformed output, a missing/duplicate ID, any failed trace, any finding,
or `BLOCK` exits non-zero.

## Requirements and stop conditions

Delivery may advance only when all applicable requirements trace to code plus a runnable check:

- Article extraction yields the same ordered paragraphs used for speech and highlighting.
- Free-tier synthesis reaches `POST /api/v1/tts/synthesize` without `X-License-Key` or BYOK data.
- Playback shows the footer, tracks paragraph/word state, and supports pause, resume, speed, seek,
  previous, next, and stop.
- Shell gates use strict mode, validate dependencies, clean temporary data, redact secret findings,
  and fail closed.
- Documentation separates deterministic integration, compiled artifacts, real-browser evidence,
  and production evidence.

Stop rather than claim completion if a required deterministic gate is red, the typed review blocks,
the browser symptom was not observed after a browser change, or the remaining action crosses the
release/store/production/credential boundary.

## Browser boundary

Playwright runs only through Docker on this NixOS host. The existing Chromium audio suite is not an
acceptance oracle: it does not initiate the current background synthesis path and cannot assert
background audio. Chrome MV3 also has separate response/audio runtime gaps recorded in the reading
status. `build-chrome` proves compilation only. A future browser gate must intercept background
requests at `BrowserContext`, prove a synthesis request occurred, and assert user-visible playback
and control state.

## Tool decisions

| Tool | Decision | Reason |
|---|---|---|
| Jest, WXT, Biome, TypeScript | Adopted | Already pinned; directly exercise the current packages |
| Madge | Adopted after repair | `--extensions ts` prevents the previous zero-file false green |
| jscpd | Adopted | Existing 10% threshold is measurable; current scoped result is below it |
| Gitleaks | Adopted | Scans tracked and non-ignored working-tree files; known placeholders use exact fingerprints |
| GNU Make | Adopted | Small stable interface over existing commands; no new runtime dependency |
| Claude/Codex/Meta structured output | Adopted | Exact model IDs, family checks, inlined full diff/context, typed fail-closed review |
| Knip | Deferred as a gate | Current config reports broad false/unbaselined workspace debt; kept as `inventory` |
| SonarQube | Deferred as a gate | Historical project has no trustworthy populated baseline; a skipped scan is not green |
| CodeQL / workflow additions | Deferred | Workflow changes are outside this safe slice and GitHub licensing was not established |
| CI `pnpm audit` | Rejected as a gate | It currently exits 1 but is masked by `continue-on-error`; 73 open alerts remain |
| CI Firefox visual job | Rejected as a gate | PR #63 had 24 failures / 2 passes, masked by step-level `continue-on-error` |
| OSV/Trivy/Semgrep additions | Deferred | No reproduced gap justified another install/network scanner in this slice |
| Existing Playwright audio suite | Rejected as an oracle | It can pass without a synthesis request or audio assertion |

## Handoff format

Every handoff records: hypothesis/falsifier, changed files, exact commands and exit status, planted
violation evidence, typed reviewer verdict, unresolved browser/production gaps, PR state, and a
one-line revert command. Do not translate “compiled”, “unit-covered”, “reviewed”, or “PR open” into
“works in Firefox” or “done”.
