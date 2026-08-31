# Feature 229 — Tasks

- [x] T1 Spec + plan (this directory)
- [x] T2 `utils/content/hover-play.ts`: `isAmbientExtractionCandidate`,
      `markHoverAffordance`, `shouldIgnoreParagraphClick`
- [x] T3 Ambient idle extraction + hover marking in `content.ts` main()
- [x] T4 Paint-only hover CSS in injected content styles
- [x] T5 Shared paragraph-click guard in `setupParagraphClickHandlers`;
      collapse redundant per-branch check
- [x] T6 Unit and entrypoint suites for hover marking and guarded clicks
- [x] T7 Preserve ambient paragraph ordering through idle click-to-play with a
      cache-preserving extraction request, covered in entrypoint and handler tests
- [ ] T8 Rerun `make verify` + seed `20260730` / 100-run `make fuzz` on the
      rebased candidate
- [ ] T9 Rerun `make user-gate` and record its fail-closed Feature 095 verdict
- [ ] T10 Rerun final different-family `GENERATOR_FAMILY=openai make gate`
