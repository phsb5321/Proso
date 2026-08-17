# Feature 180 — Tasks

- [x] T1 — `scripts/shared-source-digest.mjs` (deterministic source-tree sha256).
- [x] T2 — `packages/shared/package.json`: build stamps `dist/.source.sha256`.
- [x] T3 — `scripts/delivery-doctor.sh`: shared block (not-built / no-stamp /
  digest-mismatch all RED, naming digests on mismatch).
- [x] T4 — Spec/plan/tasks tracked under `specs/180-shared-dist-drift/`.
- [x] T5 — Plants: not-built RED → build GREEN → touch-source RED naming
  mismatch (f8bda487af16 vs 4c8f234fc0e9) → rebuild GREEN → rm stamp RED
  (no-stamp fail-closed). All receipts recorded.
- [x] T6 — `nix-shell --run "make verify"` exit 0 (after dated allowlist
  entry for the pre-existing GHSA-ggr8-5vv4-36mx chain; zero baseline
  entries existed → base was red before this diff).
- [x] T7 — Commit, push, PR `fix(scripts): ...`, report number + receipts
  (no merge).
