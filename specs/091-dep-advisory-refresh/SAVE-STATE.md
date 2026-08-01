# SAVE-STATE — 091 dependency-advisory refresh

**Written:** 01/08/2026 (context-guard handoff, pre-`/clear`)
**Origin session:** `d56a964c-ce23-4710-baa6-062ed94a7328`
**Transcript:** `~/.claude/projects/-home-notroot-Documents-Code-personal-proso/d56a964c-ce23-4710-baa6-062ed94a7328.jsonl`
**Repo:** `phsb5321/Proso` (PRIVATE)

---

## EXACT NEXT ACTION

**Nothing is blocked on the agent. The one live item is Pedro's merge decision on PR #79.**

If Pedro says merge:
```bash
gh pr merge 79 --squash --delete-branch
cd /home/notroot/Documents/Code/personal/proso && git worktree remove ../proso-091-dep-advisory-refresh
```
Revert path if wrong: `git revert 1a9f1d2` (single commit).

If Pedro says nothing: **do not self-merge.** Reason is evidenced, not a park —
the commit rewrites the root `pnpm-lock.yaml`, which changes resolution for
extension + server + log-gateway simultaneously. That is the "shared module,
blast radius > 1 service" class the global rules explicitly gate. It is NOT the
banned park-and-ask (that ban covers the in-class self-merge set only).

---

## STATE OF THE TREE (verified 01/08/2026, this handoff)

| Worktree | Branch | HEAD | Status |
|---|---|---|---|
| `proso` | `main` | `fdb113f` | clean, synced with origin |
| `proso-091-dep-advisory-refresh` | `091-dep-advisory-refresh` | `1a9f1d2` | clean, pushed |
| `proso-087-release-signing-fix` | `087-release-signing-fix` | `1c464b9` | clean, pushed |

**Zero uncommitted work anywhere. Nothing is lost by clearing context.**

| PR | Branch | State | Merge state |
|---|---|---|---|
| [#79](https://github.com/phsb5321/Proso/pull/79) | `091-dep-advisory-refresh` | OPEN | CLEAN |
| [#70](https://github.com/phsb5321/Proso/pull/70) | `087-release-signing-fix` | OPEN | CLEAN |

---

## COMPLETED — PR #79 (`1a9f1d2`, `fix(deps): bound override ranges so the built server can boot`)

Started as a vulnerability-count refresh. Became a correctness fix after a Groq
adversarial review, because chasing a rejected finding's real kernel exposed a
second defect of the same class.

### What was actually broken

`main` currently ships a server that **cannot bootstrap**. Production is up only
because Dokku runs an older build (`https://api.proso.com.br/health` = 200).

Root cause, defect class #1 — **a pnpm override's replacement range resolves
independently of the dependent that triggered it**:
```
"path-to-regexp@<0.1.13": ">=0.1.13"     # unbounded -> resolved 8.4.2
```
express 4.22.1 declares `~0.1.12` and was served path-to-regexp **8.4.2**, whose
default export is an object rather than a function. Result:
```
TypeError: pathRegexp is not a function
    at new Layer (express/lib/router/layer.js:45:17)
    ... at ExpressAdapter.enableCors
```

Defect class #2, found while triaging the review — **an override applies once,
not iteratively**. With overlapping selectors, the first matching rule can land
on a version a *later* rule still flags, and it never gets a second pass.

### The fix

- All **97** `pnpm.overrides` replacement ranges bounded to their own major line
  (`">=0.1.13 <0.2.0"`, not `">=0.1.13"`).
- **28 floors raised** across 14 packages to the highest safe floor per major —
  shell-quote 1.10.0, protobufjs 8.7.1, ws 8.21.1, lodash 4.18.1, qs 6.15.2,
  vite 8.0.16, hono 4.12.27, undici 7.28.0.
- `pnpm-lock.yaml` regenerated (1717 lines changed).

### The acceptance test that would have caught it — `scripts/smoke-server-boot.mjs`

Wired into `make verify` (now `doctor format-check lint typecheck smoke-reader
smoke-server-boot security`). Boots the real `packages/server/dist/main.js`,
reserves a free port from the kernel, polls `/health`, asserts an HTTP response
of **any** status, SIGTERMs the child.

Assertion is deliberately "serves an HTTP response", not "200": `/health` probes
Prisma and answers 503 without a database, so gating on 200 would make it a
Postgres test instead of a bootstrap test.

Unit and contract tests build the DI container directly and never execute the
bootstrap chain — that is exactly why 2900 green tests hid a dead artifact.

**Falsifier proven (mandatory, re-run after the override edits):**
```
git checkout HEAD -- package.json pnpm-lock.yaml   -> SEVERED SMOKE EXIT=1
                                                      TypeError: pathRegexp is not a function
restore                                            -> RESTORED SMOKE EXIT=0
                                                      ok server bootstrapped and is routing — HTTP 503 on /health
```

### Third change — `packages/server/tsconfig.build.json` pins `incremental: false`

`nest build` could exit 0 having emitted **nothing**: `nest-cli.json` sets
`deleteOutDir: true`, and an inherited `incremental: true` let a stale
`.tsbuildinfo` claim nothing changed. Rationale lives in the commit message
because Biome rejects JSON comments.

Cost is nil on this path — `deleteOutDir` already forces a full emit, so
`incremental` bought no speedup, only the failure mode. (The reviewer was right
that `nest-cli.json` shares this tsconfig with `start --watch`; watch cold
starts lose `.tsbuildinfo` reuse. Accepted knowingly.)

### CI on #79 — all green

Lint/Test/Build (1m59s), e2e-tests, extension-test, security-audit,
**server-test**, visual-tests, GitGuardian. SonarQube skipping (unset var).
`server-test` passing in CI is the proof that the 44 local failures are purely
the missing-Postgres gap.

### Scanner delta

`main` = **15** dependency errors. Branch = **1**. The surviving one (vite 8.0.1)
is **inherited, not introduced**: it arrives as a vitest 4.1.10 **peer**
dependency, which overrides do not intercept; it is dev-only and never in the
shipped extension; and `main` carries the same 8.0.1 with **10** advisories vs 5
here.

Committed with `CODE_SLOP_GATE_SKIP=1` (the sanctioned per-repo escape,
explicitly **not** `--no-verify`, which is hard-banned) because the gate's
baseline downgrades only *exact* inherited findings and this one changed shape.

---

## UNFINISHED / DEFERRED

1. **`@nestjs/core@<11.1.18` -> `>=11.1.18 <12.0.0`** — inherited from `main`,
   at `package.json:48`. Server declares `^10.4.15`, so this forces core 11.1.19
   against common/platform-express 10.4.22
   (`✕ unmet peer @nestjs/common@^11.0.0: found 10.4.22`). **Known remaining
   risk, deliberately left in place.** Options: leave documented; restrict the
   selector to the 11.x line (re-opens the advisory on Nest 10); or upgrade the
   whole Nest stack (its own slice).
2. **vite 8.0.1** — inherited, dev-only. Moving it means migrating vitest 4.1.10.
   Separate slice.
3. **Broken adversarial gate** — `scripts/adversarial-review.sh:52` pins
   `gpt-5.6-terra` for anthropic generators, which **Groq does not serve**, so
   `make adversarial GENERATOR_FAMILY=anthropic` fails closed. Not fixed inside a
   dependency PR on purpose. Worth its own one-line slice.
4. **`[pending] Pedro:`** merge PR #70 (`087-release-signing-fix`) — touches
   `release.yml` = GitHub Actions = explicitly gated, agent must not merge. Then
   `gh workflow run release.yml -f version=1.2.1`.
5. **`[pending] Pedro: top up DeepInfra`** — `glm-review` returns
   `Payment Required`. Groq is the working adversarial lane today. Codex
   usage-capped until 06/08/2026 12:52.
6. **Parked (standing mandate, untouched):** text pre-loading; broader automation
   improvements; model research — Polly Neural at $16/1M with native word Speech
   Marks was the best unclaimed TTS fit found.

---

## BINDING CONSTRAINTS (carry forward verbatim)

- **Never weaken, skip, delete or re-baseline a test to reach green. That is the
  one banned move.**
- Local baselines are exact; any deviation is a regression:
  - extension — `1 skipped, 2314 passed, 2315 total`, exit 0
  - server — `2 failed, 23 passed, 25 total` / `44 failed, 378 passed, 422 total`,
    exit 1 (contract suites, missing Postgres only — green in CI)
- **A smoke that stays green after you cut the wire is not an acceptance test —
  redesign it, do not promote it.**
- **must_not_touch:** `.github/workflows/*` (Pedro's gate).
- **No AI attribution anywhere reaching GitHub** — no `Co-Authored-By:`, no
  "Generated with" footers, no `// AI-generated` comments.
- Never push directly to `main`; never `git stash`; `git commit --no-verify` is
  hard-banned (sanctioned escape: `CODE_SLOP_GATE_SKIP=1`).
- Credentials: rbw + bw-keyring first — never ask Pedro to type a secret that is
  in the vault.
- `/compact` is banned; recover from primary sources.

## HOST GOTCHAS

- Shell cwd resets after every Bash call — use absolute `cd`.
- `make` needs `PATH="/nix/store/1fvcxyhg3i5fvw0j4l8wmyml10dnvm7q-gnumake-4.4.1/bin:$PATH"`;
  pnpm at `/nix/store/4fbddjl5fc1zzn7pxvndbdljwqblzmd9-pnpm-11.17.0/bin`.
- Installs run pnpm **v10.30.3** via the `packageManager` pin. The v11 binary's
  `pnpm.overrides` warning is a **deprecation notice, not a behaviour change**.
- `cp` is shell-aliased interactive — use `command cp -f`.
- **`cmd | tail; echo $?` reads `tail`'s exit code**, not `cmd`'s.
- zsh errors on non-matching globs — quote `--include='*.ts'`.
- Prisma on NixOS 404s on `binaries.prisma.sh/.../linux-nixos/schema-engine.sha256`.
  Not a code bug; rely on CI.

## RELATED MEMORY

- `[[pnpm-override-range-semantics]]` — the two override traps, in full.
- `[[proso-verify-baselines]]` — baselines and why the server suite fails here.

## UNRELATED, ALREADY CLOSED

Pedro's last message was a status report on a **different** repo (`notes-work`,
`highlight-export.ts`, `orphaned` field), merged as `92cb003` / PR #167, closing
with *"Nada pendente do seu lado."* Its only open item is an explicitly **human**
block (nobody has highlighted, so `pratica.tsv` has only a header). Nothing there
for this session to resume.
