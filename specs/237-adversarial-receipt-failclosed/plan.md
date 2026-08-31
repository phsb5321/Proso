# Feature 237 — Plan

## Approach

1. Split `GATE_RECEIPT="$(validate...)"` from `readonly GATE_RECEIPT`, matching
   the repository's existing safe assignment pattern.
2. Add a shell self-test that builds a minimal temporary Git repository with an
   `origin/main` baseline and one candidate change.
3. Put a fake `claude` executable first on that isolated run's `PATH`; it only
   touches a marker.
4. Point the review script at a missing receipt and require non-zero exit, the
   exact validator diagnostic, and an absent model marker.
5. Make the self-test a prerequisite of `make adversarial`.

## Constitution check

- Privacy First: no source upload or provider call; fake reviewer only. PASS.
- Security by Default: restores fail-closed receipt enforcement. PASS.
- Modular Architecture: shell delivery harness only. PASS.
- Test Coverage: regression self-test exercises the actual wrapper process.
  PASS.

## Verification

- `make adversarial-self-test`
- Revert-plant the split assignment; self-test must fail on model marker
- `make verify`
- `GENERATOR_FAMILY=openai make gate`
