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
- [x] T8 `make verify` + seed `20260730` / 100-run `make fuzz` green at
      `fa629ba`
- [x] T9 `make user-gate` run at `fa629ba`: loaded-Firefox diagnostic PASS,
      receipt `.artifacts/smoke-reading/receipt.json`; Feature 095 verdict
      remains honestly BLOCKED (exit 2)
- [ ] T10 Final different-family gate `GENERATOR_FAMILY=openai make gate`
