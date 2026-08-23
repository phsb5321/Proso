# Plan — Feature 194

## Constitution check

- **Privacy:** PASS. The existing reader-entered loopback destination is unchanged; no telemetry,
  credential, or remote model endpoint is introduced.
- **Security:** PASS. Both processes bind `127.0.0.1`; input, voice, language, idempotency, and
  unsupported controls fail closed.
- **Architecture:** PASS. The shipped extension remains unchanged and continues through its existing
  local-host adapter. The model-specific bridge stays outside the repository.
- **Testing:** PASS when deterministic route checks, a real GPU synthesis, the focused real-host
  Firefox journey, and different-family review agree.

## Approach

1. Build the pinned Vulkan runtime outside the repository and stage the 1.7B Q8 model without loading
   it alongside the old model.
2. Stop Supertonic before the first Qwen load, then expose Qwen through the established compatibility
   surface on port 5301 and keep its inference child on port 5302.
3. Measure buffered and streaming synthesis, deterministic replay, disconnect behavior, child
   recovery, VRAM, GPU activity, Portuguese lexical intelligibility, and listener scope.
4. Delete the isolated Supertonic tree and temporary build paths only after the different-family
   operational gate allows promotion.
5. Update the durable research and reading-journey handoffs, then rerun the focused real-host actor.

## Verification

- Python compile, bridge self-check, Ruff lint and format
- all eight route families respond with their established shapes
- same-key appliance replay is byte-identical; same key with another body returns 409
- child-kill test changes parent and child PIDs and returns healthy
- stream-disconnect test reserves one stream slot while a buffered request uses the second slot
- RX 5700 XT maps the Vulkan runtime and remains below its 8 GiB VRAM limit
- Orange Pi `whisper-quality` returns the complete Portuguese fixture with substitutions counted
- `LOCAL_HOST_APPLIANCE_URL=http://127.0.0.1:5301 node scripts/local-host-journey-gate.mjs`
- `git diff --check` and active-document check
- different-family final gate

## Complexity tracking

The service remains a transient artifact under `~/tts-bench-20260822-desktop/`; it is not a tracked
Nix service and will not survive reboot. This is retained because persistence was not requested and
would require a separate NixOS worktree and deployment gate.

The compatibility API retains ten stable aliases over nine Qwen built-in speakers, so one alias is a
duplicate. Unsupported speed values and diffusion-step changes return 422 because the Qwen runtime
does not implement those Supertonic controls. This is intentionally explicit rather than a silent
compatibility lie.

Buffered generation is slower than real time. Pedro explicitly selected model size over the former
speed floor, so the measured RTF is a disclosed property rather than a release blocker.

## Reversal

Stop `qwen3-tts-desktop.service`. Reinstalling the former pinned Supertonic revision is possible from
its documented receipt, but its runtime tree was intentionally removed as part of the requested
cleanup; there is no second resident fallback.
