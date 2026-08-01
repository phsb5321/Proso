# Refactor Brief: @proso/shared

**Sprint**: 079-refactor-sprint
**Target package**: `packages/shared/`
**Branch**: `079-refactor-sprint` (current branch, do not create a new one)
**Budget**: $8 USD / 80 turns

## Mission

Shrink `@proso/shared` surface area without breaking the 73 features inventoried at `specs/079-refactor-sprint/features-inventory.md`. This package is type-only — no runtime tests, no bundle. "Shrink" here means: remove unused exports, clean up duplicate declarations, fix `.gitignore` of generated dist/, verify every public symbol is actually imported somewhere in `packages/extension` or `packages/server`.

## Required reading (in order)

1. `/home/notroot/Documents/Code/Firefox/Proso/CLAUDE.md` — project rules (especially MANDATORY section)
2. `/home/notroot/Documents/Code/Firefox/Proso/specs/079-refactor-sprint/spec.md` — sprint spec
3. `/home/notroot/Documents/Code/Firefox/Proso/specs/079-refactor-sprint/baseline.md` — test counts
4. `/home/notroot/Documents/Code/Firefox/Proso/specs/079-refactor-sprint/research.md` — approved Quick Wins
5. `/home/notroot/Documents/Code/Firefox/Proso/specs/079-refactor-sprint/knip-baseline.txt` — dead code targets (search for `packages/shared`)

## Concrete tasks (in order)

### 1. Baseline the package
- `cd /home/notroot/Documents/Code/Firefox/Proso`
- `export PATH="/nix/store/qlbqwsia8a9rk3cp6v58y1x58c0j2wyk-pnpm-10.33.0/bin:$PATH"`
- `pnpm exec knip 2>&1 | grep -A 200 "packages/shared" | head -80` — capture current shared-specific findings
- Save to `specs/079-refactor-sprint/logs/refactor-shared.md` as "Before" table

### 2. Remove 4 confirmed-unused enum members (knip baseline §enum members)
- `Refund` in `TransactionType` at `packages/shared/src/domain/credits.ts:8`
- `ValidationError` in `ErrorCode` at `packages/shared/src/types/errors.ts:23`
- `InternalError` in `ErrorCode` at `packages/shared/src/types/errors.ts:24`
- `RateLimited` in `ErrorCode` at `packages/shared/src/types/errors.ts:25`

**Verification before each removal**: `grep -rn "TransactionType.Refund" /home/notroot/Documents/Code/Firefox/Proso/packages/ /home/notroot/Documents/Code/Firefox/Proso/services/` — must return 0 matches. Same for the 3 ErrorCode members. If ANY match, STOP and report.

After all 4 removed: `pnpm --filter @proso/server test` must stay green (360 unit pass). Commit:
```
refactor(shared): remove 4 unused enum members

knip identified Refund, ValidationError, InternalError, RateLimited as
unreachable from any import site. Verified via grep across packages/
and services/ before removal.
```

### 3. Audit public barrel `packages/shared/src/index.ts`
- List every re-export
- For each, grep its usage in packages/extension/src and packages/server/src
- Any re-export with zero consumers: propose removal in commit message, commit atomically
- Do NOT remove symbols that are re-exported for API surface stability (e.g. Result<T,E>, Ok, Err, isErr) even if knip flags them as unused inside the package — they're part of @proso/shared's public contract

### 4. Verify dist/ handling
- Confirm `packages/shared/.gitignore` lists `dist/` and `*.tsbuildinfo`
- Confirm `packages/shared/package.json` "files" field includes only `dist` and `src`
- If `dist/` leaks into repo, add to gitignore + commit in separate atomic step

### 5. Run full baseline
- `pnpm --filter @proso/shared build` must succeed
- `pnpm --filter @proso/server test` — stays green (server imports from shared)
- `pnpm --filter @proso/extension test:unit` — stays green (extension imports from shared)

## Hard constraints

1. **No AI attribution** in commits, comments, or docs (no "Co-Authored-By", no "Generated with")
2. **No new dependencies** on `@proso/shared` — stay type-only
3. **No cross-package changes** — touch only `packages/shared/` files (you may grep consumers for verification; you may NOT edit them)
4. **No push to remote** — parent reviews on `079-refactor-sprint` branch before PR
5. **Never skip stop hooks** — if a hook fails, fix the root cause

## Acceptance gates (must all pass)

- [ ] `pnpm --filter @proso/server test` still green (≥ 360 unit pass)
- [ ] `pnpm --filter @proso/extension test:unit` still green (≥ 2178 pass)
- [ ] `pnpm exec knip` for `packages/shared` shows reduced unused-export count
- [ ] `pnpm --filter @proso/shared build` produces `dist/` without error
- [ ] Every atomic commit follows `refactor(shared): ...` conventional format
- [ ] `specs/079-refactor-sprint/logs/refactor-shared.md` has Before/After metrics

## Stop conditions (any triggers early exit)

1. Budget $8 exhausted or 80 turns hit → capture state, write partial report, stop.
2. Test regression (any suite pass count drops below baseline) → revert last commit, stop, report.
3. A removal would break a feature in `features-inventory.md` → stop, report which feature + which symbol.
4. User feedback interrupts via stop hook → fix root cause, don't bypass.

## Output log

At `/home/notroot/Documents/Code/Firefox/Proso/specs/079-refactor-sprint/logs/refactor-shared.md`:

```markdown
# Refactor Shared — Log

## Before (baseline from knip)
| metric | value |
|---|---|
| unused exports | TBD |
| unused types | TBD |
| unused enum members | 4 |

## Commits
| SHA | message | delta |
|---|---|---|

## After
| metric | value |
|---|---|

## Notes / blockers
```

## Not your job

- Refactoring `packages/server/` or `packages/extension/` — separate briefs.
- Adding new features.
- Modifying the sprint spec/plan/tasks files.
- Creating PRs or pushing to remote.
- Editing CLAUDE.md.

Start by reading the required files, then run task 1 and commit its report before proceeding.
