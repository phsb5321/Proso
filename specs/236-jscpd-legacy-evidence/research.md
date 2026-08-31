# Feature 236 — Verification evidence

## Pre-fix falsifier

`node scripts/quality/duplication-ratchet.mjs` exited 0, then
`test -s .artifacts/quality/jscpd-report.json` failed: a green ratchet retained
no detailed evidence.

## Changed-clone plant

Two equivalent temporary functions were appended to
`packages/shared/src/index.ts`. The ratchet exited 1 and reported:

```text
Changed-code duplication detected:
packages/shared/src/index.ts:119-124 ↔ packages/shared/src/index.ts:112-117
Detailed report: .artifacts/quality/jscpd-report.json
```

The artifact had `introduced.length > 0` and named both endpoints. The plant was
removed exactly; `git status` showed no shared-source change afterward.

## Restored green

A fresh run exited 0 and overwrote the red artifact:

```text
Duplication ratchet: 109 legacy clones, 0 touching changed lines.
Detailed report: .artifacts/quality/jscpd-report.json
```

The persisted summary was `{ "total": 109, "legacy": 109, "introduced": 0 }`,
and no `proso-jscpd-*` temporary scan directory remained.
