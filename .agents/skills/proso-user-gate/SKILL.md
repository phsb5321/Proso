---
name: proso-user-gate
description: Gate a Proso feature through seeded model fuzzing and a real loaded-extension browser journey. Use when implementing, reviewing, or declaring complete any user-visible popup, page reader, playback, highlighting, settings, browser-message, persistence, accessibility, or release behavior; also use for E2E, fuzz, soak, anomaly, and Firefox/Chromium readiness work in this repository.
---

# Proso User Gate

Keep the browser-operating agent separate from the deterministic verdict. Read
[references/gate-contract.md](references/gate-contract.md) before changing a
journey, its oracle, or its evidence.

## Run the gate

1. Confirm the repository root ends in `proso-NNN-slug`; never mutate `main`.
2. Read `docs/agent-delivery-harness.md` and
   `docs/reading-journey-status.md`.
3. Map each changed behavior to a named journey and public role/name/state or
   page-visible assertion.
4. Run `make doctor`, the smallest related test, then `make fuzz`.
5. Run `make user-gate`. It must build and drive the real Firefox extension
   through public controls; missing Firefox/geckodriver, a public selector, or
   observable state is blocking, never a skip. While it exits 2, use
   `make user-gate-diagnostic` only to collect downstream evidence; it is not
   feature-completion proof.
6. Use Docker for Playwright. Use the retained geckodriver smoke for the
   Firefox loaded-extension path; it is not Playwright and does not violate the
   Docker-only Playwright rule.
7. Record the seed and action trace. Replay failures without an LLM before
   diagnosis and retain the first occurrence even when replay is flaky.
8. Before delivery, run the full different-family gate. For an OpenAI-generated
   change while Anthropic is unavailable:

```bash
GENERATOR_FAMILY=openai ADVERSARIAL_REVIEWER=meta-llama make gate
```

## Commands

```bash
make fuzz
FC_SEED=20260730 FC_NUM_RUNS=2000 make fuzz
make smoke-reading
make user-gate-diagnostic
make user-gate
```

The current Firefox smoke calls the shipped extension command listener because
WebDriver-generated keys do not reach Firefox's parent-process shortcut
matcher. It is an internal-dispatch diagnostic and proves neither a public
start control nor the OS key match. A public actor must use the Firefox Unified
Extensions/browser action (or another public role/name control) and satisfy the
outcomes in `specs/095-reading-journey-contract/spec.md`.

## Finish

Report the journey, build identity, seed, replay command, assertions, artifacts,
and anomalies. A green build, model opinion, or screenshot alone is not feature
completion.
