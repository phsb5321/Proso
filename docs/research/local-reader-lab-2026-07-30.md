# Local reader lab checkpoint — 30/07/2026

## Outcome

Status: **partially verified; end-to-end reading is blocked**.

The clean `283ff822a3e8caf7b73ed22ab67e873311f78474` Firefox build is running as a
temporary add-on in a dedicated Firefox profile on Pedro's MacBook. A local Piper installation
also synthesizes Portuguese and English test sentences well inside the declared warm-latency
threshold. However:

- the extension still uses the production Proso API;
- `https://api.proso.com.br/health` returned Cloudflare HTTP 502 at 17:42 BRT;
- the Orange Pi had voice files and a Piper virtual environment, but no running inference service;
- macOS denied UI automation access, so toolbar interaction could not be automated.

That third bullet expired one day later: node B has run a Piper HTTP service since
31/07 23:40 UTC. The 01/08 update at the end of this document records what is actually
listening there and why it still does not close the gap.

Therefore this slice does **not** claim that
`article → extraction → real synthesis → audio → controls` passed.

## Hypothesis and falsifier

Candidate architecture, not yet implemented: because the exact-device probe below passes only the
latency threshold, an optional Piper service on Orange Pi node B could implement `IAudioGenerator`
and fall back to the existing server adapter without changing normal Proso behavior when the local
service is absent. Authentication, HTTPS, input bounds, and fallback are requirements for a future
spike, not verified capabilities.

Node B was proposed as the service host on the reasoning that node A owns the continuously
supervised ADB relay while node B was otherwise idle. The idle half of that reasoning is now
wrong — node B carries an audio appliance and roughly a quarter of its RAM is already committed
to it — but the conclusion survives for a better reason: the service this document proposed
building on node B is, in its first form, already running there.

Falsifier: reject the integration if representative Portuguese or English input misses either a
warm full-synthesis time of two seconds or a real-time factor of 0.5, or if human listening finds
the audio unsuitable. This checkpoint verifies latency only; subjective audio quality remains
unverified.

That falsifier was measured against the deployed appliance on 05/08/2026 and its two clauses
disagree — RTF met, the 2 s clause met only at sentence length. See
[Update — 05/08/2026](#update--05082026-the-appliance-is-reachable-and-measured).

## Firefox installation evidence

| Item | Evidence |
|---|---|
| Host | `Pedros-MacBook-Pro`, macOS 26.5.2 arm64 |
| Browser | Firefox 152.0.6 |
| Source commit | `283ff822a3e8caf7b73ed22ab67e873311f78474` |
| Build | `pnpm --filter @proso/extension build` exited 0 |
| Artifact SHA-256 | `9b4050e347d5c78f7d306f164f101d1c8b48b33e0e507d664fe3515cb84ff673` |
| Mac artifact | `~/Library/Application Support/Proso Dev/builds/283ff822/firefox-mv2` |
| Dedicated profile | `~/Library/Application Support/Firefox/Profiles/proso-dev-283ff822` |
| Loader evidence | `~/Library/Logs/proso-web-ext-283ff822.log` says the directory was installed as a temporary add-on |
| Test page | Portuguese Wikipedia article “Síntese de fala” |

The daily Firefox profile was not modified. The development browser and its `web-ext` runner were
left running so Pedro can inspect the installed build.

At the measured 30/07 revision, the Firefox MV2 manifest requested `storage`,
`unlimitedStorage`, `activeTab`, `tabs`, `contextMenus`, `scripting`, and
`https://logs.proso.com.br/*`. The current public build supersedes that artifact:
the telemetry host and initializer were removed on 31/08/2026; reader-operated
synthesis-host access is optional and requested at runtime.

Fresh `web-ext lint` did not reach source analysis because its dependency graph loaded
`multimatch` against an incompatible `minimatch` default export. The extension build itself passed;
the linter result is a toolchain defect, not a green lint result.

## Orange Pi evidence

Live inspection on 30/07 found two Allwinner A733 Orange Pi 4 Pro nodes with 3.8 GiB RAM and no
active Ollama, llama.cpp, Piper, or other model HTTP endpoint. Node A has the Piper 1.6 environment
benchmarked below:

- `piper-tts==1.6.0` in `/home/orangepi/ttsbench/.venv`;
- `pt_BR-faber-medium.onnx`;
- `en_US-lessac-medium.onnx`;
- `es_ES-davefx-medium.onnx`.

Node B had older Piper 1.2 artifacts and the same Portuguese/English voice files, and on the day of
this checkpoint neither node had a live inference listener. Node A is unchanged as of 01/08: still
only the ADB relay, still nothing listening. Node B is not — see the update below.

The already-installed Python API was invoked on node A for four temporary syntheses, then the WAV
files were deleted. No service, package, model, secret, firewall rule, or Tailscale setting was
installed or changed. The board's advertised NPU was not treated as usable because ONNX Runtime
reported CPU execution and no supported NPU path was verified.

| Voice | Load | Synthesis | Audio duration | RTF | Peak RSS |
|---|---:|---:|---:|---:|---:|
| Portuguese, first/warm | 2.154 s | 1.331 / 1.257 s | 5.445 s | 0.245 / 0.231 | ~280 MiB |
| English, first/warm | 2.198 s | 1.185 / 1.277 s | 5.074–5.178 s | 0.234 / 0.247 | ~280 MiB |

The four syntheses averaged about 472% of one CPU core. Reported SoC temperature rose from 45.8 °C
to 74.5 °C, then fell to 54.1 °C. This passes the latency falsifier on the exact device but does not
verify human-perceived quality or the Pi's behavior under a live Proso workload.

## Local model decision

1. [Piper](https://github.com/OHF-Voice/piper1-gpl) is the immediate local TTS candidate. The
   existing voices, supported HTTP API, ARM-compatible runtime, and measured latency make it the
   smallest integration.
2. [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) was the next audio-quality spike. Its
   model card is Apache-2.0 and its official voice list includes Brazilian Portuguese voices. The
   exact-board benchmark on 22/08/2026 disproved it as an interactive Proso engine; see the update
   below.
3. [Qwen3.5-0.8B](https://huggingface.co/Qwen/Qwen3.5-0.8B) is only an optional text-model
   candidate for future summarization or explanation. It does not generate audio and should not
   be conflated with the TTS path.
4. [Supertonic](https://github.com/supertone-inc/supertonic) was rejected as a new foundation
   because its maintainers announced that the repository would be archived.

## Mac Piper benchmark

The isolated installation lives at
`~/Library/Application Support/Proso Dev/local-tts`. It runs official Piper HTTP servers bound only
to loopback:

- Portuguese: `127.0.0.1:9174`, `pt_BR-faber-medium`;
- English: `127.0.0.1:9175`, `en_US-lessac-medium`.

Each input includes punctuation, a number, an acronym, and a question.

| Voice | Cold | Warm 1 | Warm 2 | Audio duration | Warm RTF |
|---|---:|---:|---:|---:|---:|
| Portuguese | 0.606 s | 0.247 s | 0.253 s | 10.66–10.97 s | ~0.023 |
| English | 0.320 s | 0.300 s | 0.285 s | 11.53–11.85 s | ~0.025 |

The two servers each used approximately 340–348 MiB RSS on the MacBook. The separate exact-device
Orange Pi figures are recorded above.

## Update — 01/08/2026: node B is already an audio appliance

Node B was converted into an audio appliance on 31/07, after this checkpoint was drafted. Two of
the statements above were accurate when measured and had stopped being accurate by the time anyone
read them. Verified by live inspection on 01/08:

| Unit | State | Listener |
|---|---|---|
| `piper-tts.service` | enabled, active since 31/07 23:40:59 UTC | `127.0.0.9:5101`, `piper-http-server 1.4.2`, `-m pt_BR-faber-medium.onnx` |
| `audio-appliance.service` | enabled, active | `127.0.0.9:5200` |
| `whisper-balanced` / `whisper-quality` | enabled, active | `127.0.0.9:5111` / `:5112` |

`piper-tts.service` runs under `Slice=audio.slice` with `MemoryMax=1200M`. At the time of
inspection the slice reported `MemoryCurrent=964263936` — about 920 MiB in use across all four
services, roughly a quarter of the board's 3848 MiB. That is a measurement, not a reservation, but
it is enough to retire the "node B is idle" premise. The five-minute `fleet-probe.timer` is still
there; it is no longer node B's only job.

A live synthesis probe answered: `POST http://127.0.0.9:5101/` with
`{"text":"Teste de sintese em portugues."}` returned HTTP 200 in 0.479852 s and 77356 bytes of
audio. Nothing was installed, changed, or left running by that probe.

Two properties of the deployed appliance shape what integrating it would actually buy:

1. **No word timings.** `/v1/capabilities` reports `apiVersion "1"`, `ready: true`,
   `maxTextUtf8Bytes: 8192`, `queueCapacity: 8`, and two voices — `pt_BR-faber-medium` (pt-BR) and
   `en_US-ljspeech-medium` (en-US). Both advertise `markKinds: []`. For highlighting specifically —
   not for the integration as a whole — this costs nothing relative to today, because
   `ServerTtsAudioAdapter` already declares `supportsWordTiming = false` and returns
   `wordTimings: null`, so every server-synthesized paragraph already highlights on
   `PlaybackService.estimateWordTimings()`, which spreads the measured audio duration across the
   words by syllable count for Latin script and by character count otherwise. A local Piper provider
   would take the same branch. Word marks are therefore an upgrade neither path has, not a
   regression this one would cause. Note also that the English voice here is `ljspeech`, not the
   `lessac` voice benchmarked above.
2. **Loopback-bound.** It listens on the `127.0.0.9` loopback alias, not the tailnet address.
   Probing both ports from the desktop over node B's tailnet address returned `http=000`. The
   extension cannot reach it today, and that is the correct default — reaching it would take a
   deliberate opt-in path, not a firewall change.

   **Superseded on 05/08/2026.** The `http=000` measurement on ports 5101 and 5200 still holds;
   the conclusion drawn from it does not. Tailscale Serve now proxies the appliance on 443, so
   `https://orangepi4pro-b.tailf59220.ts.net/health` answers HTTP 200 from the desktop. The
   opt-in path this bullet asked for is what Feature 100 specifies.

The other two advertised limits are worth reading against Proso's actual request shape rather than
quoting on their own. `queueCapacity: 8` sits above what the extension would ask for: synthesis is
per paragraph, and `PrefetchService` defaults to `maxConcurrent = 2` over a five-item buffer, so
roughly three requests are in flight at once. `maxTextUtf8Bytes: 8192` is the one that could bite —
nothing caps paragraph length on the client today, so an unusually long paragraph would be rejected
by the service rather than truncated. Proso's error model already has the shape for that
(`AudioError.text_too_long` carries `maxLength`), but nothing currently produces it, and a local
provider would be the first thing to.

The appliance therefore makes the integration cheaper without making it any closer to shipped. The
"stand up a Piper service" step is done, and Proso did not have to do it. What still blocks the
integration is the loopback binding, not the missing word marks: there is no safe, opt-in,
authenticated path from the extension to that host, and inventing one is the real work. Two
questions sit underneath that and neither is answered here — whether the audio is good enough to
listen to, which is the same listening test 30/07 could not run, and how the reader should behave
when a paragraph exceeds the service's input limit.

The named blocker is gone as of 05/08 and the second question acquired a sharper answer than the
input limit: the appliance does not stream, so paragraph-sized requests are a latency problem
before they are a bounds problem. The listening test is still unrun.

## Acceptance and next smallest step

The Mac loopback Piper endpoints implement Piper's `/synthesize` contract, not Proso's
`/api/v1/tts/synthesize` contract. No adapter or compatibility shim was added because the real
production journey was already externally blocked and a speculative endpoint integration would
mix product code into this evidence-only rollback unit.

The next implementation should begin with a contract test for an optional local provider on node B
and prove that offline, timeout, invalid-WAV, denied-permission, and 5xx outcomes call the existing
server adapter exactly once. The public extension must not contact Pedro's Pi directly. A
Pedro-only lab endpoint must be opt-in, authenticated, HTTPS, bounded by input/timeout/concurrency
limits, and use an explicit optional host permission without hard-coded tailnet addresses.

The 01/08 update removes one item from that paragraph and sharpens two others. Standing up the
service is no longer part of the work — `piper-tts.service` exists. Word marks are not part of it
either: the estimate path already handles a no-timings provider, so the contract test should assert
the new provider reports `supportsWordTiming = false` rather than treat missing marks as a failure.
The "bounded by input limits" clause stops being generic advice and acquires a number — the
deployed service rejects above 8192 UTF-8 bytes, so the contract test should cover an over-limit
paragraph alongside the offline and 5xx cases. Everything else in that security requirement is
untouched and is what stands between a running Piper service and a reader that uses it.

Human listening is still required before calling either voice acceptable.

## Update — 05/08/2026: the appliance is reachable and measured

Measured from the desktop over the tailnet between 17:49 and 18:00 BRT. Nothing on either Orange Pi
was installed or changed; these were reads plus synthesis requests.

```bash
curl -sS https://orangepi4pro-b.tailf59220.ts.net/health
# {"status":"ok","ready":true,"version":"1.0.0+ps4m63vm8fd4gh4i3cn9nj025br8c1b3"}  HTTP 200
curl -sS https://orangepi4pro-b.tailf59220.ts.net/v1/capabilities   # HTTP 200
```

Capabilities are unchanged from the 01/08 reading: `maxTextUtf8Bytes 8192`,
`maxAudioDurationMs 60000`, `queueCapacity 8`, `idempotencyRetentionSeconds 900`, voices
`pt_BR-faber-medium` and `en_US-ljspeech-medium`, both with `markKinds: []`. The no-word-marks
finding above stands, and with it the conclusion that a local provider takes the same
`estimateWordTimings()` branch the server path already takes.

### Falsifier verdict: RTF met, the 2 s clause met only at sentence length

WAV duration was parsed from each response's own `fmt `/`data` chunks, not assumed. Both models
were resident throughout.

| Language | Input bytes | Wall | Audio | RTF | < 2 s | RTF < 0.5 |
|---|---:|---:|---:|---:|:--:|:--:|
| EN | 68 | 1.162 s | 4.203 s | 0.276 | yes | yes |
| EN | 150 | 1.996 s | 9.776 s | 0.204 | yes | yes |
| EN | 200 | 2.680 s | 13.479 s | 0.199 | **no** | yes |
| EN | 656 (paragraph) | 8.276 s | 41.146 s | 0.201 | **no** | yes |
| PT | 727 (paragraph) | 7.533 s | 36.734 s | 0.205 | **no** | yes |

RTF passes decisively and is length-invariant: 0.195–0.276 at every size, roughly 5× faster than
real time. The 2 s clause is not length-invariant, so it cannot pass at every size — at a fixed RTF,
wall time grows with input, and the crossover here is about 150 UTF-8 bytes, roughly one sentence.
The baseline rows earlier in this document used inputs of about 5 s of audio, so the clause was
calibrated to sentences. Read literally against a paragraph it is triggered, about 4× over; read at
the granularity it was written for it is met.

That is a specification decision, not a measurement gap, and `specs/100-local-appliance-tts/` owns
it. The engineering consequence is independent of how it is decided: the appliance has no response
streaming — only a whole WAV or the JSON envelope — so time-to-first-audio equals full synthesis
time of whatever is requested. A single-shot paragraph is about 8 s of silence before playback.
Sentence-level chunking with prefetch keeps the first chunk near 1–2 s and, at RTF ~0.2, keeps the
producer 5× ahead of playback.

The 30/07 warm cold-start figure was not reproduced: the first request measured here, 68 bytes EN,
took 1.162 s with no cold-load penalty on any call, including the first pt-BR one.

### Two corrections that bind the adapter

- **TTS admission is 4, not the advertised 8.** A 12-way concurrent burst admitted 4 and returned
  429 `queue_full` with `retry-after: 14` for the other 8. The appliance's `config.py:107` sets
  `tts_capacity = 4` and `stt_capacity = 4`, and only their sum is published by `/v1/capabilities`.
  A client that trusts the advertised number over-admits by 2×.
- **One inference worker, no preemption.** Observed completions serialized at 1.148, 2.106, 3.146
  and 4.167 s. Client concurrency above 1 buys no throughput; it converts queueing into 429s. One
  in-flight synthesis plus one prefetch is the ceiling worth using.

Errors are RFC-9457 `application/problem+json` throughout. Oversize input is **413**
`payload_too_large`, not 422; the same idempotency key with a different body is **409**
`idempotency_key_reused`; `content-type` tolerates parameters, so `; charset=utf-8` is accepted.
Retry decisions must map on `code`, not on status class — `engine_failed` is 503 with
`retryable: false`.

Human listening remains unrun, so audio quality is still unverified. The full failure-mode matrix
and its source citations are in [`appliance-measurements-2026-08-05.md`](appliance-measurements-2026-08-05.md),
landed in PR #100.

### The integration seam is an open decision

This document proposed "an optional Piper service on Orange Pi node B could implement
`IAudioGenerator`" — an extension-side adapter — and Feature 100 was specified that way. A prior
recorded decision in Pedro's vault
(`2. Areas/🧙 Merlin Unlock/projects/orangepi-audio-appliance/RESEARCH.md`, L53-76 and L420-443)
mandates the opposite seam: extension → Proso API → server-side `AudioApplianceTTSAdapter` → Pi,
with "no Pi hostname permission or bearer token in the extension" (L442). That record also holds
client PRs until its step 3 completes (L495); steps 1 and 2 shipped 31/07/2026, and step 3's
human-listening half is Pedro's.

So the line above — "the public extension must not contact Pedro's Pi directly" — is not
superseded by Feature 100. It is one side of a decision that is now open and belongs to Pedro.
PR #95 is held pending it.

## Update — 22/08/2026: the practical TTS ceiling is compute and heat, not model size

Pedro changed the board's target from mixed TTS/STT to TTS-only and asked for the largest model
that remains useful for interactive Proso reading. The hypothesis was that retiring both Whisper
workers would make a larger, more expressive engine practical. The falsifier was an exact-board
run that still missed Proso's warm RTF and time-to-first-audio bounds after fitting in memory.

The falsifier triggered. The benchmark kept all deployed services unchanged and tested pinned
artifacts separately under `~/tts-bench-20260822/`:

| Candidate | Exact-board result | Verdict |
|---|---|---|
| Current Piper medium voices | RTF 0.195–0.276 (05/08 baseline) | only verified interactive engine |
| Kokoro-82M INT8, `pf_dora`, 4 ONNX threads | load 2.978 s; 26.020 s synthesis for 9.518 s audio; RTF 2.734; peak RSS 449 MiB; peak 80.7 °C | fits comfortably, but is 2.7× slower than real time |
| Qwen3-TTS 0.6B CustomVoice INT4, 4-thread C runtime | load 20.935 s; first audio 23.767 s; 134.0 s synthesis for 14.9 s audio; runtime-reported RTF 9.01; peak 95.3 °C | physically runs, but is neither interactive nor thermally sustainable |

An 8-thread Kokoro attempt crossed the 85 °C watchdog over an 8.7-second sampled interval and was
terminated before producing audio. The 4-thread run completed below the 82 °C hard cutoff. Qwen's
sample crossed 95 °C while thermally throttled. These are CPU-only results: the A733's VIPLite NPU
is alive, but there is still no verified TTS-capable execution path for it.

Retiring `whisper-balanced` and `whisper-quality` would release hundreds of MiB of load-dependent
cgroup memory. That does not change the result: Kokoro used less than 0.5 GiB, so memory was already
not its constraint. The practical ceiling is the architecture's CPU throughput and the board's
passive thermal envelope. "Largest that executes" and "largest useful for reading" are therefore
different answers:

- largest verified to execute in this spike: Qwen3-TTS 0.6B INT4;
- largest currently verified as interactive: the deployed Piper medium voices;
- next credible upgrade: Pocket TTS. Public Kyutai metadata describes it as a 100M CPU model with
  streaming and Portuguese support, but those claims remain unverified on this board because the
  gated weights could not be downloaded. Its public file listing also exposes a 672,178,676-byte
  Portuguese 24-layer checkpoint; attempt that only if the standard checkpoint leaves measured
  latency and thermal headroom.

The exact next action is gated, not a request for another model survey: **`[pending] Pedro:` accept
the Kyutai Pocket TTS terms on Hugging Face and create a read-only token.** The existing Bitwarden
login has no working API token, and the model endpoint returns `GatedRepo`. Once access exists,
benchmark the standard Portuguese checkpoint on this board first, with Piper retained as fallback
and no service switch until the same exact-device gate passes.

No service or repository configuration changed during the spike. At the final check all four units
(`piper-tts`, both Whisper workers, and `audio-appliance`) were active and `/health` remained green.
Removing `~/tts-bench-20260822/` reclaims the retained 278 MiB benchmark payload and is the complete
host-side reversal.

## Update — 22/08/2026: active cooling and desktop relocation

The case fan changed the Orange Pi's thermal result, but not its throughput result. After the fan
was connected, idle temperature fell from 46.7 °C to 38.3 °C in 90 seconds. Kokoro then completed
the same all-core fixture from a 36.0 °C baseline with a 64.9 °C peak, 449 MiB peak RSS, and RTF
2.712. That is effectively the same speed as the earlier four-thread RTF 2.734. Cooling therefore
removes thermal risk, but does not make Kokoro interactive. Qwen would still need a several-fold
speedup, so its 2.4 GiB payload was not downloaded to the board again.

Pedro then moved the high-quality TTS target to the desktop. The desktop is a 22-core/44-thread Xeon
E5-2699 v4 with 125 GiB RAM and an RX 5700 XT. Qwen's native engine supports CUDA and Metal, not
this AMD Vulkan/OpenCL device, so both measurements below are optimized CPU results. Hyperthreads
regressed both models; 22 physical threads is the selected configuration.

| Candidate | Desktop result | Resident-service result |
|---|---|---|
| Kokoro-82M INT8, `pf_dora` | load 1.500 s; 19.119 s synthesis for 9.537 s audio; RTF 2.005 at 22 threads; RTF 2.351 at 44 threads | 10.379 s before a complete 4.864 s WAV; 328 MiB peak service memory |
| Qwen3-TTS 0.6B CustomVoice INT8, `ryan` | load 0.983 s; TTFA 4.021 s; 26.6 s generation for 14.3 s audio; RTF 1.86; 3.35 GiB peak RSS at 22 threads; RTF 2.12 at 44 threads | full WAV: 12.5 s for 10.48 s audio, RTF 1.19; stream: first audio byte at 0.825 s, 13.615 s total for 10.96 s audio, RTF 1.24; 1.37 GiB peak service memory |

Qwen has the better measured desktop latency and streaming profile: its native stream reaches first
audio in under one second. Human-perceived quality has not been compared, so a listening gate must
precede any quality verdict. Qwen is still slightly slower than playback, so clients need a small
prebuffer and Piper remains the real-time fallback. Kokoro remains the much smaller deterministic
PT-BR candidate, not the default interactive reader.

Two temporary resident services are live on the desktop until reboot:

- `kokoro-tts-desktop.service` — `http://127.0.0.1:5301`, PT-BR voices `pf_dora`, `pm_alex`, and
  `pm_santa`;
- `qwen3-tts-desktop.service` — `http://127.0.0.1:5302`, with `/v1/tts`, `/v1/tts/stream`, and the
  OpenAI-compatible `/v1/audio/speech` endpoint.

Kokoro binds loopback directly. Qwen's upstream server binds `0.0.0.0`. Its transient user unit
requests `IPAddressDeny=any` plus `IPAddressAllow=localhost`, but the user manager warned that it
could not enforce an IP firewall as non-root. Independent probes from `orangepi4pro-b` to both
desktop tailnet ports timed out; that proves only that they were unreachable during the probe, not
why or whether the unit enforced it.
Treat Qwen as a local benchmark service until it binds loopback or sits behind a verified network
boundary. Local health checks and real PT-BR WAV generation passed. Neither Orange Pi service nor
its configuration changed.

One integration anomaly remains open: Qwen's minimal JSON parser does not decode standards-valid
`\\uXXXX` escapes. A Python client using ASCII-escaped JSON made it speak the escape sequences and
nearly doubled the output duration; literal UTF-8 JSON produced the expected text. JavaScript's
`JSON.stringify` retains ordinary PT-BR characters, but direct Proso integration must still fix or
shield this parser defect rather than publish a partially compliant JSON endpoint.

All desktop artifacts and evidence are isolated under `~/tts-bench-20260822-desktop/`. Stopping the
two named transient units removes the live services; deleting that directory reclaims the models
and is the complete desktop reversal.

## Update — 22/08/2026: one model, two-times-real-time floor

The deployment constraint changed again: keep exactly one desktop model, and require RTF ≤0.50
(two seconds of audio per wall-clock second) without dropping Portuguese, expressive controls,
voice selection, long-form handling, local APIs, or deployable licensing. This disqualifies both
previous resident candidates. Qwen's best exact-desktop result remained RTF 1.86; its documented
AVX2 INT4/four-thread sweet spot was also measured and reached only RTF 2.03. Kokoro remained at
RTF 2.00. Neither can meet the new floor through thread tuning.

The larger alternatives do not change that answer on this machine. Chatterbox Multilingual V3 is a
500M MIT-licensed PT-BR model with cloning and emotion controls, but its required PyTorch GPU path
cannot use the desktop's Radeon RX 5700 XT: Navi 10 is `gfx1010`, which current supported
ROCm/PyTorch matrices exclude. No CPU result was found that supports RTF 0.50 for this variant, so
it was rejected before a multi-gigabyte download rather than represented as measured. Pocket TTS
exposes standard and larger 24-layer Portuguese variants with streaming and cloning, but the
logged-in Hugging Face account still receives `Access denied` from its gated weights, so it is not
presently runnable.

The largest complete candidate that is both obtainable and fast enough is **Supertonic 3**: 99M
parameters, model revision `3cadd1ee6394adea1bd021217a0e650ede09a323`, served by `supertonic
1.3.1` and ONNX Runtime 1.29.0. The selected configuration is eight ONNX threads, voice `F1`,
Portuguese, speed 1.0, and the selected quality setting of 12 diffusion steps.

| Exact-desktop gate | Result |
|---|---|
| Thread sweep at 12 steps | 4 threads RTF 0.413; **8 threads RTF 0.391**; 11 threads RTF 0.407; 22 threads RTF 0.514 |
| Tuned resident full response | 6.103 s synthesis for 16.091 s audio; **RTF 0.379 / 2.64× real-time** |
| Tuned resident chunked stream | first audio 2.436 s; 8.842 s total for 18.153 s audio; **RTF 0.487 / 2.05× real-time** |
| Resident footprint | 570,294,272-byte measured peak; ten built-in voices loaded |

The Orange Pi's `whisper-quality` lane recovered the 28-word PT fixture with two raw word edits
(WER 7.1%): `dezoito` was normalized to `18`, and the `<sigh>` vocalization was transcribed as
`Sai`. It omitted no lexical content. This supports intelligibility only; naturalness and voice
preference still require human listening.

The service retains the package's full WAV, batch, style-list/import, and OpenAI-compatible APIs.
A thin route over the same single resident model adds `/v1/tts/stream`: it bounds chunks to 55
characters, emits 44.1 kHz mono `s16le`, validates voice names and input length, and begins the next
synthesis while the client can play the previous chunk. The representative stream passed both the
RTF ≤0.50 oracle and a first-audio <2.5 s oracle at the selected 12-step setting. This is one model,
not a fallback chain.

Supertonic 3 supplies 31 languages including Portuguese, ten fixed voice styles plus imported custom
style JSON, inline expression tags such as `<laugh>`, `<breath>`, and `<sigh>`, speed control,
44.1 kHz output, automatic long-form chunking, batching, and local/OpenAI-shaped APIs. It does not
provide an offline zero-shot cloning pipeline; custom voices are imported style files. Its model is
OpenRAIL-M rather than MIT: hosted use is allowed, but Proso must disclose that output is synthetic,
pass through the model's use restrictions where required, and retain the license/attribution.

Only `supertonic3-tts-desktop.service` is now active, on `127.0.0.1:5301`; a probe from
`orangepi4pro-b` to the desktop tailnet address timed out. Kokoro and Qwen units are inactive and
their model/runtime trees were removed, reclaiming roughly 2.8 GiB. Small benchmark logs,
checksums, and the machine-readable selection receipt remain under
`~/tts-bench-20260822-desktop/comparison-evidence/`. The Orange Pi remains unchanged.

## Update — 23/08/2026: model size supersedes the speed floor

Pedro explicitly removed the RTF ≤0.50 requirement and selected the largest runnable model even when
it is slower than real time. The sole desktop model is now **Qwen3-TTS 12Hz 1.7B CustomVoice
Q8_0**, served by `qwentts.cpp` revision `a8a7716` through GGML Vulkan on the RX 5700 XT. The
Apache-2.0 model uses the built-in `serena` speaker for the `F1-pt` alias and a fixed seed of 42.
The MIT runtime and its two model files occupy 2,419,268,562 apparent bytes including the bridge,
evidence, and Python environment.

| Exact-desktop evidence | Result |
|---|---|
| Buffered appliance route | 34.698 s for 14.880 s audio; **RTF 2.332 / 0.429× real time** |
| Native stream | **0.323 s first audio**; 37.724 s total; RTF 2.535 |
| GPU | 98.01% average / 99% peak busy; 7,231,434,752 of 8,573,157,376 total VRAM at peak |
| Replay | byte-identical WAV in 2.6 ms with `X-Cache-Hit: true` |
| Buffered/stream parity | equal duration; correlation 0.999907; SNR 37.29 dB |
| Portuguese lexical round trip | two substitutions over 28 words (`2026` → `2020`, `dezoito` → `18`); no omissions |

The compatibility bridge keeps `/health`, `/v1/health`, `/v1/capabilities`, `/v1/styles`,
`/v1/tts`, `/v1/tts/native`, `/v1/tts/stream`, and `/v1/audio/speech`. It binds
`127.0.0.1:5301`; the one model-holding child binds `127.0.0.1:5302`. Both map RADV. Ten stable
Proso aliases map onto Qwen's nine built-in speakers. Unsupported speed values and non-default
`steps` return 422 rather than pretending that Qwen applied Supertonic-only controls.

Failure and resource bounds were exercised rather than inferred. Killing the child changed both
parent and child PIDs and returned to ready health through systemd. At most one stream is admitted;
a second receives 429 while `max-batch=2` reserves another inference slot for buffered reading. In
the held-out disconnect test, the abandoned stream drained in the background while a buffered
request completed in 12.57 s, then released its slot. Idempotency storage is bounded by 64 entries,
900 seconds, and 256 MiB of cached audio. A different-family DeepSeek Pro gate returned `ALLOW`
after these failure-path fixes.

Only `qwen3-tts-desktop.service` remains active and the two listeners are loopback-only. The isolated
Supertonic tree was deleted after promotion: 279,318,160 apparent bytes / 291,569,664 allocated
bytes across 5,807 files. The contemporaneous filesystem free-space delta was 37,777,408 bytes
because unrelated writes continued on the live desktop; the tree allocation is the direct cleanup
measurement. No system-wide, Nix, package-store, or shared-worktree garbage collection ran. The
Orange Pi configuration and services were not changed.

The focused Firefox real-host actor also passed at `636b828`: it discovered the Qwen build and 20
voices, adopted the local route, decoded and played audio from Qwen, reached visible reading and
highlight state, and made zero managed synthesis requests.

Two limits are deliberate. The service remains transient across reboot, and machine transcription
measures intelligibility rather than naturalness. Pedro still needs to listen to the retained WAV at
`~/tts-bench-20260822-desktop/qwen3-tts-1.7b/evidence/appliance-pt-qwen.wav` for the human quality
verdict.

## Reversal

- Close only the Firefox instance using profile `proso-dev-283ff822`, or stop its `web-ext` runner;
  the temporary add-on disappears.
- Stop the Piper processes bound to ports 9174 and 9175.
- Retained artifacts are isolated under `~/Library/Application Support/Proso Dev` and can be
  removed independently after testing.
- Nothing on either Orange Pi needs reverting. Node B's audio appliance was not installed by this
  work and was left exactly as found; the 01/08 inspection was reads and one synthesis request, and
  the 05/08 measurements above were reads plus synthesis requests.
