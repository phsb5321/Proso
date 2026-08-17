# Feature 180 — Plan

## Slices

1. **Digest script** — `scripts/shared-source-digest.mjs`: deterministic
   tree sha256 over `packages/shared/src` (sorted paths, content hashes,
   manifest hash; no trailing newline), mirroring the Prisma digest
   convention.
2. **Stamp in build** — `packages/shared/package.json` build script appends
   the digest write after `tsc`; covers every `make build*` path.
3. **Doctor block** — `scripts/delivery-doctor.sh`: not-built → RED;
   no-stamp → RED; digest mismatch → RED naming both digests.
4. **Specs** — `specs/180-shared-dist-drift/{spec,plan,tasks}.md` tracked in
   the same diff (mandatory).
5. **Plants + receipts** — fresh-worktree no-dist RED; build → GREEN;
   touch source → RED with digest names; rebuild → GREEN; rm stamp → RED
   (no-stamp fail-closed).
6. **Gates** — `nix-shell --run "make verify"` exit 0 (doctor is the first
   step; shared built first).
7. **Ship** — commit (conventional, ≤72-char subject), push, PR
   `fix(scripts): ...`; report PR number + receipts; do NOT merge (per
   brief).

## Reversal

`git revert <squash-merge-sha>` — one PR; digest script + build stamp +
doctor block revert together.
