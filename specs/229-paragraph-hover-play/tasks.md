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
      `8bd7cca`
- [x] T9 `make user-gate` at `8bd7cca`: loaded-Firefox diagnostic PASS and
      receipt written; Feature 095 remains honestly BLOCKED (exit 2)
- [x] T10 `GENERATOR_FAMILY=openai make gate` at implementation head `95160cc`:
      Anthropic PASS with no findings; 3,287 tests and 84.00% diff coverage
