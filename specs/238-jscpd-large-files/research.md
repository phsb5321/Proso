# Feature 238 — Pre-fix evidence

At candidate base `9aad289`, `packages/extension/src/entrypoints/content.ts` is
59,626 bytes and 1,742 lines (`git cat-file -s` / `git show | wc -l`).
`jscpd --help` documents `--max-lines` defaulting to 1,000.

A direct scan of `packages/extension/src/entrypoints/` reported nine TypeScript
files and zero TypeScript clones, but its JSON `statistics.formats.typescript.sources`
did not contain `content.ts`. The full quality artifact likewise listed sibling
entrypoints while omitting `content.ts`. No ignore file or project jscpd config
explains the omission; the default line ceiling does.

## Post-fix evidence

The broad scan now inventories 266 tracked eligible sources, reports 282 scanned
sources (the extra entries are generated/untracked local sources), and includes
`packages/extension/src/entrypoints/content.ts`. With all files visible it
classifies 381 legacy clones and zero introduced clones. The direct extension
command analyzes 86 TypeScript sources and explicitly reports two existing
`content.ts` clone groups while remaining below its 10% aggregate threshold.

Planting `JSCPD_MAX_LINES=1000` exits 1 with ten named omissions, including
`content.ts`, `playback-service.ts`, `extractor.ts`, and `sticky-footer.ts`.
Restoring the default returns to exit 0 and rewrites clean evidence.
