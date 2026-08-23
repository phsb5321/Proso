# Tasks — Feature 194

| ID | Task | Status |
|---|---|---|
| T001 | Confirm the 1.7B Q8 talker and tokenizer fit the exact GPU | done — peak total VRAM 7,231,434,752 / 8,573,157,376 bytes |
| T002 | Build and package the pinned Vulkan runtime with complete shared libraries | done — `ldd` has no missing dependency |
| T003 | Preserve every existing compatibility route over one Qwen model | done — eight route families retained |
| T004 | Prove PT buffered, native, OpenAI-shaped, and streaming synthesis | done |
| T005 | Bound idempotency memory and stream-disconnect contention | done — 256 MiB cache ceiling; one stream plus one buffered slot |
| T006 | Prove child failure restarts the owning service | done — parent and child PIDs changed; health recovered |
| T007 | Record exact GPU, latency, throughput, parity, and lexical evidence | done |
| T008 | Obtain a different-family promotion verdict | done — DeepSeek Pro ALLOW after held-out fixes |
| T009 | Remove the superseded Supertonic runtime and temporary build trees | done — 291,569,664 allocated bytes removed; no global GC |
| T010 | Update durable research and journey status | done |
| T011 | Run the focused real-host browser journey against Qwen | done — PASS at `636b828` with 20 voices and zero managed calls |
| T012 | Run tracked deterministic checks and different-family review | done — `make verify` PASS; documentation gate ALLOW |
