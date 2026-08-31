# Feature 236 — Plan

## Approach

Keep jscpd's temporary working directory, but persist a normalized evidence
object into the existing ignored `.artifacts/quality/` surface before verdict
handling:

1. Reuse Node's standard `fs` and `path` APIs; add no dependency.
2. Partition the scanner's duplicate objects by the existing changed-line
   classification into `legacy` and `introduced`.
3. Overwrite one versioned JSON artifact and read it back immediately to verify
   schema and count parity before reporting success or failure.
4. Keep the existing introduced-clone error and temporary-directory cleanup.
5. Document the evidence path in the tracked delivery harness.

## Constitution check

- Privacy First: local source locations/fragments stay on disk; no upload. PASS.
- Security by Default: no credentials, permissions, or network path. PASS.
- Modular Architecture: quality tooling only; runtime layers unchanged. PASS.
- Test Coverage: green/red/green plant exercises persistence and unchanged
  blocking behavior. PASS.

## Verification

- Green report schema/count check with `jq`
- Changed-code clone plant: exit 1 and `introduced.length > 0`
- Plant removal: exit 0 and `introduced.length === 0`
- `make verify`
- `GENERATOR_FAMILY=openai make gate`
