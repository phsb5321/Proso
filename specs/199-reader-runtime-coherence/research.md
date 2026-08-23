# Feature 199 — Runtime research receipt

Evidence captured on 23/08/2026 from the daily Firefox Nightly profile and the current loopback model. The sanitized machine-readable receipt is `pre-fix-receipt.json`.

## What the screenshot actually proves

The screenshot at 13:55 BRT is not only a word-timing complaint:

- the popup says paragraph `1/56`, while the page player says `0/56`;
- both controls expose **Play**, elapsed time remains `0:00`, and the first paragraph remains highlighted;
- Player, Tools, and Queue are visible tabs, but the existing public gate operates only Player;
- the current provider/model/voice is not surfaced anywhere in the player;
- the page player and popup are separate interactive surfaces with divergent state.

A bounded vision-capable inspection was used because the parent model could not render the image; local OCR independently recovered the same labels and counters.

## Live daily-page inspection

A read-only AT-SPI traversal of the existing dbt article tab found **22** accessible toolbars named `Proso playback controls`. Each contains Previous, Play, Next, progress, speed, language, position, and Close. This is accumulated DOM from extension reloads, not 22 browser tabs.

The cause is deterministic in source:

- `content.ts` constructs a new `StickyFooter` per content-script context;
- the JavaScript initialization guard does not give that new object ownership of DOM left by an earlier extension context;
- `StickyFooter.show()` checks only `this.container`, then appends another `#proso-sticky-footer`;
- old closed-shadow roots and old `.proso-w` spans cannot be cleaned by the new instance's arrays;
- each old footer also added its own body bottom-padding offset.

The popup position deliberately renders `current + 1`; the footer formatter renders raw zero-based `currentParagraph`. The screenshot's counter disagreement is therefore source-confirmed.

## Current model and request failure

Daily storage selects provider `local`, `http://127.0.0.1:5301`, with highlighting and stop-on-tab-change enabled. Health identifies Supertonic 3 revision `3cadd1ee6394adea1bd021217a0e650ede09a323`, runtime `supertonic-1.3.1+proso-bridge.2`, with ten PT-BR and ten EN voice entries.

Every voice advertises `markKinds: []`. Supertonic's paper and installed pipeline both use an **utterance-level duration predictor**. Its public output is waveform plus total duration, not word/phoneme alignment, so Proso cannot obtain exact marks from the current API.

At 13:55:06 BRT the bridge leaked a model `ValueError` as HTTP 500 for box-drawing characters `└` and `├`. Four POST responses completed in the same millisecond immediately before it. Source explains both:

- popup loading changes only the visible status label; its `currentState` remains stopped and Play remains available;
- local sentence synthesis has its own prefetch, while the generic paragraph prefetcher also starts two requests even though the chunked path never consumes paragraph-prefetched entries.

## Why the existing oracle stayed green

`fleet-intel verify proso-highlight-tab-focus` passed after the user report. Its fixture correctly proves sentence-local fallback clocks and both browser-focus policies in a fresh profile. It does not test:

- DOM surviving extension reloads;
- all popup panels;
- a pending slow real-model start;
- current-model unsupported input;
- provider timing provenance; or
- daily-profile one-player ownership.

The previous result remains valid for its narrow contract, but it is not a done-oracle for this report.

## Alignment paths researched

### Supertonic 3

Not capable of native word marks through its released API. Prefix-duration or syllable timing remains an estimate. The current fallback is additionally ASCII-biased, assigns structural tokens speech time, and has no punctuation pause budget.

### Magpie

The architecture is trained with monotonic CTC/attention alignment, but the measured `magpie-tts.cpp` runtime exposes audio, not word timestamps. Extracting internal attention would require a new runtime surface and is not an immediate production path.

### Timestamped Kokoro — exact-host rejection

Kokoro-FastAPI commit `26eec068d8ce6f559afef83f68933127ac38e315` maps non-English phoneme `pred_dur` values to words and ships Brazilian Portuguese voice `pf_dora`; this is model-derived timing, not Whisper/STT. The exact-host gate is now verified and rejects promotion:

- required input `Olá, João! Em 23/08/2026, paguei R$ 42,50. ├ Primeiro item; └ último item.` returned HTTP 200 and a valid 7.316-second WAV at CPU RTF **0.23825**, but `timestamps` was `null`;
- simple PT-BR returned six valid monotonic model-derived marks;
- the realistic text expanded 13 grapheme tokens into 18 phoneme groups, so the fail-closed mapper could not reconcile words;
- ROCm was BLOCKED after two startup attempts; no GPU process started;
- candidate port 5302 was stopped and Supertonic on 5301 remained healthy.

Durable evidence and executable oracle: `/home/notroot/tts-bench-20260822-desktop/gpu-voice-audit-20260823/sync-audit/{report.md,result.json,verify-result.sh}`. No 600-second soak was run because throughput cannot rescue a failed timestamp contract.

HeadTTS and the timestamped ONNX model prove a WebGPU timestamp path, but HeadTTS currently supports English only, so it cannot satisfy the mandatory PT-BR route by itself.

## Decision boundary

The repository fixes stale UI, duplicate starts, double prefetch, failure cleanup, popup tabs, counter coherence, and the approximate estimator. No timestamp-capable route passed realistic PT-BR coverage, so Feature 199 adds no marked local-host protocol. No-mark Supertonic remains a truthful approximate fallback; it is not relabelled exact.
