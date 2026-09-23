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
- [ ] Reproduce visible symptom with loaded Firefox and timing with unit tests.
- [ ] Implement the smallest shared-seam correction.
- [ ] Verify both directions, preserve receipts, and run the deterministic floor.
- [ ] Obtain bounded review advice, record fleet attempt, commit locally.
