# What Proso can take from Lectrice's narration work — 29/08/2026

Lectrice (`phsb5321/tauri-pdf-reader`) is a sibling reader that narrates PDFs. Since 23/08/2026 it
has been rebuilding its narration path, and **it drives the same synthesis appliance Proso does**:
`http://127.0.0.1:5301`, `GET /health`, `GET /v1/capabilities`, `POST /v1/tts`, PCM16 WAV out. That
shared contract is what makes its work transferable rather than merely interesting — the two
readers are clients of one host, and Lectrice has been improving both the host and the client
policy that drives it.

This document records what was found, what was measured here, and what is worth porting. It is a
research record, not a plan of record; nothing below is implemented.

Provenance labels, one on every claim:

- **measured** — induced by a request from this host on 29/08/2026 and observed in the response.
- **source-read** — read from a checked-out Lectrice worktree or from Proso's own tree, not induced.

## The Lectrice work in flight

| Where | Title | State on 29/08/2026 |
|---|---|---|
| PR #194 (`182-gpu-performance`) | GPU narration performance | open, updated 28/08 |
| PR #193 (`188-source-aligned-prosody`) | Source-aligned narration prosody | open, updated 28/08 |
| branch `196-narration-cockpit` | Narration cockpit + number speech | 4 commits, 29/08, no PR yet |
| merged #170 | Account-free local narration | on Lectrice `main` since 23/08 |

**source-read.** Feature 182 replaced the appliance's engine and hardened it against whole-page
input. Feature 188 separated *spoken* text from *source* text so pronunciation can be repaired
without moving highlights. Feature 196 adds spoken number normalization and a narration control
surface. All three are answers to problems Proso also has.

## The appliance changed under Proso

**measured.** `GET /v1/capabilities` today:

```json
{"limits":{"maxTextUtf8Bytes":300,"idempotencyRetentionSeconds":900,"queueCapacity":1},
 "runtime":{"model":"Magpie TTS Multilingual 357M",
            "modelRevision":"8291ffde2e13e2e9221a000669b5f7814c7ecc858eb0a1a9de8ee77d8da05736",
            "quantization":"Q6_K","backend":"Vulkan/RADV",
            "device":"AMD Radeon RX 5700 XT","acceleration":"gpu","chunkMaxUtf8Bytes":300}}
```

`GET /health` reports `magpie-q6-vulkan-8291ffde2e13e2e9-chunk-v1`. The host Proso's chunker was
tuned against is gone; this is a different engine with a different cost curve and a `runtime` block
that did not previously exist.

Two hypotheses about breakage were tested and **both are disproven** — recorded because a plausible
break that isn't real is exactly the kind of thing that gets "fixed" on symptom-similarity alone:

- **measured, disproven.** *A sentence over the published 300-byte ceiling fails.* A 386-byte
  single-sentence request returned HTTP 200 with 20.15 s of valid WAV. Feature 182's defensive
  split (the `chunk-v1` in the version string) absorbs oversize input at sentence/word boundaries.
  Proso's 8192-byte client guard is stale, but it is not currently breaking reads.
- **measured, disproven.** *Two in-flight requests hit `queue_full` against `queueCapacity: 1`.*
  Both of a simultaneous pair returned 200 (3.72 s and 7.96 s). The host serializes rather than
  refusing. Proso's `APPLIANCE_MAX_IN_FLIGHT = 2` is tolerated — but the second request's wall time
  is queue waiting, so the prefetch slot buys no throughput on a single-worker engine, exactly as
  `APPLIANCE_RECOMMENDED_CONCURRENCY = 1` already says in that file.

## The finding that matters: unit size now dominates cost

**measured**, via `scripts/measure-appliance-unit-scaling.mjs` (sequential, one request in flight,
unique idempotency keys so the 900 s retention cannot serve a cached response):

```
 1 sentence(s)    35 B  wall  1.88s  audio  1.95s  RTF 0.962
 2 sentence(s)   110 B  wall  6.67s  audio  6.59s  RTF 1.011
 3 sentence(s)   241 B  wall  6.12s  audio 14.30s  RTF 0.428
 5 sentence(s)   447 B  wall 11.08s  audio 25.91s  RTF 0.428

aggregate sequential RTF  0.5279
fitted model              wall = 2.42s + 0.330 x audio
```

An independent earlier run of the same shapes agreed: 69 B → RTF 1.032, 272 B → RTF 0.413.

The host costs **~2.4 s fixed per request** plus a marginal RTF of ~0.33. `sentence-chunker.ts`
dispatches one sentence per request, so Proso pays that 2.4 s once per sentence. For ordinary prose
sentences (60–120 UTF-8 bytes) that lands at **RTF ≈ 0.96–1.01 — at or past the point where
generation is slower than playback.** There is no headroom: the reader stays barely ahead of itself
and any variance becomes an audible stall. Grouping to ~240–300 bytes measures **RTF ≈ 0.43**, a
2.3× improvement on Proso's own hardware.

This is not a regression anyone introduced. `core/audio/sentence-chunker.ts` documents its own
reasoning honestly — it was tuned against a host measured at RTF 0.195–0.276, where per-request
overhead was cheap and sentence granularity was the right call for time-to-first-audio. The host
changed; the policy did not.

Lectrice reached the same conclusion and encoded it as policy: keep the **first** unit short (fast
first audio) and group **later** same-paragraph sentences into one bounded request. The measurement
above shows why both halves are needed — the 35 B unit returns in 1.88 s wall (good latency, poor
RTF), the 241 B unit has 2.3× headroom (good RTF, 6.12 s wall). Proso currently takes the first
trade for every unit in the paragraph.

## Portable pieces, in the order they pay off

### 1. Bounded context grouping — the throughput fix

**source-read**, Lectrice spec 188 FR-012/FR-013 and `src/lib/prosody-plan.ts`. Keep the first unit
short; group subsequent complete sentences from the same paragraph into one request up to 300 UTF-8
bytes; never cross a paragraph or section boundary; let the provider's smaller published limit win.

Proso lands this in `core/audio/sentence-chunker.ts` — pure domain logic, already returns
`Result`, already counts UTF-8 bytes via `TextEncoder`, already has property tests asserting that
concatenated chunks reproduce the input. Grouping is a fold over the existing sentence array. The
existing chunk queue, generation guards (`chunkGeneration`), and cache identity in
`playback-service.ts` are unchanged in shape.

### 2. Read the limits the host publishes — stop guessing

**source-read.** `ApplianceCapabilities` in `adapters/audio/local-host-audio.adapter.ts:116`
declares `limits.maxTextUtf8Bytes`, and nothing ever reads it: `this.maxTextUtf8Bytes` is set once
in the constructor from `options.maxTextUtf8Bytes ?? APPLIANCE_MAX_TEXT_UTF8_BYTES` (8192) and
never updated from `loadCapabilities()`. The host says 300. Grouping (#1) makes this load-bearing:
a grouping ceiling that ignores the published limit would be guessing at the exact number that
decides whether a unit is accepted whole or defensively re-split.

### 3. The ElevenLabs model is a removed one

**source-read.** `packages/server/src/adapters/tts/elevenlabs-tts.adapter.ts:98` sends
`model_id: 'eleven_monolingual_v1'`. Lectrice spec 188 US3 names that exact identifier as removed
and moves its default to `eleven_multilingual_v2`, with a regression test
(`src-tauri/tests/eleven_current_model.rs`) asserting no runtime source mentions the old id, and
the model participating in cache identity so switching cannot serve stale audio.

This is Proso's only occurrence — one string. The care around it is worth copying too: the failure
must not silently select another model or provider, and the model belongs in the cache key.

### 4. Boundary-class pause normalization — the "robotic gaps" fix

**source-read**, `src-tauri/src/adapters/wav.rs`, revision `pcm-edge-v1`. Providers return
substantial leading and trailing silence; playing clips back-to-back stacks that padding on top of
the natural pause, which is what makes stitched sentence clips sound mechanical. Lectrice detects
activity edges with a relative threshold and normalizes each clip's edges to a *target boundary*
per boundary class — clause 200 ms, sentence 350 ms, paragraph 650 ms, section 800 ms — keeping
≥50 ms before first activity and ≥100 ms after last activity so nothing clips. Silence-only or
malformed audio fails closed rather than inventing a pass.

Proso stitches sentence clips exactly this way and has no edge handling at all. The algorithm is
sample arithmetic and ports to `core/audio/` unchanged; Proso already parses WAV headers
(`parseWavDurationMs`). Note the normalizer revision must join the cache key, as Lectrice's FR-006
requires — otherwise cached clips from before the change play with the old padding.

### 5. Spoken-vs-source text with an alignment map

**source-read**, `src/lib/prosody-plan.ts` (395 lines, pure TypeScript, no framework imports —
it drops into Proso's `core/` layer as-is modulo the PDF-specific boundary input). It keeps two
representations of the same passage and an `AlignmentSegment[]` mapping spoken UTF-16 ranges back
to source ranges, with inserted punctuation carrying a **null** source range. That is what lets a
missing sentence boundary be repaired for speech while the highlight still lands on the original,
unmodified word.

Proso needs this before it can safely repair *anything* about spoken text, because its highlighting
addresses source offsets directly. Worth noting the discipline in the spec: broad
capitalization-based rewriting is forbidden; only structured block boundaries and a pinned list of
discourse starters are eligible. That is a deliberately narrow blast radius.

### 6. Spoken number normalization

**source-read**, Lectrice spec 196 US2. `2022` and `91,000` were being sent to the model as digits
and mispronounced. Normalization speaks them as words while every spoken subrange still maps to the
exact original digit range, honours EN vs PT-BR separators and currency, and **declines** ambiguous
forms (version-like, ID-like, locale-ambiguous). It also stops isolated superscript footnote
markers from becoming 1–6 character synthesis requests — on this host each of those would cost the
full 2.4 s fixed overhead for a word of audio.

Proso reads arbitrary web articles, so it has the same exposure with none of the handling. This
depends on #5 and is the natural second consumer of the alignment map.

### 7. Honest performance reporting

**source-read**, Lectrice spec 182 US2. The host now publishes model, quantization, backend,
device, and acceleration; Proso reads none of it. The rules Lectrice adopted are the transferable
part: never infer GPU from a model name, show missing runtime metadata as *unavailable* rather than
as GPU, report standard RTF as `generation wall / audio duration`, and never report cached playback
as model-generation performance.

Its Responsive / Balanced / Continuous profiles (180 B / 300 B / 300 B + 2-unit look-ahead) are the
user-facing form of #1. Proso does not need the profile selector to get the throughput win, and
adding a control surface should not be a prerequisite for fixing the policy.

### 8. The quality-claim discipline

**source-read**, specs 182 US3 and 188 US5. Deterministic waveform checks are reported as
diagnostics, never as a naturalness verdict; a blind EN/PT-BR listening protocol is the only
authority on preference; and promotion of a new engine may not claim it sounds better before that
protocol is scored. Worth adopting verbatim — it is the rule that keeps a measured RTF improvement
from being written up as "better narration".

## What Proso already has

Not everything is a gap. Proso already invalidates queued work on stop, paragraph change, and
provider switch (`chunkGeneration` in `playback-service.ts`); already enforces a client-side UTF-8
byte bound before dispatch; already refuses to fall back to a managed provider when the local route
fails; already derives idempotency keys; and already keeps in-flight work to one synthesis plus one
prefetch. Lectrice's generation-guard requirements (182 US1.4, 188 FR-007) describe behaviour Proso
has.

## Suggested order

1. **Bounded context grouping** + **read the published limit** (#1, #2). One slice: the measured
   2.3× headroom improvement, entirely inside pure domain logic and one adapter field, falsifiable
   by the script in this PR.
2. **ElevenLabs model** (#3). One string plus a regression test and a cache-identity bump.
3. **Boundary-class pause normalization** (#4). Self-contained, needs its revision in the cache key.
4. **Alignment map** (#5), then **number normalization** (#6). #6 is not safe without #5.
5. **Performance reporting** (#7) last — it is the reporting surface for work items 1–4, and it is
   the only one that is purely additive UI.

Item 1 is the only one whose absence is currently audible to a reader.

## Replay

```bash
LOCAL_HOST_APPLIANCE_URL=http://127.0.0.1:5301 node scripts/measure-appliance-unit-scaling.mjs
```

Wall time includes HTTP and WAV transfer over loopback, so every RTF here is an upper bound on
synthesis time in isolation. Measurements were taken on the desktop host against the local
appliance on 29/08/2026 between 15:20 and 15:45 BRT; the RX 5700 XT was not otherwise loaded, and
the numbers move with anything else contending for that GPU.
