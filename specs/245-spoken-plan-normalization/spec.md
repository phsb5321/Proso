# 245 — Spoken-plan foundation: aligned EN/PT-BR normalization

## Problem

Proso sends article text to synthesis engines raw: numbers (`2022`, `91.000`),
currency (`R$ 1.234,50`), and percent forms are read character-by-character or
garbled depending on the engine. Pedro reported pronunciation quality and
skipped/garbled spoken content as the top product pain (17/09). Any naive
rewrite changes string length, which would silently break word highlighting —
the reason this needs a plan layer, not a string replace.

Research (pronunciation-research-2026-09-17, Codex tab): Lectrice solved the
same problem deterministically with a source-aligned spoken plan
(`SpokenRun`, src/lib/prosody-plan.ts) plus a conservative EN/PT-BR number
grammar (src/lib/speech-normalization.ts) — explicitly WITHOUT an LLM.
This feature transfers that design.

## Decisions

- **Immutable source, derived spoken text.** `buildSpokenPlan(source, locale)`
  compiles ordered copy/replace segments over the unchanged source. The plan
  is deterministic; the source never mutates.
- **Conservative grammar.** Only forms the locale can prove are rewritten
  (integers, decimals, percentages, currency, clock times). Ambiguous,
  identifier-like, letter-adjacent, URL, and version-number forms are
  refused by omission. Protected spans: URLs and dotted version numbers.
- **Timing projection.** Word timings estimated/provider-published over the
  spoken text are projected back onto printed tokens: replace-segment groups
  split their time proportionally across printed words. Highlights track
  what the reader sees, not what the engine heard.
- **Locale gating.** Normalization activates for `en`/`pt-BR` detected
  languages only; everything else passes through unchanged. No settings key
  in this slice (kill-switch arrives with the lexicon slice).
- **Cache identity.** The paragraph-path cache key hashes the SPOKEN text
  (the audio's actual content), so re-normalization cannot serve stale audio.
- **Chunked path.** The paragraph plan is built once per chunked run
  (`chunkPlan`); sentence chunking, the generator request, and the
  cross-boundary prefetch text all carry spoken text; chunk timings are
  projected from the paragraph-spoken domain onto source tokens.

## Out of scope (later slices)

User pronunciation lexicon (slice 2, settings keys + UI), context grouping,
PCM boundary normalization, SSML/phoneme capability negotiation, optional
LLM normalization for unresolved spans.

## Verification

- `text-normalizer.test.ts`: the ported Lectrice corpus (EN + PT-BR
  expansions, ambiguity refusals, ordered ranges) — 6 cases.
- `spoken-plan.test.ts`: identity locales, expansions, protected spans,
  locale mapping, projection collapse/proportional split/fail-open.
- Full extension suite green; `make verify-full` green at the merged head.
