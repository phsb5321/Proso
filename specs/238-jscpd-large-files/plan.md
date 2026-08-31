# Feature 238 — Plan

## Approach

1. Define explicit 10,000-line / 1 MiB ceilings in the broad jscpd ratchet and
   direct extension diagnostic.
2. Ask Git for the tracked files under the four scan roots and retain supported
   source extensions only.
3. Flatten jscpd's per-format source maps and compare them with that inventory.
4. Throw before clone classification if the report omits any tracked source.
5. Keep introduced/legacy partitioning, evidence persistence, and cleanup
   byte-for-byte otherwise.

## Constitution check

- Privacy First: local source scan only; no upload. PASS.
- Security by Default: converts a silent omission into fail-closed evidence.
  PASS.
- Modular Architecture: delivery tooling only; runtime unchanged. PASS.
- Test Coverage: green scan plus a 1,000-line ceiling plant. PASS.

## Verification

- Green inventory includes `content.ts`
- Ceiling plant exits non-zero naming `content.ts`
- `make verify`
- `GENERATOR_FAMILY=openai make gate`
