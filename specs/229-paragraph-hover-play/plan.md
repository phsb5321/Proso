# Feature 229 — Plan

## Approach

Reuse the existing paragraph click path (`setupParagraphClickHandlers` →
`PARAGRAPH_CLICKED`, which already starts fresh playback or seeks) and the
existing extractor cache. The only genuinely new pieces are:

1. A tiny content module `utils/content/hover-play.ts` with the testable pure
   parts: the ambient-extraction gate, the hover-class marker, and the shared
   paragraph-click guard (interactive elements + text selection).
2. An idle ambient extraction + class marking step in `content.ts` main().
3. Paint-only hover CSS in the injected content styles.
4. One shared guard inserted in the click handler after the play-icon branch;
   the now-redundant per-branch interactive-element check in the selection
   branch collapses into it.

## Constitution check

- Privacy First: ambient extraction is content-script-local DOM reading; no
  network, no telemetry, no storage. PASS.
- Security by Default: no new surfaces, permissions, or secrets. PASS.
- Modular Architecture: pure helpers live in `utils/content/`, entrypoint only
  wires them. PASS.
- Test Coverage for Critical Paths: unit tests cover the gate, the marker, and
  the guard; the click path itself is already exercised by existing suites.
  PASS.

## Risks

- Heuristic extraction cost on huge app pages at idle → gated by a cheap body
  text-length check and wrapped in try/catch so it can never break the page.
- Sticky/absolutely-positioned extracted elements → no `position` or layout
  properties are touched; hover styles are paint-only.

## Verification

- `pnpm --filter @proso/extension test:unit -- hover-play` (new suite)
- `make verify` deterministic floor
- `make fuzz`
- `make user-gate` (fail-closed public acceptance; collect diagnostic evidence)
- `GENERATOR_FAMILY=zhipu make gate` (different-family typed review)
