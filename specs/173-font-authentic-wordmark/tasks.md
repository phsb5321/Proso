# Feature 173 — Tasks

| ID | Task | State |
|---|---|---|
| T-001 | Verify date, confirm PR #167 MERGED, create isolated worktree `173-font-authentic-wordmark` from fresh origin/main | done |
| T-002 | Research winner + provenance: vendor font + OFL + manifest; record metric gate and decision delta | done |
| T-003 | Deterministic font-outline extraction (HarfBuzz whole-string shaping, uniform scale, tracking) into canonical wordmark source | done |
| T-004 | Regenerate `brand/svg/*` (wordmark + lockups) and site og-image from new canonical wordmark | done |
| T-005 | Font-origin gate in `verify-brand-assets.mjs`: font hash, instance params, outline hash, no hand-authored substitution | done |
| T-006 | Falsifier: planted font/parameter/path mutations fail red naming the drift; focused gates + proofs regenerated | done |
| T-007 | Feature 161 decision delta (dated) + full gates: `make verify`, `make quality`, dependency/secret audits, git diff checks | done |
| T-008 | Commit/push/PR; exact-head different-family review (DeepSeek) returned `VERDICT: ALLOW` at `5e4e8bb` after reproducing and closing the blocking finding; own merge/closure | done |
| T-009 | Review finding (blocking): font-origin gate was circular — manifest-stored hash, no re-derivation. Reproduced (the coordinated forgery passed exit 0 and printed its own forged hash), then closed by running `extract-font-wordmark.py --check` inside the gate; toolchain added to `shell.nix`; fails closed when absent | done |
| T-010 | Review findings (non-blocking): dead double-outlining removed (byte-identical output proves it dead), toolchain versions recorded in the manifest, receipt relabelled `source`, and the `shell.nix` comment corrected — the channel is not pinned and no longer claims to be | done |
