# Feature 161 — Tasks

| ID | Story | Task | State |
|---|---|---|---|
| T-001 | US1 | Add `brand/source/proso-brand-board.png` with recorded source hash | done |
| T-002 | US1 | Define eight crop rectangles in `brand/segments.json` | done |
| T-003 | US1 | Implement deterministic crop/check modes in `scripts/segment-brand-board.mjs` | done |
| T-004 | US1 | Generate `brand/segments/*.png` and verify every decoded dimension | done |
| T-005 | US1 | Document the segment inventory in `brand/README.md` | done |
| T-006 | US2 | Author normalized primary waveform mark and compact dot mark | in progress |
| T-007 | US2 | Author both `p`/stroke-contrast wordmark proof families | pending |
| T-008 | US2 | Select the documented default and export wordmark, lockups, and mono/reversed variants | pending |
| T-009 | US2 | Record all geometry constants and decisions in `brand/GEOMETRY.md` and `brand/PROVENANCE.md` | pending |
| T-010 | US3 | Replace `band-16.svg` with a true native-size compact optical drawing | pending |
| T-011 | US3 | Replace `band-48.svg` with the richest topology that passes native 48px checks | pending |
| T-012 | US3 | Replace `band-128.svg` with the full-detail primary mark | pending |
| T-013 | US3 | Regenerate extension PNGs and prove 16/48/128 geometry hashes differ | pending |
| T-014 | US4 | Implement `scripts/verify-brand-assets.mjs` structural/topology/palette/contrast gates | pending |
| T-015 | US4 | Generate deterministic proof/contact sheets across variants, sizes, and backgrounds | pending |
| T-016 | US4 | Update icon conventions and brand quickstart | pending |
| T-017 | US4 | Run asset gate, icon regeneration twice, `make verify`, and different-family review | pending |
| T-018 | US4 | Push, open PR, poll CI/review clean, and squash-merge if safe-class | pending |

## Dependencies

- T-001–T-005 form the reference-extraction slice and block all geometry work.
- T-006 and T-007 can proceed in parallel after US1.
- T-008/T-009 depend on both canonical geometry streams.
- T-010–T-012 depend on the selected masters but are independent files.
- T-013–T-017 depend on all shipping assets.
- T-018 requires every blocking local and CI gate green.
