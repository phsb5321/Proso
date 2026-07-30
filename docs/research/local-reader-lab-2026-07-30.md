# Local reader lab checkpoint — 30/07/2026

## Outcome

Status: **partially verified; end-to-end reading is blocked**.

The clean `283ff822a3e8caf7b73ed22ab67e873311f78474` Firefox build is running as a
temporary add-on in a dedicated Firefox profile on Pedro's MacBook. A local Piper installation
also synthesizes Portuguese and English test sentences well inside the declared warm-latency
threshold. However:

- the extension still uses the production Proso API;
- `https://api.proso.com.br/health` returned Cloudflare HTTP 502 at 17:42 BRT;
- the Orange Pi has voice files and a Piper virtual environment, but no running inference service;
- macOS denied UI automation access, so toolbar interaction could not be automated.

Therefore this slice does **not** claim that
`article → extraction → real synthesis → audio → controls` passed.

## Hypothesis and falsifier

Hypothesis: an optional LAN-only Piper service can provide a useful offline TTS backend without
changing normal Proso behavior when that service is absent.

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

Read-only inspection found an Allwinner A733 Orange Pi 4 Pro with 3.8 GiB RAM and no active Ollama,
llama.cpp, Piper, or other model HTTP endpoint. It does have:

- `piper-tts==1.6.0` in `/home/orangepi/ttsbench/venv`;
- `pt_BR-faber-medium.onnx`;
- `en_US-lessac-medium.onnx`;
- `es_ES-davefx-medium.onnx`.

No service, package, or model was installed on the Orange Pi in this slice. The board's advertised
NPU was not treated as usable because no supported inference path was verified.

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

The two servers each used approximately 340–348 MiB RSS on the MacBook. These figures prove the
Mac path, not Orange Pi performance.

## Acceptance and next smallest step

The local Piper endpoints implement Piper's `/synthesize` contract, not Proso's
`/api/v1/tts/synthesize` contract. No adapter or compatibility shim was added because the real
production journey was already externally blocked and a speculative endpoint integration would
mix product code into this evidence-only rollback unit.

The next implementation should begin with a contract test for an optional local provider and prove
that an offline endpoint falls back without changing the existing production route. Human
listening of the retained benchmark WAV files is also required before calling a voice acceptable.

## Reversal

- Close only the Firefox instance using profile `proso-dev-283ff822`, or stop its `web-ext` runner;
  the temporary add-on disappears.
- Stop the Piper processes bound to ports 9174 and 9175.
- Retained artifacts are isolated under `~/Library/Application Support/Proso Dev` and can be
  removed independently after testing.
