# Refactor @proso/shared — Log

**Executed by**: parent session (not child CLI — scope small enough)
**Duration**: single iteration
**Date**: 2026-04-24

## Before

| Metric | Value |
|---|---|
| unused enum members (knip) | 4 |
| unused exports | 353 (whole repo) |
| unused exported types | 326 (whole repo) |
| server tests passing | 360 unit |
| extension tests passing | 2178 |
| shared build | green |

## Commits

| SHA | Subject | Delta |
|---|---|---|
| `1d120c0` | refactor(shared): remove 3 unused enum members | -3 lines, 2 files |

### Details

Removed:
- `TransactionType.Refund` — server billing flow has no refund path (Paddle handles refunds server-side without creating a transaction record)
- `ErrorCode.InternalError` — server uses HTTP 500 directly
- `ErrorCode.RateLimited` — `@nestjs/throttler` returns 429 via its own code path

Kept (despite knip flag):
- `ErrorCode.ValidationError` — the `'VALIDATION_ERROR'` string literal is used directly in:
  - `packages/extension/src/handlers/highlight.handlers.ts`
  - `packages/extension/src/adapters/storage/highlight-indexeddb.adapter.ts`
  - `packages/extension/src/ports/highlight-repository.port.ts`

  Removing the canonical enum entry would silently weaken type safety. Tracking as a separate candidate (could update those 3 files to use `ErrorCode.ValidationError` symbolically).

## After

| Metric | Value | Delta |
|---|---|---|
| unused enum members (knip) | 1 | -3 ✅ |
| server tests passing | 360 unit | — |
| extension tests passing | 2178 | — |
| shared build | green | — |

## Not done this pass (deferred)

- `packages/shared/src/index.ts` barrel audit — all 35+ re-exports appear legitimate on inspection, but knip can't trace cross-workspace consumption reliably. A follow-up would require a real usage scan across extension + server source trees. Low yield.
- `ErrorCode.ValidationError` migration in extension handlers (from string literal → enum) — separate commit in extension refactor.

## Verification trail

1. `grep -rn 'TransactionType\.Refund|ErrorCode\.(ValidationError|InternalError|RateLimited)'` → 0 hits outside `packages/shared/src/` ✅
2. `rg "'INTERNAL_ERROR'"` / `rg "'RATE_LIMITED'"` → only shared/src/types/errors.ts ✅
3. `rg "'VALIDATION_ERROR'"` → 4 files, 3 outside shared → kept
4. `pnpm --filter @proso/shared build` → green
5. `pnpm --filter @proso/server test` → 360 unit pass (baseline 360)
6. `pnpm --filter @proso/extension test:unit` → 2178 pass (baseline 2178)
7. `pnpm exec knip` post-change → `Unused exported enum members (1)` (was 4)

## Verdict

PASS — shared refactor pass 1 complete. Bigger yield targets (353 unused exports, 326 unused types) live in extension + server packages. Proceed to extension refactor brief with more ambitious scope.
