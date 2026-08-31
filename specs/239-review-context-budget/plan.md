# Feature 239 — Plan

## Approach

1. Keep the existing readable-file preflight and required path list.
2. Build `context.txt` conditionally: full file bodies for Meta, path references
   for Anthropic/OpenAI.
3. Rename the prompt section to required repository context and explicitly tell
   repo-aware reviewers to read each path before verdict.
4. Extend the fake-Claude self-test to capture stdin. Seed a unique marker into
   the isolated repository's unchanged runbook, then assert the prompt names the
   file without inlining the marker.
5. Leave the complete change bundle construction untouched.

## Constitution check

- Privacy First: local repo reads only; no new upload or provider. PASS.
- Security by Default: missing context still fails closed. PASS.
- Modular Architecture: delivery harness only. PASS.
- Test Coverage: provider-free prompt capture proves family-specific behavior.
  PASS.

## Verification

- `make adversarial-self-test`
- Captured prompt has required paths and candidate marker, not unchanged marker
- `make verify`
- `GENERATOR_FAMILY=openai make gate`
