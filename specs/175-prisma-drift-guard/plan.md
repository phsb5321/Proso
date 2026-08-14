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

## Falsification

Same tree, four states, `make doctor` each time:
- fresh stamp -> exit 0
- one line appended to `schema.prisma` -> non-zero, naming both digests
- stamp deleted -> non-zero, naming missing provenance
- both restored -> exit 0

The deleted-stamp case is not hypothetical: it is what every existing checkout
hits on first `make doctor` after this lands, which is the intended behaviour.
