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
| `make fuzz` | Seeded extension playback plus server schema/credit properties; `FC_SEED` and `FC_NUM_RUNS` are replay controls |
| `make user-gate-diagnostic` | Focused properties followed by the built extension's internal-dispatch Firefox diagnostic |
| `make user-gate` | Fails closed until a public-control Firefox actor, outcome matrix, and unified receipt satisfy Feature 095 |
| `make verify` | Tool readiness, formatting, lint, type checks, reader smoke, security tests, source secret scan |
| `make coverage` | All three test suites plus ≥80% coverage on changed production lines; missing reports fail |
| `make quality` | Import boundaries, Knip/clone/OpenGrep ratchets, active-doc contract, and legacy cycle evidence |
| `make dependencies` | OSV lockfile scan; new, stale, malformed, or expired evidence fails |
| `make verify-full` | Fast floor plus coverage, Firefox/Chrome/Edge builds, quality, and dependency ratchets |
| `make inventory` | Compatibility alias for the fail-closed Knip ratchet |
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
| Knip 6 | Adopted with an expiring baseline | Gateway-aware configuration blocks new unused files/exports/dependencies without deleting on age alone |
| dependency-cruiser | Adopted | Enforces TypeScript package/layer direction across the actual resolved graph |
| OpenGrep | Adopted locally | Narrow anti-defanging rules have counted positive fixtures; no source upload or hosted account |
| OSV-Scanner | Adopted with an expiring baseline | Scans the one root lock; new and stale advisory fingerprints fail |
| SonarQube | Deferred as a gate | Historical project has no trustworthy populated baseline; a skipped scan is not green |
| CodeQL / workflow additions | Deferred | Workflow changes are outside this safe slice and GitHub licensing was not established |
| CI `pnpm audit` | Rejected as a gate | It currently exits 1 but is masked by `continue-on-error`; 73 open alerts remain |
| CI Firefox visual job | Rejected as a gate | PR #63 had 24 failures / 2 passes, masked by step-level `continue-on-error` |
| Semgrep hosted service | Skipped | Private-repository eligibility and source-upload boundary were not proven; local OpenGrep is sufficient |
| Trivy/Syft | Deferred to container slice | Lockfile evidence is covered here; image/SBOM evidence needs the candidate image digest |
| Existing Playwright audio suite | Rejected as an oracle | It can pass without a synthesis request or audio assertion |

All added local components are permissive or weak-copyleft tools, not linked runtime dependencies:
dependency-cruiser and Vitest coverage are MIT, OSV-Scanner is Apache-2.0, and OpenGrep is
LGPL-2.1. CodeQL remains skipped because this private repository has no proven GitHub Advanced
Security entitlement. The repository's own contradictory GPL/AGPL/MIT metadata is documented in
the README without choosing legal terms inside a quality PR.

## Quality foundation receipts

Slice 1a merged as PR #67 (`9c761c341fa91fca2f26badfff5a6d86874eb7df`). It makes managed
TTS debit atomic and post-success, attributes fallback/cache results to the provider that actually
synthesized the audio, and treats post-synthesis cache/logging failures as best effort.

Slice 1b adds the log gateway to the same pnpm lock and Make contract as every other shipped
package. Property tests use `FC_SEED=20260730` by default and accept `FC_NUM_RUNS` for bounded PR
and deeper nightly campaigns. Deterministic fault checks now cover credit conservation, schema
boundaries, non-finite playback progress, stale audio completion after stop, corrupt migration
versions, failed migration checkpoints, 429/5xx jitter and `Retry-After`, per-attempt deadlines,
and disconnect retry bounds.

Saved planted-failure receipts:

- `/tmp/proso-slice1-credit-red.log` — all-provider failure charged 25 credits.
- `/tmp/proso-slice1b-playback-pbt-red.log` — seed `20260730`, path `80`, minimized to `NaN`.
- `/tmp/proso-slice1b-retry-red.log` — retry runtime ignored injected bounds/hints.
- `/tmp/proso-slice1b-stale-response-red.log` — stopped playback returned to `playing`.
- `/tmp/proso-slice1b-corrupt-storage-red.log` — corrupt version skipped all migrations and a
  failed migration was incorrectly advanced to version 8.

On 30/07/2026, `make verify` completed in 22.88 seconds with receipt SHA-256
`a65ad6fa1ce06a7dacf3c920efa427337d36884f2e0e1fca9d8ab81207d3e649`. The gateway container
built from the repository root lockfile as image
`sha256:2a987b44fd24d2a220b0ee66ed48002d5be5b872959940c0b36f0f53ae2e2384` and ran its dependency
probe as non-root UID 1001. Container tags and image IDs are evidence only, not deployment.

## Quality ratchets — Slice 2

Measured against the Slice 1b foundation on 30/07/2026:

- changed-line coverage is **66/71 lines (92.96%)**, with an initial blocking floor of **80%**;
- dependency-cruiser resolves **501 modules / 805 dependencies** with zero boundary violations;
- Knip has **73** reviewed fingerprints and OSV-Scanner has **60** advisory fingerprints, both
  owned by `proso` and expiring on **30/10/2026**;
- jscpd reports **136** legacy production clone groups, with zero touching changed lines;
- the active-doc contract owns five canonical documents and rejects expiry or broken relative
  links.

The ratchets reject both new findings and stale suppressions. They also reject missing coverage
reports, malformed scanner JSON, missing tools/base commits, and an empty Jest selection. OpenGrep
checks new workflow defanging (`continue-on-error`, `|| true`, permissive Codecov) and new focused
or skipped tests; its committed fixtures must produce exactly five findings before the repository
scan can pass. At the end of `make verify-full`, an atomic Git-local receipt binds the tested HEAD,
base ref/SHA, and SHA-256 of the exact tracked-plus-untracked change bundle. Adversarial review
refuses a missing, malformed, wrong-base, parent-SHA, or changed-diff receipt before contacting a
model.

Two OpenGrep blind spots were found by committing this slice and falsifying the detector against a
real path, and both are fixed here:

- under `--baseline-commit` the scan follows the changed-file set rather than the listed target
  paths, so the detector fixtures entered the repository scan as soon as they were tracked and
  turned the gate red on its own positives. The repository scan now excludes only
  `scripts/quality/fixtures/opengrep`; the self-test still scans it and still requires exactly five
  findings;
- with no `.semgrepignore` in the repository, OpenGrep applied its bundled default ignore list,
  which drops `tests/` — the one place the focused/skipped-test rule has to look. A committed
  `describe.only` in `services/proso-log-gateway/tests/schemas.test.ts` scanned clean. The tracked
  `.semgrepignore` replaces that default with generated/vendored output only, and the same plant
  now fails the gate.

The scan reads committed history, so it sees a slice only once that slice is committed; running the
gate on an uncommitted working tree leaves the semantic ratchet with nothing to scan.

Saved falsification receipts:

- changed coverage below 80%:
  `/tmp/proso-slice2-diff-coverage-red.log` — SHA-256
  `a973bcf0692a809ec2bed56b7cc286c6f3ef1d13de953fee2138839ffb3908cf`;
- missing coverage report:
  `/tmp/proso-slice2-missing-coverage-red.log` — SHA-256
  `7a97379de8f6f5d84fde446b31804a6c93bd7b698483c922d3ea39027391b2f5`;
- forbidden inward architecture import:
  `/tmp/proso-slice2-architecture-red.log` — SHA-256
  `b4209eb0271d6e3b2470f297cbe96ae4f43aef85d1a5f3d25b4f7d32bda92b3a`;
- changed-code clone:
  `/tmp/proso-slice2-duplication-red.log` — SHA-256
  `ec15f70193616560f856ab9820cbbf410746037a84ad62f4b455fcd237e664fe`;
- new and stale Knip findings:
  `/tmp/proso-slice2-knip-red.log` — SHA-256
  `8e73691713da755d2832cf4fb80a4d0aaa8aebd42a083bddb81896f6bda9f48e`;
  `/tmp/proso-slice2-knip-stale-red.log` — SHA-256
  `d8e1461ce9403dabac7cb2d204de0fcb9cbb97d5f098df0a184f6f6ff63a7f8c`;
- new and malformed OSV evidence:
  `/tmp/proso-slice2-osv-red.log` — SHA-256
  `8fa225d61986a56a3b3a3eaacaa5a6dffd65a6214e34792f09c0fd9c9b4b18f9`;
  `/tmp/proso-slice2-osv-malformed-red.log` — SHA-256
  `8083e49cf6e06d5988a58b5f7f74f210a2ebd836796fe4e3988c37016494abbf`;
- five OpenGrep policy violations:
  `/tmp/proso-slice2-opengrep-red.log` — SHA-256
  `1437b3c0918d31e2c48b089bd19cc5970773182f413765c962401c0f9a875463`;
- committed-range secret:
  `/tmp/proso-slice2-gitleaks-range-red.log` — SHA-256
  `a4a0dc920f31633949f08c449ea814d200ba1399292695d17e2587e96e7a9609`;
- expired active document:
  `/tmp/proso-slice2-docs-red.log` — SHA-256
  `2bb72a614d75dcb9533cda2a0a941fb694471c94d8869d7356578a5c4741df88`;
- empty Jest selection:
  `/tmp/proso-slice2-empty-test-selection-red.log` — SHA-256
  `83fb8577feb9b816d0cbc0602027d62daec32f43e3b746a87ff7974665a9dbeb`;
- parent-SHA / wrong-diff gate receipt:
  `/tmp/proso-slice2-wrong-sha-red.log` — SHA-256
  `4d593b647ea56bf871f82de378257d84ceef400e1d07d4a95d5fd0352d75bcbb`;
- committed `describe.only` under `tests/`, after the ignore-list fix:
  `/tmp/proso-slice2-opengrep-testsdir-red.log` — SHA-256
  `802a07f8aba948597ccfb45b881aa72fdfaa215600c058558b689f0bea330f61`, with the plant removed in
  `/tmp/proso-slice2-opengrep-testsdir-green.log` — SHA-256
  `214f27e5e9906991f1e2562eb34cda516f5126c1ce6c9cb82f7f66e96dd2bcb1`.

The plants were removed. Green focused receipts are
`/tmp/proso-slice2-diff-coverage-green.log` (SHA-256
`37db2ecdd245de56a40f15255fbca83ab176f21403c89971c9f8249c92fcf98b`),
`/tmp/proso-slice2-quality-ratchets-green.log` (SHA-256
`f0aefc934e28a81455daff252c3b48236a07c487f0b08aa891bc4cd77e64cdc4`), and
`/tmp/proso-slice2-security-green.log` (SHA-256
`c541c8b56fb90297bb33b9820e96176a10be27998b159fb37aa1a45367b722fe`).
The complete `make verify-full` gate passed in **132 seconds**; its receipt is
`/tmp/proso-slice2-verify-full.log`, SHA-256
`794495506a9bda39da0868def500b09e16a18f0718db4854a6aaf34e68aa10a7`.


## Handoff format

Every handoff records: hypothesis/falsifier, changed files, exact commands and exit status, planted
violation evidence, typed reviewer verdict, unresolved browser/production gaps, PR state, and a
one-line revert command. Do not translate “compiled”, “unit-covered”, “reviewed”, or “PR open” into
“works in Firefox” or “done”.
