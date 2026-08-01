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

The built Firefox MV2 manifest requests `storage`, `unlimitedStorage`, `activeTab`, `tabs`,
`contextMenus`, `scripting`, and `https://logs.proso.com.br/*`. No additional host permission was
introduced.

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
2. [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) is the next audio-quality spike. Its
   model card is Apache-2.0 and the official voice list includes Brazilian Portuguese voices, but
   it is not installed or benchmarked here.
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

## Reversal

- Close only the Firefox instance using profile `proso-dev-283ff822`, or stop its `web-ext` runner;
  the temporary add-on disappears.
- Stop the Piper processes bound to ports 9174 and 9175.
- Retained artifacts are isolated under `~/Library/Application Support/Proso Dev` and can be
  removed independently after testing.
- Nothing on either Orange Pi needs reverting. Node B's audio appliance was not installed by this
  work and was left exactly as found; the 01/08 inspection was reads and one synthesis request.
