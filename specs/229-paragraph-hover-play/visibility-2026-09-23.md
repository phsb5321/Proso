# Hover visibility regression — 23/09/2026

Base: `7ef4e95`. Scope: engaged-origin hover during/after playback on a dark,
overflow-clipped forum-like fixture; first visits must remain untouched.
No personal page content, cookies, history, extension storage, or profile copies
are used. Daily-profile inspection is limited to the installed extension manifest
and filesystem lock metadata identifying the running profile. No deployment.

## Hypotheses and falsifiers (recorded before implementation)

| ID | Prediction | Falsifier / oracle | Initial evidence |
|---|---|---|---|
| H1 | Popup starts remember the popup rather than the page origin. | Public popup Play succeeds and the page is marked; handler tests store only the page origin after success, never after failure. | Popup calls `playback.start` without params; handler resolves active tab URL, independently of sender document ID. Existing handler tests pass. |
| H2 | Engagement marking executes before the article cache exists and is never retried. | Engagement-before-extraction with the footer visible still marks the subsequently extracted cache, without reordering it. | Existing tests cover only extraction-before-engagement. Add the reverse-order regression. |
| H3 | Marking changes cache entries but not live DOM / no control is rendered. | Attached extracted nodes acquire hover paint and a visible play cue during and after playback. | `markHoverAffordance` mutates real Elements; it only adds `proso-hoverable`. Selection controls are separate and explicitly removed at playback start. No ambient play icon exists by the original spec. |
| H4 | Low-alpha paint or a negative-left icon becomes invisible/clipped on dark hosts. | Real pointer hover yields a visible band and play cue inside the clipped paragraph, with unchanged geometry; probe light and dark host backgrounds independently of browser color scheme. | Runtime CSS is injected in `entrypoints/content.ts`; `styles/content.css` is not imported. Ambient alpha is .08/.12; selection controls use negative-left placement or inline layout. |
| H5 | Daily build predates the relevant changes. | Manifest version and source-linked deployment receipt prove the fixes are installed. | Running profile lock identifies `26av7r9w.default`; its manifest reports 1.2.12 with the closed self-distributed feed. Source is 1.2.13. Latest deployment receipt is 28/08/2026, reports 1.2.9 at `68d0b50`; it is stale. Manifest alone cannot establish exact source ancestry. |

Baseline focused tests: **4 suites, 145 tests passed**. They do not prove the
reported visible play cue; the old hover gate also incorrectly expects first-
visit marking after the 21/09 engagement amendment.

## Plan / acceptance

1. Build a loaded-Firefox regression using the real public popup Play, local
   synthetic article/audio, actual pointer hover, and measurable visible paint.
2. Prove first-visit idle/mutation/click silence; engage via successful playback;
   prove hover during playback, after Stop, after reload and a routed DOM swap.
3. Add reverse-order cache/engagement and policy regressions, run red before fix.
4. Fix only the demonstrated content seam. Keep exact-origin storage policy,
   active paragraph ordering, native links/selection, and paint-only layout.
5. Run focused unit tests, browser gate and `nix-shell --run 'make verify'`.
   Preserve sanitized receipts here; record the ledger result; commit, no push.

The 23/09 request explicitly adds a visible play cue to ambient hover. This
supersedes the original no-ambient-icon product restriction, not the no-reflow
or engaged-origin requirements. The obsolete gate's first-visit assertion must
be corrected explicitly before it can serve as acceptance for this amendment.

## Tasks

- [x] Inspect current effects, deployment manifest, policy and both start paths.
- [x] Reproduce visible symptom with loaded Firefox and timing with unit tests.
- [x] Implement the shared-seam correction (`2ab1180`; two production files).
- [x] Verify both directions, preserve receipts, and run the deterministic floor.
- [x] Attempt bounded review (unavailable), record fleet attempts and oracle verification.
- [x] Commit implementation locally; no push or deployment.

## Results and hypothesis verdicts

| ID | Verdict | Evidence / limitation |
|---|---|---|
| H1 | Falsified on current source | Real public popup Play stores exactly the fixture page origin, not the popup origin; handler success/failure tests pass. This origin path is independent of the previously broken document-identity stamp. |
| H2 | Confirmed ordering defect | Three new entrypoint tests failed before the fix: engagement plus visible footer, then `extractText`/`getParagraphs`/`getArticleText`, produced zero markers. All pass after cache completion reconciles engagement. This interleaving is demonstrated, not claimed as observed on the private page. |
| H3 | Literal cache-only theory falsified; missing control confirmed | Cached Elements are attached/live and become `proso-hoverable`. That class previously had no play control. Explicit selection icons are a separate lifecycle and can be absent or clipped. |
| H4 | Confirmed on the page class | Real Firefox, dark host + light browser preference, clipped paragraphs: baseline cue is not hit-testable and paint alpha is .08. Fixed cue is hit-testable, band alpha .22, no paragraph box or position change. |
| H5 | Version skew confirmed; ancestry unknown | Daily installed manifest is 1.2.12; source is 1.2.13. The 28/08 deployment receipt is stale. Under manifest-only inspection, inclusion of #237/#259 cannot be proved or disproved. Daily browser was not changed. |

The shared extraction-completion seam re-marks only an engaged article cache;
it does not re-extract or renumber active playback. The shared hover controller
creates one lazy, fixed button outside host clipping, defers to an already
reachable selection button, and uses the existing paragraph-click playback path.
Pointer grace, Escape, scroll, origin revocation and native links are covered.
No new storage, permissions, network destination or per-paragraph DOM insertion.

The branch was rebased onto `ae8469a` (#279) once the independently shipped
sender-identity repair landed. The first action check on the old base could not
seek a popup-started session; the final actual-pointer seek succeeds. No duplicate
sender-identity repair was added here.

### Executed acceptance

- Focused suite: **4 suites passed, 154 tests passed, EXIT=0**.
- Loaded Firefox 157.0a1: **29 checks, 0 failed, EXIT=0**.
- Loaded Firefox 155.0, final ledger oracle: **29 checks, 0 failed, EXIT=0**.
- `nix-shell --run 'make verify'`: **EXIT=0** on the final formatted gate/source.
  Includes reader integration 2/2, security 44/44, no leaks, brand/art/icons,
  deploy-preflight 45 assertions and AMO publication 7 false-green plants.
- `FC_SEED=20260923 FC_NUM_RUNS=100 make fuzz`: **EXIT=0**; extension 8/8,
  server 3/3 properties.
- `fleet-intel verify proso-hover-affordance-visibility`:
  **VERIFIED (oracle exit 0)**; three attempts retain diagnosis, implementation
  and replay findings.

Positive browser direction: public popup Play, real fixture synthesis, live
marking, hover band + hit-testable play cue on dark/light clipped pages, actual
seek via that control, persistence after Stop, reload and routed DOM replacement.
Negative direction: first-visit idle, mutation and real click yield no markers,
icons or synthesis; a different origin remains inert after the first engages.

### Receipts and reproducibility

Raw command/process logs are retained verbatim as `*.log.gz` (gzip without a
stored timestamp); compression avoids rewriting tool-emitted whitespace. JSON
receipts and screenshots remain directly readable.

- `evidence/visibility-before/`: baseline 4 failing unit regressions, five
  unreachable browser cues, screenshots and receipt. Baseline browser failure
  reproduced twice; the final baseline oracle accepts an existing reachable
  selection icon rather than requiring a particular implementation.
- `evidence/visibility-after/`: Firefox 157 passing run, focused tests, full
  floor, fuzz and initial prerequisite/format failures.
- `evidence/visibility-replay/`: preserved Firefox 155 dismissal-timing failure.
  A fixed 250ms sleep raced the 150ms pointer grace plus existing 200–300ms
  transition. The final gate retains the **same** no-cue/exact-background-equality
  predicate and polls up to 2s; it records the final off-hover snapshot too.
- `evidence/visibility-final/`: final Firefox 155 receipt, screenshots, process
  output, ledger oracle output and final full-floor output. Receipt binds the
  loaded background/content hashes, gate hash and implementation commit.

Replay with automatic Nix GC disabled (also applies before `fleet-intel verify`):

```bash
export NIX_CONFIG="${NIX_CONFIG-}"$'\nmin-free = 0\nmax-free = 0\n'
HOVER_ARTIFACT_DIR=.artifacts/hover-visibility-replay nix-shell --run 'make hover-affordance-gate'
nix-shell --run 'make verify'
```

Fresh-worktree setup required `scripts/generate-prisma.sh` and the shared-package
build. The initial unguarded shell materialization attempted host auto-GC;
no manual cleanup was requested. Subsequent Nix invocations explicitly disabled
auto-GC. The blocked prerequisite and format outputs are retained, not presented
as passes. No shared cache/worktree sweep or daily-profile activation occurred.

### Review rubric and limits

| Check | Oracle / evidence | Result |
|---|---|---|
| Engagement/privacy boundary | Policy tests, first-visit click/mutation, different-origin browser case | PASS [V] |
| Live cache and index stability | Three red→green timing tests; active-cache reference equality | PASS [V] |
| Visible, unclipped actionable control | Loaded Firefox pointer/hit-test/seek + snapshots | PASS [V] |
| Native interaction and dismissal | Focused link/selection/Escape/gutter/eviction tests; browser off-hover check | PASS [V] |
| No reflow or idle churn | Browser rectangle/position equality; 0 article writes over 3s | PASS [V] |
| Build/lint/security floor | Final `verify.log.gz`, EXIT=0 | PASS [V] |
| Different-family advice | Full GLM-5.3 public code-only packet at `2ab1180`; queue saturated before spawn | UNAVAILABLE [?], no approval claimed |

Mechanical UI detector reported only two pre-existing accent-border warnings
outside the changed hover CSS. This is verified on synthetic forum-like fixtures,
not on the authenticated private page. Version skew remains a separate deployment
concern; this task changes no installed extension or update feed.
