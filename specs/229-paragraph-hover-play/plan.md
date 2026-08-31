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
5. The idle/stopped `PARAGRAPH_CLICKED` handler marks its existing article
   extraction request cache-preserving. Content reuses a populated ambient
   cache, but falls back to extraction when idle work has not run, so the
   clicked DOM index and playback queue always use the same ordering.

## Constitution check

- Privacy First: ambient extraction is content-script-local DOM reading; no
  network, no telemetry, no storage. PASS.
- Security by Default: no new surfaces, permissions, or secrets. PASS.
- Modular Architecture: pure helpers live in `utils/content/`, entrypoint only
  wires them. PASS.
- Test Coverage for Critical Paths: unit tests cover the gate, marker, guard,
  real content entrypoint, and background click handler, including preservation
  of ambient cache ordering through first playback. PASS.

## Risks

- Heuristic extraction cost on huge app pages at idle → gated by a cheap body
  text-length check and wrapped in try/catch so it can never break the page.
- Sticky/absolutely-positioned extracted elements → no `position` or layout
  properties are touched; hover styles are paint-only.

## Verification

- Targeted unit suites: `content-hover-play.test.ts`, `hover-play.test.ts`, and
  `playback.handlers.test.ts`
- `make verify` deterministic floor
- `make fuzz`
- `make user-gate` (fail-closed public acceptance; collect diagnostic evidence)
- `GENERATOR_FAMILY=openai make gate` (final Anthropic review is independent
  from both the original Zhipu implementation and the OpenAI repair)
