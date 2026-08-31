# Feature 229 — Tasks

- [x] T1 Spec + plan (this directory)
- [ ] T2 `utils/content/hover-play.ts`: `isAmbientExtractionCandidate`,
      `markHoverAffordance`, `shouldIgnoreParagraphClick`
- [ ] T3 Ambient idle extraction + hover marking in `content.ts` main()
- [ ] T4 Paint-only hover CSS in injected content styles
- [ ] T5 Shared paragraph-click guard in `setupParagraphClickHandlers`;
      collapse redundant per-branch check
- [ ] T6 Unit suite `tests/unit/content/hover-play.test.ts`
- [ ] T7 `make verify` + `make fuzz` green
- [ ] T8 `make user-gate` run with recorded evidence (fail-closed gate)
- [ ] T9 Different-family gate `GENERATOR_FAMILY=zhipu make gate`
