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
| T-008 | Commit/push/PR; exact-head different-family review; own merge/closure | in progress |
| T-009 | Review finding (blocking): font-origin gate was circular — manifest-stored hash, no re-derivation. Reproduced, then closed by running `extract-font-wordmark.py --check` inside the gate; toolchain pinned in `shell.nix`; fails closed when absent | done |
