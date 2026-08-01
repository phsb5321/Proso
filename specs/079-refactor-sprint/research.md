# 079 Refactor Sprint — Package Research

**Date:** 23/04/2026
**Scope:** Performance, reliability, DX upgrades across `@proso/extension`, `@proso/server`, `@proso/shared`.
**Exclusions applied:** packages >12mo stale, <10k weekly downloads (unless niche best-in-class), Nx pre-Aug-2025 (s1ngularity compromise — only post-remediation 22.x+ considered).

---

## Current baseline (April 2026)

| Package | Version | Notes |
|---|---|---|
| `@proso/server` | NestJS 10.4.15, Prisma 7.0.1, pino-loki 2.3.1, `@prisma/adapter-pg` 7.3.0, Zod 3.25.76 | No Redis client, no retry/CB libs, no idempotency util, no OTel |
| `@proso/extension` | WXT 0.20.13, Dexie 4.2.1, franc-min 6.2.0, @webext-core/messaging 2.3.0, Zod 3.23.8 | Jest 29 ESM mode (`--experimental-vm-modules`), Biome 1.9.4 partial |
| `@proso/shared` | Zod 3.25.76, TS 5.x only | No runtime tests |

Identified gaps: (1) no server Redis, (2) no retry/idempotency, (3) no OpenAPI from Zod, (4) Jest slow, (5) `pnpm -r` serial workspace builds, (6) no dead-code detection, (7) `lamejs` in extension (unmaintained 8+ years).

---

## A. Performance

### Server

| Package | Weekly DL | Last Release | Why | Risk | Effort | Wins |
|---|---|---|---|---|---|---|
| `ioredis` 5.x | ~8.4M | active (<6mo) | De-facto Redis client. NestJS pattern via `@liaoliaots/nestjs-redis` (niche-but-standard). Needed for TTS audio URL cache, idempotency store, rate-limit backend. | Low — industry standard. | M (new module; Dokku `redis` already provisioned per 064) | 30–100ms saved per cached TTS lookup; throttler backed by Redis instead of memory (horizontal-scale ready). |
| `@prisma/extension-accelerate` | ~200k | Prisma-maintained | HTTP-based query cache + global pool. Drop-in on Prisma 7. | Medium — cost tier; lock-in to Prisma Data Platform. | S install, M tune TTLs | Cold-start cut 40–60% on Dokku. |
| `cache-manager` 6.x + `cache-manager-ioredis-yet` | 120k (yet) | active | NestJS-native `@nestjs/cache-manager` wraps. Better DX than raw ioredis for route-level caching. | Low. | S | Declarative `@CacheKey`/`@CacheTTL`. |
| REJECTED: `@neondatabase/serverless` | ~800k | active | HTTP/WebSocket driver for edge. Not applicable — Proso runs Dokku LXC, not serverless. | — | — | — |

**Verdict:** Redis via `ioredis` is the priority win. Skip Accelerate until Dokku cold-start metrics justify lock-in. pgBouncer (transaction mode) is the self-hosted alternative — defer unless connection exhaustion observed.

### Extension

| Package | Weekly DL | Last Release | Why | Risk | Effort | Wins |
|---|---|---|---|---|---|---|
| KEEP `dexie` 4.x | ~1.1M | active | Already in use. ORM features (versioning, reactive queries) justify 65KB over raw idb's 3KB. | — | — | — |
| REJECT swap to raw `idb` | 16M | active | 3KB vs 65KB saves ~62KB gzip, but loses migration helpers + reactive hooks. Not worth rewriting cache module. | — | — | — |
| REJECT `tinyld` 1.3.x | ~15k | 2y stale | Slightly better accuracy than franc-min but fails <12mo rule. | — | — | — |
| KEEP `franc-min` 6.2.0 | ~63k | 2y stable (wooorm "done" pattern) | 127KB, 82 langs. No superior maintained alternative meeting exclusion rules. | — | — | — |
| REPLACE `lamejs` | low | >8y stale | Unmaintained MP3 encoder. Replace with `@breezystack/lamejs` fork (active) or drop MP3 export for WAV. | Low. | S | Unblocks security audit; removes abandoned dep. |

**Verdict:** Only actionable extension perf win is removing `lamejs`. Dexie stays. franc-min stays.

---

## B. Reliability

### Server

| Package | Weekly DL | Last Release | Why | Risk | Effort | Wins |
|---|---|---|---|---|---|---|
| `cockatiel` 3.x | ~268k | <1y | Polly-inspired: retry + circuit breaker + bulkhead + timeout in one IPolicy abstraction. Cleaner than stitching p-retry + opossum. AbortSignal-native. | Low — maintained by connor4312 (VS Code). | S for TTS provider calls | Eliminates cascade failures when OpenAI/ElevenLabs flake; bulkhead caps concurrent TTS. |
| `p-retry` 8.x | ~18.4M | Mar 2026 | Simpler than cockatiel for one-off retries. Sindresorhus-maintained. | Low. | S | Pairs well with idempotency keys for Paddle webhook retries. |
| `opossum` 9.0 | ~601k | ~10mo (within exclusion) | Red Hat-maintained CB. More ceremony than cockatiel; choose cockatiel instead. | — | — | — |
| `uuid` v11 (v7 support) | ~150M | active | v7 = time-ordered, idempotency-key-friendly, DB-index-friendly. Replace v4 in request IDs. | None. | S | Better B-tree locality on `idempotency_keys` table. |
| `nestjs-otel` 8.x | ~14–120k (niche) | ~2mo | OpenTelemetry tracing + metrics for NestJS. Complements Pino/Loki. | Low. | M (collector config) | Distributed traces across Paddle → server → TTS provider. |

**Verdict:** `cockatiel` + `uuid` v7 are quick structural wins. `nestjs-otel` is Consider-Later until Loki logs prove insufficient.

### Extension

| Package | Weekly DL | Last Release | Why | Risk | Effort | Wins |
|---|---|---|---|---|---|---|
| KEEP `@webext-core/messaging` 2.3.0 | actively maintained | 6mo ago | Still maintained (aklinker1 also maintains WXT itself). No superior alternative. | — | — | — |
| REJECT `webext-bridge` | lower adoption | stable | Richer cross-context API but no material advantage, loses WXT alignment. | — | — | — |

**Verdict:** Extension messaging layer fine as-is.

---

## C. Developer Experience

### Testing

| Package | Weekly DL | Last Release | Why | Risk | Effort | Wins |
|---|---|---|---|---|---|---|
| `vitest` 2.x | ~43M | active | 3–5x faster than Jest for server. ESM-native (solves extension's `--experimental-vm-modules` hack). Jest-compat API. | Low — most tests port path-only. | L (server 237 + extension 2300 tests) | 60%+ test-runtime reduction; remove NODE_OPTIONS hack. |
| `msw` 2.x | ~2.5M | active | Intercepts HTTP at fetch/Node level. Replaces ad-hoc fetch mocks in TTS provider tests. | Low. | M | Single mock contract across unit/integration/E2E. |
| `jest-runner-tsd` | niche | stable | Type-level tests for `@proso/shared` Zod-inferred types. | Low. | S | Catch `z.infer<>` drift between server and extension. |

### Build / Monorepo

| Package | Weekly DL | Last Release | Why | Risk | Effort | Wins |
|---|---|---|---|---|---|---|
| `turbo` 2.x | ~4M | active (Vercel) | Remote cache + parallel task graph. Simpler than Nx. | Low — Vercel-maintained; no supply-chain incidents. | M (turbo.json + CI cache) | 40–70% faster `pnpm -r build` via incremental. |
| REJECT `nx` 22.x+ | ~6M | recovered | Aug 2025 s1ngularity compromise **IS resolved** (Trusted Publisher, 2FA, tokens revoked, malicious versions deprecated). Current versions are clean. But Turbo's feature set covers Proso's 3-package scope without Nx plugin ceremony. | — | — | — |

### Type safety

| Package | Weekly DL | Last Release | Why | Risk | Effort | Wins |
|---|---|---|---|---|---|---|
| `@asteasolutions/zod-to-openapi` | ~1.5M | active | Generate OpenAPI 3.1 spec from existing Zod schemas in `@proso/shared`. NestJS integration via `nestjs-zod`. | Low. | M — annotate schemas with `.openapi()` | Public API contract doc; extension client generation. |
| `ts-pattern` 5.x | ~2M | active | Exhaustive pattern matching — kills `switch`/`if` chains on `TTSProvider`, `SubscriptionTier`, `Result<T,E>` discriminants. | Low. | S for new code, M backfill | Compile-time exhaustiveness on domain enums. |
| REJECT `@effect/schema` | ~200k | active | Effect ecosystem powerful but requires deep buy-in. Zod pervasive; migration cost unjustified. | — | — | — |

### Quality

| Package | Weekly DL | Last Release | Why | Risk | Effort | Wins |
|---|---|---|---|---|---|---|
| Finish Biome v2.3 migration | ~1–2M | Jan 2026 | Currently partial (extension only). Server still manual. 10–25x faster than ESLint+Prettier. Single config. | Low — Biome v2 has 423 rules. | S | Unified tooling. |
| `knip` 6.x | ~2.3M | active | Unused files/exports/deps detection. Monorepo-aware. | Low. | S | Catches regressions after 026 legacy cleanup. |
| KEEP `madge` 8.x | ~2M | active | Already in use (`deps:check`). 2x downloads of dependency-cruiser. Sufficient for current 0-circular state. | — | — | — |
| REJECT `dependency-cruiser` | ~1.2M | active | More features (rule engine) but madge is sufficient. Revisit if arch rules needed. | — | — | — |

---

## Quick Wins (S effort, clear signal)

1. **`uuid` v11 (v7 mode) for idempotency keys** — eliminates v4 B-tree fragmentation on `idempotency_keys` table.
2. **`knip` across all packages** — catches unused exports/deps. Run in CI as `pnpm knip --production`.
3. **Replace `lamejs` with `@breezystack/lamejs`** (or drop MP3) — removes 8-year-abandoned dep.
4. **`p-retry` around Paddle webhook verification + TTS provider calls** — immediate reliability win.
5. **Finish Biome v2.3 migration in `@proso/server`** — unifies tooling.

## Consider Later

- **`ioredis` + `@nestjs/cache-manager`** (M) — unlocks horizontal scaling; do when Dokku hits single-node limits.
- **`vitest` migration** (L) — huge DX win but 2500+ tests to port; dedicated sprint.
- **`turbo` monorepo orchestrator** (M) — wait until `pnpm -r` times become painful.
- **`cockatiel`** (M) — adopt when second TTS fallback chain ships.
- **`@asteasolutions/zod-to-openapi`** (M) — valuable when third party integrates Proso API.
- **`nestjs-otel`** (M) — skip until Pino+Loki logs prove insufficient.
- **`ts-pattern`** (S new / M backfill) — adopt opportunistically.
- **`msw`** (M) — adopt alongside Vitest migration.
- **`@prisma/extension-accelerate`** (S install / M tune) — only if cold-start SLO breached.

## Rejected outright

- `tinyld` — 2y stale (fails <12mo rule).
- `lid.js` — does not exist as npm package.
- Raw `idb` swap for Dexie — loses migration ergonomics.
- `@effect/schema` — Effect ecosystem lock-in.
- `opossum` — cockatiel is cleaner for greenfield reliability.
- `@neondatabase/serverless` — wrong runtime (Dokku LXC).
- `dependency-cruiser` — madge is sufficient.
- `nx` — compromise remediated, but Turbo fits 3-package scope better.

## Evidence sources

- npm downloads/releases: npmjs.com, npmtrends.com, socket.dev
- Nx s1ngularity remediation: Wiz (s1ngularity-supply-chain-attack), Vercel changelog, Semgrep blog Aug 2025
- Benchmarks: pkgpulse.com (vitest-jest, biome-eslint, dexie-idb, turbo-nx 2026)
- Official docs: prisma.io/docs/accelerate/compare, wxt.dev/guide/essentials/messaging, biomejs.dev/guides/migrate-eslint-prettier
- p-retry: npmjs.com/package/p-retry (18.4M DL, v8.0.0 Mar 2026)
- cockatiel: github.com/connor4312/cockatiel (268k DL, IPolicy + AbortSignal)
- knip: knip.dev (2.3M DL, v6.6.1 active)
