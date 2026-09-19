# 251 — User pronunciation lexicon (provider-neutral)

## Problem

Readers cannot correct how a voice says a name, acronym, or term. Pedro's
competitor research (18/09/2026) ranks "precise navigation and pronunciation
across engines" among the top gaps, and the provider matrix shows that
per-provider phoneme/SSML/dictionary APIs are fragmented (Azure SSML+PLS, xAI
JSON replace, Polly PLS, ElevenLabs dictionary locators, most others none).
Provider-specific markup would fragment the product and lock features per
provider.

## Decision

Compile the reader's rules into the SPOKEN TEXT through the existing spoken
plan (245), so every provider — managed, BYOK, or a local host — gets the
corrected pronunciation with no provider-specific code. The plan's alignment
keeps highlighting on the printed token after the substitution.

- Entry model: literal `match` → `spoken` (word or phrase mode, case
  sensitivity, locale `all`/`en`/`pt-BR`, enabled flag). No user regex (ReDoS
  surface deliberately closed).
- Precedence: reader entries outrank every built-in rule on the same span;
  among entries, longer matches win, then declaration order.
- Integration: `buildSpokenPlan(source, locale, lexicon)` now composes four
  edit sources — lexicon, dates (246), acronyms (246), numbers (Lectrice
  transfer) — each claiming non-overlapping spans in that order. This also
  wires the 246 date/acronym modules into playback for the first time.
- Storage: settings keys `pronunciationLexiconEnabled` +
  `pronunciationLexicon` (schema, defaults, port, adapter), limits 200 entries
  / 80 chars match / 120 chars spoken enforced at both boundaries.
- UI: a Pronunciation accordion in the settings page edits rules as
  `printed text => spoken text` lines through a pure parser
  (`options/pronunciation-rules.ts`) that preserves richer per-entry fields
  for unchanged matches and reports per-line errors inline.

## Out of scope

Per-provider native dictionaries/phonemes (Azure PLS, ElevenLabs dictionary
locators) — the provider matrix records them as a later capability-negotiated
slice; phoneme (IPA) input; import/export.

## Verification

- Pure layer: lexicon compile (word/phrase modes, longest-match precedence,
  locale filtering, invalid-entry guards) + plan integration (printed-token
  alignment, user-over-builtin precedence, unknown-locale `all` entries).
- Service: a configured rule reaches the synthesis request (`Proso reads.` →
  `Prôzo reads.`) through the real prefetch harness.
- UI: parser round-trip + error reporting.
- Full extension suite at the merged head.
