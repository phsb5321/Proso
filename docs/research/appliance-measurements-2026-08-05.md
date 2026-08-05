# Orange Pi audio appliance — measurement record, 05/08/2026

Measurements taken from the desktop over the tailnet on 05/08/2026 between 17:49 and 18:00 BRT,
by the review actor, against `https://orangepi4pro-b.tailf59220.ts.net`. This is a record of what
the appliance did, not a proposal for what Proso should do with it.

Two provenance labels are used throughout and every claim carries one:

- **measured** — induced by a request from this host and observed in the response.
- **source-read** — read from `~/NixOS/pkgs/audio-appliance/src/audio_appliance/`, not induced.
  Recorded because the behaviour is load-bearing and could not be triggered safely from here.

This record supersedes the appliance latency figures quoted in
[`local-reader-lab-2026-07-30.md`](local-reader-lab-2026-07-30.md) for paragraph-length input; it
does not revisit that document's Mac or node-A benchmarks, which measured different hosts.

## Method

`~/.curlrc` on this host sets `continue-at -`, which makes any `curl --data` call fail with
`curl: cannot mix --continue-at with --data`. Every command below passes `-q` to ignore it.

Request shape, unchanged across all runs:

```bash
curl -q -sS -o out.wav -w '%{http_code} %{time_total} %{size_download}' \
  -X POST https://orangepi4pro-b.tailf59220.ts.net/v1/tts \
  -H "Idempotency-Key: <16..128 chars>" \
  -H 'content-type: application/json' \
  -H 'accept: audio/wav' \
  --data-binary @body.json
```

Audio duration is parsed from each response's own `fmt ` and `data` chunks — `dataBytes / byteRate`
— not assumed from a nominal sample rate. Every response was 22050 Hz, mono, 16-bit PCM
(`byteRate` 44100). Real-time factor is `wall_seconds / audio_seconds`.

Wall time is `%{time_total}`: it includes tailnet round trip and WAV transfer, so it is an upper
bound on synthesis time, not synthesis time in isolation.

## Reachability

**measured.** `GET /health` → HTTP 200 in 0.139 s:

```json
{"status":"ok","ready":true,"version":"1.0.0+ps4m63vm8fd4gh4i3cn9nj025br8c1b3"}
```

**measured.** `GET /v1/capabilities` → HTTP 200 in 0.098 s. Limits: `maxTextUtf8Bytes` 8192,
`maxAudioDurationMs` 60000, `queueCapacity` 8, `idempotencyRetentionSeconds` 900. TTS media types:
`audio/wav` and `application/vnd.pedro.audio-result+json; version=1`. Voices
`pt_BR-faber-medium` (pt-BR) and `en_US-ljspeech-medium` (en-US), **both publishing
`markKinds: []`** — the appliance returns no word marks.

## Latency and real-time factor

**measured.** Process warm throughout: both voice models were already resident, and no run in this
table paid a model-load cost. Input sizes are UTF-8 bytes of the `input` field.

| lang | voice | input bytes | wall s | audio s | RTF |
|---|---|---:|---:|---:|---:|
| en-US | `en_US-ljspeech-medium` | 68 | 1.162 | 4.203 | 0.276 |
| en-US | `en_US-ljspeech-medium` | 100 | 1.421 | 6.223 | 0.228 |
| en-US | `en_US-ljspeech-medium` | 150 | 1.996 | 9.776 | 0.204 |
| en-US | `en_US-ljspeech-medium` | 200 | 2.680 | 13.479 | 0.199 |
| en-US | `en_US-ljspeech-medium` | 330 | 4.592 | 23.081 | 0.199 |
| en-US | `en_US-ljspeech-medium` | 656 | 8.276 | 41.146 | 0.201 |
| en-US | `en_US-ljspeech-medium` | 657 | 7.935 | 40.681 | 0.195 |
| pt-BR | `pt_BR-faber-medium` | 727 | 7.533 | 36.734 | 0.205 |

The 656 and 657-byte rows are the same English paragraph, the second with a trailing space so it
was fresh content under a fresh key rather than an idempotent replay.

RTF is flat across a 10× range of input size: 0.195 to 0.276, with the highest value at the
smallest input, where fixed per-request overhead is the largest share of wall time.

**measured.** Idempotent replay — same key, same body — returned byte-identical audio:

| lang | wall s | bytes | sha256 (first 16) |
|---|---:|---:|---|
| en-US | 0.112 | 1 814 572 | `c26ce6cf119ec718` |
| pt-BR | 0.120 | 1 620 012 | `0eefab3f74b84ed4` |

### Against the research doc's falsifier

`local-reader-lab-2026-07-30.md:38` states: *reject the integration if representative Portuguese or
English input misses **either** a warm full-synthesis time of two seconds **or** a real-time factor
of 0.5.*

Evaluated clause by clause against the table above:

| Clause | Result |
|---|---|
| RTF < 0.5 | **met** at every size measured, both languages (0.195–0.276) |
| wall < 2 s | **met** at ≤ 150 bytes (1.996 s); **not met** above it — 200 bytes 2.680 s, paragraph-length 7.5–8.3 s |

The wall-clock clause is not invariant under input size: at a fixed RTF, wall time scales with the
text, so the size at which it stops holding is a property of the threshold as written. The
crossover measured here is ~150 UTF-8 bytes, which produced 9.776 s of audio. The rows in
`local-reader-lab-2026-07-30.md:88` that the threshold was drawn against produced 5.074–5.445 s of
audio, roughly one sentence.

## Response streaming

**source-read.** `/v1/capabilities` advertises exactly two TTS media types, `audio/wav` and
`application/vnd.pedro.audio-result+json; version=1`; neither is chunked or incremental. The only
`request.stream()` call in `app.py` is at line 172 and reads the **request** body, not a response.
No streaming synthesis response exists in v1, so a response arrives whole or not at all.

## Concurrency and admission

**measured.** Twelve concurrent `POST /v1/tts` with distinct bodies and distinct keys: **4**
returned HTTP 200, **8** returned HTTP 429 `queue_full`. The four successes completed at 1.148 s,
2.106 s, 3.146 s and 4.167 s — serialized, roughly one synthesis duration apart.

**source-read.** The advertised `queueCapacity: 8` is not the synthesis budget. `config.py:107-108`
sets `tts_capacity: int = 4` and `stt_capacity: int = 4`, and `config.py:210-213` asserts that the
published `queueCapacity` equals `tts_capacity + stt_capacity`. The per-class split is not exposed
by `/v1/capabilities` — a client reading only the published value cannot derive the TTS admission
limit of 4.

**source-read.** `jobs.py:1-14` states the design directly: *"there is a single worker, not a pool,
and it is not a tunable"*, because *"Piper ×2 loses ~7.7% aggregate throughput versus ×1"*; the
queue is a priority queue counting the two classes separately, and *"There is deliberately NO
preemption in v1"*. The serialized completion times above are consistent with this.

**measured.** A 429 carries both a `retry-after: 14` response header and `retryAfterMs: 14000` in
the problem body, with `retryable: true`.

## Failure modes

Errors are RFC-9457 `application/problem+json` carrying `type`, `title`, `status`, `code`,
`retryable`, `requestId` and usually `detail`.

| Probe | Status | `code` | `retryable` | Provenance |
|---|---:|---|:--:|---|
| `input` 8193 bytes (bound 8192) | 413 | `payload_too_large` | false | measured |
| unknown `voice` | 422 | `unknown_voice` | false | measured |
| unknown body field (`format`) | 422 | `unknown_field` | false | measured |
| missing `speed` | 422 | `invalid_speed` | false | measured |
| empty `input` | 422 | `invalid_input` | false | measured |
| `accept: text/plain` | 406 | `unsupported_representation` | false | measured |
| `accept: application/vnd.pedro.audio-result+json; version=1` | 200 | — | — | measured |
| `content-type: text/plain` | 415 | `unsupported_media_type` | false | measured |
| `content-type: application/json; charset=utf-8` | 200 | — | — | measured |
| missing `Idempotency-Key` | 422 | `idempotency_key_required` | false | measured |
| `Idempotency-Key` 15 chars | 422 | `invalid_idempotency_key` | false | measured |
| `Idempotency-Key` 129 chars | 422 | `invalid_idempotency_key` | false | measured |
| same key, different valid body | 409 | `idempotency_key_reused` | false | measured |
| 12-way concurrent burst | 429 ×8 | `queue_full` | true | measured |
| engine not answering | 503 | `engine_not_ready` | true | source-read, `problems.py:132-140` |
| engine past its ceiling | 503 | `engine_timeout` | true | source-read, `problems.py:143-154` |
| engine rejected or failed the job | 503 | `engine_failed` | **false** | source-read, `problems.py:157-163` |

Two ordering details, both **measured**:

- Body validation runs before the idempotency lookup: replaying a key with an invalid body returned
  `422 unknown_voice`, not the stored `409`.
- The `409 idempotency_key_reused` detail reads: *"this Idempotency-Key was used for a different
  request; use a new key or resend the identical request"*.

`engine_failed` is the only 5xx in the table with `retryable: false`. Status class alone does not
determine retryability.

## Corrections to earlier reports

Three statements circulated on 05/08/2026 before these measurements; all three are wrong as
written.

1. **"`content-type: application/json` exactly, else 415."** `application/json; charset=utf-8`
   returned HTTP 200 (measured). Parameters are tolerated.
2. **"Respect `queueCapacity: 8`."** TTS admission is 4 (measured: 4 of 12 admitted; source-read:
   `config.py:107`). A client bounding itself to 8 concurrent syntheses over-admits by 2×.
3. **Oversize input is a 422.** It is **413** `payload_too_large` (measured).

## Not reproduced

An earlier report recorded a **5.475 s cold English synthesis for a 41-character input**. It did
not reproduce: the smallest input measured here, 68 bytes, took 1.162 s, and no run in this session
showed a model-load penalty — including the first pt-BR request, which took 7.533 s for 727 bytes,
in line with its RTF. The original figure is consistent with a one-off model load on a cold
process; both models were resident for the whole of this session.

## Scope

STT (`whisper-balanced`, `whisper-quality`) was not exercised. Audio quality was not assessed —
nothing here bears on the research doc's separate "human listening finds the audio unsuitable"
clause. No appliance configuration, service, model or Tailscale setting was changed; every request
was a read or a synthesis against the running service.
