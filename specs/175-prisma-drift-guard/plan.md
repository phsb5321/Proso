# Plan — Feature 175

## Constitution check

Delivery-harness only. No product code, no ports, no adapters, no domain logic,
no permissions, no network destination, no credentials, no deploy, no schema
change. The one new artifact is gitignored build output.

## Approach

1. `scripts/prisma-schema-digest.mjs` — print `sha256(packages/server/prisma/schema.prisma)`.
   One helper rather than the same `node -e` crypto one-liner inlined in two
   shell scripts.
2. `scripts/generate-prisma.sh` — after a successful generation, write that
   digest to `packages/server/src/generated/prisma/.schema.sha256`. Called from
   both exit paths: the native one and the NixOS `prisma-engines` fallback.
3. `scripts/delivery-doctor.sh` — after the existing existence check, require
   the stamp and require it to equal the current schema's digest.

## Why a content digest rather than mtime

An mtime comparison ("schema newer than client") is shorter and has precedent
here — `icons:check` reports "all PNGs present and newer than their band SVGs".
It would have caught this particular five-month gap trivially.

The digest was chosen anyway because it answers the question actually being
asked. mtime answers "was the schema touched after generation", which is a
proxy: a no-op `touch`, a `git checkout` that rewrites the file with identical
content, or a rebase across an unrelated branch all move mtime without changing
the schema, and each would report drift that does not exist. A gate that cries
wolf gets bypassed, and this one guards the only verification surface the
repository currently has. The digest answers "does this client match this
schema" directly, and it costs one extra file.

## Part 2 approach — the adversarial findings

One shared validator rather than three copies of the same date check:
`scripts/quality/review-metadata.mjs` exports a throwing pair for the two
ratchets (which abort) and a message-returning pair for `check-active-docs.mjs`
(which accumulates failures and reports them together). Splitting it that way
keeps each caller's existing error style intact.

The receipt fix is a default, not a new parameter: `DIFF_BASE_REF` already
existed and was already honoured by the writer, so the validator adopting the
same `origin/main` default closes the hole without changing any call site.

## Falsification

Same tree, four states, `make doctor` each time:
- fresh stamp -> exit 0
- one line appended to `schema.prisma` -> non-zero, naming both digests
- stamp deleted -> non-zero, naming missing provenance
- both restored -> exit 0

The deleted-stamp case is not hypothetical: it is what every existing checkout
hits on first `make doctor` after this lands, which is the intended behaviour.

Part 2, each planted then reverted:
- `expires` absent -> `must be a YYYY-MM-DD review date, got undefined`
- `expires: "soon"` -> same, quoting the value
- `expires: "2026-02-30"` -> `is not a real date` (it parses, and rolls to 03-02)
- blank `owner`/`reason` -> `must be a non-empty string`, naming the field
- receipt written with `DIFF_BASE_REF=HEAD^` -> `expected origin/main, got HEAD^`

One correction worth recording, because the check caught its own author: the
first draft of the date validator claimed in a comment that out-of-range dates
"do not parse". Plant C disproved that — `2026-02-30` parsed finite and was
accepted — so the round-trip was added and the comment now states what was
measured rather than what was assumed.
