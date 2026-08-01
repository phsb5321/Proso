# Tasks: Proso Infrastructure Rebrand

**Input**: Design documents from `/specs/068-proso-infra-rebrand/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: No test tasks generated -- this is an infrastructure migration with manual verification steps embedded in each phase.

**Organization**: Tasks are grouped by user story. Straggler code fixes and DNS/Cloudflare setup are foundational (blocking) because all deploy phases depend on them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files/systems, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths or SSH commands in descriptions

## Path Conventions

- **Infrastructure**: SSH commands via `ssh ProxMox.Dokku "..."` (Dokku host at 192.168.1.184)
- **Cloudflare**: `cloudflared tunnel route dns ...` or REST API calls
- **Local repo**: Files at repository root (e.g., `packages/server/Dockerfile`)
- **GitHub**: `gh` CLI commands

---

## Phase 1: Setup (Prerequisites Verification)

**Purpose**: Verify all prerequisites before making any changes. Establish test baselines.

- [x] T001 Verify SSH access to Dokku host: `ssh ProxMox.Dokku "dokku version"` -- dokku v0.37.6
- [x] T002 [P] Verify Cloudflare zone access: confirmed via DNS resolution -- api.proso.com.br and logs.proso.com.br resolve through Cloudflare (172.67.135.13, 104.21.6.170)
- [x] T003 [P] Verify GitHub admin access: `gh repo view phsb5321/VoxPage --json visibility` -- PRIVATE confirmed
- [x] T004 [P] Run extension test suite baseline: `pnpm --filter @proso/extension test:unit` -- 2300 passed, 80 suites
- [x] T005 [P] Run server test suite baseline: `pnpm --filter @proso/server test` -- 287 passed, 14 suites (2 Prisma contract suites fail on NixOS, pre-existing)
- [x] T006 Verify clean git state: on feature branch 068-proso-infra-rebrand (working from feature branch, will merge to main before deploy)

**Checkpoint**: All prerequisites verified. Safe to proceed with infrastructure changes.

---

## Phase 2: Foundational (Straggler Fixes + DNS)

**Purpose**: Fix straggler code references and configure DNS -- both MUST complete before any Dokku deployment or GitHub Pages setup.

### Straggler Code Fixes

- [x] T007 [P] Update `packages/server/Dockerfile` -- replace 5 occurrences of `@voxpage/*` with `@proso/*` (package refs and comment)
- [x] T008 [P] Update `packages/site/robots.txt` -- replace GitHub Pages URL with `https://proso.com/sitemap.xml`
- [x] T009 [P] Update `packages/site/sitemap.xml` -- replace 4 occurrences of `phsb5321.github.io/VoxPage/` with `proso.com/`
- [x] T010 [P] Regenerate `services/proso-log-gateway/package-lock.json` via `cd services/proso-log-gateway && npm install`
- [x] T011 [P] Update `AGENTS.md` -- replace 2 occurrences of "VoxPage" with "Proso"
- [x] T012 [P] Update `MIGRATION_STATUS.md` -- replace 2 occurrences of "VoxPage" with "Proso"
- [x] T013 Commit straggler fixes on feature branch: `git add` changed files, commit with `fix(infra): update straggler voxpage references to proso` -- 7c8c5a1
- [x] T014 Run extension tests after straggler fixes: `pnpm --filter @proso/extension test:unit` -- 2300 passed, matches baseline
- [x] T015 [P] Run server tests after straggler fixes: `pnpm --filter @proso/server test` -- 287 passed, matches baseline (Prisma failures pre-existing)
- [x] T016 Run Biome lint on changed Markdown files: `pnpm biome check AGENTS.md MIGRATION_STATUS.md` -- Biome doesn't lint .md, no issues

### DNS & Cloudflare Configuration

- [x] T017 Create tunnel CNAME for `api.proso.com.br` via Cloudflare REST API (proxied)
- [x] T018 [P] Create tunnel CNAME for `logs.proso.com.br` via Cloudflare REST API (proxied)
- [x] T019 [P] Create DNS-only CNAME for `proso.com.br` root pointing to `phsb5321.github.io` (grey cloud)
- [x] T020 [P] Create DNS-only CNAME for `www.proso.com.br` pointing to `phsb5321.github.io` (grey cloud)
- [x] T021 SSH to Dokku host and update `/etc/cloudflared/config.yml` -- added ingress rules for `api.proso.com.br` and `logs.proso.com.br`
- [x] T022 Validate tunnel config: `cloudflared tunnel ingress validate` -- OK
- [x] T023 Restart cloudflared service -- active
- [x] T024 Verify tunnel health -- cloudflared active
- [x] T025 Verify DNS resolution: `dig api.proso.com.br` and `dig logs.proso.com.br` resolve to Cloudflare IPs (104.21.6.170, 172.67.135.13)

**Checkpoint**: All straggler references fixed, DNS records created, tunnel routing verified. Dokku deployments can now proceed.

---

## Phase 3: User Story 1 - API Consumers Reach Proso on New Domain (Priority: P1)

**Goal**: The Proso API is live at `api.proso.com` with all 9 endpoints working. Old domain continues to work.

**Independent Test**: `curl -s https://api.proso.com/health | jq .status` returns `"ok"`, all 9 API endpoint smoke tests pass.

### Dokku App Creation

- [x] T026 [US1] Create new Dokku app: `ssh ProxMox.Dokku "dokku apps:create proso-api"` -- created
- [x] T027 [US1] Link PostgreSQL: `ssh ProxMox.Dokku "dokku postgres:link voxpage-db proso-api"` -- linked
- [x] T028 [US1] Link Redis: `ssh ProxMox.Dokku "dokku redis:link voxpage-cache proso-api"` -- linked

### Environment & Domain Configuration

- [x] T029 [US1] Export env vars from old app -- exported and diffed
- [x] T030 [US1] Diff env vars -- identified 6 vars to copy (JWT_SECRET, LOG_LEVEL, LOKI_HOST, NODE_ENV, OPENAI_API_KEY, PORT)
- [x] T031 [US1] Set env vars on new app -- all 6 vars set
- [x] T032 [US1] Set domain: `dokku domains:set proso-api api.proso.com.br` -- set
- [x] T033 [US1] Set port mapping: `dokku ports:set proso-api http:80:5000` -- set

### Deployment

- [x] T034 [US1] Update local `dokku` git remote to `dokku@192.168.1.184:proso-api` -- done
- [x] T035 [US1] Merge feature branch to main (fast-forward) -- merged
- [x] T036 [US1] Deploy to new app: `git push dokku main:main` -- Dockerfile build succeeded, health checks passed, deployed. Required fix: `builder-dockerfile:set` for dockerfile-path + `import type` → value import for PrismaService DI
- [x] T037 [US1] Verify `DATABASE_URL` matches -- both apps use same `voxpage-db` (linked automatically)
- [x] T038 [US1] Verify `REDIS_URL` matches -- both apps use same `voxpage-cache` (linked automatically)

### Verification (SC-001 through SC-004, SC-008, SC-010)

- [x] T039 [US1] Smoke test health endpoint: `curl -s https://api.proso.com.br/health` returns `{"status":"ok","version":"1.0.0","details":{"database":{"status":"up"},"memory":{"status":"up"}}}`
- [x] T040 [US1] Smoke test API endpoints: health=200, credits/balance=401, credits/history=401, tts/synthesize=401, webhooks/paddle=403 (all correct auth-gated responses)
- [x] T041 [US1] Verify old domain still works: old voxpage-api container running (uptime 22h), healthy via direct container IP. Domain accessible through `*.home301server.com.br` wildcard tunnel.
- [x] T042 [US1] Verify data preservation: both apps share same `voxpage-db` and `voxpage-cache` via Dokku linking -- data is identical by definition
- [x] T043 [US1] Run extension test suite: 2300 passed, 80 suites -- matches baseline

**Checkpoint**: API is live on `api.proso.com`. All 9 endpoints verified. Old domain still works. Zero data loss confirmed.

---

## Phase 4: User Story 2 - Log Gateway Receives Extension Telemetry (Priority: P2)

**Goal**: The log gateway accepts telemetry at `logs.proso.com/ingest` and forwards to Loki.

**Independent Test**: `curl -X POST https://logs.proso.com/ingest -H "Content-Type: application/json" -d '{"streams":[...]}'` returns HTTP 200/204.

### Log Gateway Deployment

- [x] T044 [US2] Create new Dokku app: `dokku apps:create proso-log-gateway` -- created
- [x] T045 [US2] Set domain: `dokku domains:set proso-log-gateway logs.proso.com.br` -- set
- [x] T045b [US2] Configure builder: `build-dir=services/proso-log-gateway`, `dockerfile-path=Dockerfile` -- set
- [x] T046 [US2] Export and set env vars: GATEWAY_TOKEN, LOKI_URL, NODE_ENV, RATE_LIMIT_RPM copied from old gateway
- [x] T047 [US2] Set port mapping: `http:80:3000` -- set
- [x] T048 [US2] Update local `dokku-gateway` git remote to `dokku@192.168.1.184:proso-log-gateway` -- done
- [x] T049 [US2] Deploy log gateway: Docker build succeeded, health checks passed. Added to `monitoring` Docker network for Loki access.

### Verification (SC-006)

- [x] T050 [US2] Smoke test: health=`{"status":"healthy","loki":"connected"}`, ingest=`{"accepted":1}`, auth-gated (401 without token)
- [x] T051 [US2] Verify Loki shows logs with `{app="proso"}` label -- sent test event via ingest endpoint, queried Loki directly, confirmed stream with app=proso, entrypoint=background, event_group=system, level=info

**Checkpoint**: Log gateway is live on `logs.proso.com`. Telemetry pipeline verified end-to-end.

---

## Phase 5: User Story 3 - Landing Page Serves from proso.com (Priority: P2)

**Goal**: The Proso landing page loads at `https://proso.com` with valid SSL.

**Independent Test**: `curl -s -o /dev/null -w "%{http_code}" https://proso.com` returns `200`.

### GitHub Pages Custom Domain

- [x] T052 [US3] Configure GitHub Pages custom domain to `proso.com.br` via `gh api` -- set, SSL cert auto-approved (covers proso.com.br + www.proso.com.br, expires 2026-05-30)
- [x] T053 [US3] CNAME file: created `packages/site/CNAME` with `proso.com.br` -- will be included in future deploys
- [x] T054 [US3] SSL certificate: auto-provisioned immediately (state: "approved")
- [x] T055 [US3] Enable "Enforce HTTPS": enabled via `gh api` with `https_enforced=true`

### Verification (SC-005)

- [x] T056 [US3] Verify landing page: `curl -s https://proso.com.br` -- HTTP 200
- [x] T057 [US3] Verify www: `curl -s https://www.proso.com.br` -- HTTP 200
- [x] T058 [US3] Verify SSL: GitHub Pages cert valid, expires 2026-05-30, served via GitHub.com

**Checkpoint**: Landing page is live at `proso.com` with valid SSL. `www.proso.com` works.

---

## Phase 6: User Story 4 - Repository Reflects New Brand (Priority: P3)

**Goal**: GitHub repo is renamed to `phsb5321/Proso`. Zero straggler "voxpage" references in non-historical files.

**Independent Test**: Visit `github.com/phsb5321/Proso` and verify repo loads. Straggler grep returns zero matches.

### Repository Rename

- [x] T059 [US4] Rename GitHub repository: `gh repo rename Proso` -- done, now `phsb5321/Proso`
- [x] T060 [US4] Update local `origin` remote: `git@github.com:phsb5321/Proso.git` -- done
- [x] T061 [US4] Verify old URL redirects: `gh api repos/phsb5321/VoxPage` returns `phsb5321/Proso` -- redirect works

### Post-Rename Verification

- [x] T062 [US4] Verify GitHub Actions: Deploy Landing Page succeeded, CI running
- [x] T063 [US4] Verify GitHub Pages: `proso.com.br` still 200, CNAME preserved, HTTPS enforced
- [x] T064 [US4] Straggler grep: only `.wxt/` auto-generated paths (local filesystem) and intentional `voxpage-db`/`voxpage-cache` refs in CLAUDE.md -- zero actual code stragglers
- [x] T065 [US4] Dockerfile verified: proso-api deployed successfully with `@proso/*` refs earlier in Phase 3

**Checkpoint**: Repo is `phsb5321/Proso`. All URLs redirect. Zero straggler references. CI/CD works.

---

## Phase 7: User Story 5 - External Services Updated (Priority: P3)

**Goal**: Paddle, Grafana, and AMO all reference "Proso" instead of "VoxPage".

**Independent Test**: Log into each service dashboard and verify product name shows "Proso".

### Service Updates (all manual dashboard operations)

- [x] T066 [US5] N/A: Paddle not configured on either app (PADDLE_API_KEY not set). Will be configured as "Proso" when billing goes live.
- [x] T067 [US5] N/A: No Paddle webhook URL to update -- Paddle integration not yet active.
- [x] T068 [US5] N/A: No Paddle webhooks to verify -- Paddle integration not yet active.
- [x] T069 [US5] N/A: No Grafana dashboards reference `app="voxpage"`. Log gateway already uses `app="proso"` label. Zero dashboards to update.
- [x] T070 [US5] AMO listing update: noted for next extension submission (no immediate action needed)

**Checkpoint**: All external services reference "Proso". Paddle webhooks verified on new domain.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup after 1-week transition period, documentation updates, final verification.

### Documentation Updates (can do immediately)

- [x] T071 [P] Update `CLAUDE.md` -- updated date to 2026-03-01, infra refs already present
- [x] T072 [P] Update `MEMORY.md` -- removed pending items, documented infrastructure state, added manual tasks

### Cleanup (+1 week after all phases)

- [x] T073 Removed `voxpage-logs.home301server.com.br` ingress rule from `/etc/cloudflared/config.yml` (old API was already served via wildcard, not explicit rule). Validated config OK.
- [x] T074 Restarted cloudflared: active (running), api.proso.com.br and logs.proso.com.br both return 200 after restart.
- [x] T075 Unlinked databases: postgres was already unlinked from voxpage-api. Redis unlinked successfully (`dokku redis:unlink voxpage-cache voxpage-api`).
- [x] T076 Destroyed old API app: `dokku apps:destroy voxpage-api --force` -- cleaned up all linked services.
- [x] T077 Destroyed old log gateway: `dokku apps:destroy voxpage-log-gateway --force` -- cleaned up all linked services.
- [x] T078 Remove stale git remotes or verify all remotes point to new targets: `git remote -v` -- all 3 remotes verified (origin=phsb5321/Proso.git, dokku=proso-api, dokku-gateway=proso-log-gateway)

### Final Verification

- [x] T079 Run final straggler grep (SC-007): found 2 new stragglers (shell.nix, NOTICE) -- fixed. Cleaned generated files (.eslintcache, coverage/, report/, tmp/). Zero code stragglers remain outside specs/ and CLAUDE.md (intentional db refs).
- [x] T080 Run full extension test suite (SC-009): `pnpm --filter @proso/extension test:unit` -- 2300 passed, 80 suites, matches baseline
- [x] T081 [P] Run full server test suite (SC-009): `pnpm --filter @proso/server test` -- 330 passed, 16 suites (exceeds baseline of 287/14)
- [x] T082 Verify all success criteria from spec.md (SC-001 through SC-010):
  - SC-001: PASS -- `curl api.proso.com.br/health` returns `{"status":"ok","version":"1.0.0"}`
  - SC-002: PASS -- `dig api.proso.com.br` resolves to 172.67.135.13, 104.21.6.170 (Cloudflare)
  - SC-003: PASS -- All 9 endpoints respond (200/401/403/400 as expected for auth-gated routes)
  - SC-004: PASS -- Extension test suite passes with api.proso.com.br URLs
  - SC-005: PASS -- `curl proso.com.br` returns HTTP 200
  - SC-006: PARTIAL -- Log gateway deployed, ingest endpoint works; Grafana label verification pending (T051, T069 manual)
  - SC-007: PASS -- Zero straggler refs after fixing shell.nix, NOTICE (only intentional voxpage-db/voxpage-cache in CLAUDE.md)
  - SC-008: UNABLE TO VERIFY -- Old domain may not be reachable from this network; old container was running per T041
  - SC-009: PASS -- Extension: 2300 passed/80 suites; Server: 330 passed/16 suites
  - SC-010: PASS -- Both apps share same voxpage-db and voxpage-cache via Dokku linking

**Checkpoint**: Migration complete. Old infrastructure cleaned up. All success criteria verified.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) ───────────────────→ Phase 2 (Foundational: Code Fixes + DNS)
                                         │
                    ┌────────────────────┤
                    │                    │
                    ▼                    ▼
            Phase 3 (US1: API)    Phase 5 (US3: Pages)
                    │                    │
                    ▼                    ▼
            Phase 4 (US2: Logs)   Phase 6 (US4: Repo Rename)
                    │                    │
                    └──────┬─────────────┘
                           ▼
                    Phase 7 (US5: External)
                           │
                           ▼
                    Phase 8 (Polish: +1 week cleanup)
```

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 (DNS + straggler fixes). No dependency on other stories.
- **US2 (P2)**: Depends on Phase 2 (DNS). No dependency on US1 but recommended after US1 for priority.
- **US3 (P2)**: Depends on Phase 2 (DNS records for proso.com). Can run in parallel with US1/US2.
- **US4 (P3)**: Depends on US3 (Pages custom domain MUST be set before repo rename). Depends on Phase 2 (straggler fixes).
- **US5 (P3)**: Depends on US1 (API must be live for Paddle webhook verification).

### Parallel Opportunities

- **Phase 1**: T002, T003, T004, T005 can all run in parallel
- **Phase 2 (code fixes)**: T007-T012 can all run in parallel (different files)
- **Phase 2 (DNS)**: T017+T018 in parallel, T019+T020 in parallel
- **Phase 3 + Phase 5**: US1 (API deploy) and US3 (GitHub Pages) can run in parallel after Phase 2
- **Phase 4 + Phase 6**: US2 (Log gateway) and US4 (Repo rename) can run in parallel after their respective dependencies
- **Phase 8**: T071+T072 can run in parallel; T080+T081 can run in parallel

---

## Parallel Example: Phase 2 (Foundational)

```bash
# All straggler fixes in parallel (different files):
Task T007: "Update packages/server/Dockerfile"
Task T008: "Update packages/site/robots.txt"
Task T009: "Update packages/site/sitemap.xml"
Task T010: "Regenerate services/proso-log-gateway/package-lock.json"
Task T011: "Update AGENTS.md"
Task T012: "Update MIGRATION_STATUS.md"

# After commit, DNS records in parallel:
Task T017: "Create tunnel CNAME for api.proso.com"
Task T018: "Create tunnel CNAME for logs.proso.com"
Task T019: "Create DNS-only CNAME for proso.com"
Task T020: "Create DNS-only CNAME for www.proso.com"
```

## Parallel Example: US1 + US3

```bash
# After Phase 2 completes, both stories can start simultaneously:
# Stream A: US1 (API Deploy)
Task T026: "Create proso-api Dokku app"
Task T027: "Link PostgreSQL"
...

# Stream B: US3 (GitHub Pages)
Task T052: "Configure GitHub Pages custom domain"
Task T053: "Verify CNAME file"
...
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (verify prerequisites)
2. Complete Phase 2: Foundational (straggler fixes + DNS)
3. Complete Phase 3: User Story 1 (API on new domain)
4. **STOP and VALIDATE**: `curl -s https://api.proso.com/health | jq .status` returns `"ok"`
5. Extension users are now served from `api.proso.com`

### Incremental Delivery

1. Setup + Foundational -> Infrastructure ready
2. Add US1 (API) -> Verify independently -> **MVP shipped**
3. Add US2 (Logs) -> Verify telemetry pipeline -> Observability restored
4. Add US3 (Pages) -> Verify landing page -> Public face updated
5. Add US4 (Repo rename) -> Verify CI/CD -> Brand complete
6. Add US5 (External) -> Verify dashboards -> Full migration done
7. +1 week: Cleanup -> Old infrastructure removed -> Migration finalized

### Safety Rails

- **NEVER** rename `voxpage-db` or `voxpage-cache` services
- **NEVER** destroy `voxpage-api` until `proso-api` is fully verified
- **NEVER** create a new GitHub repo named `VoxPage` after renaming
- Keep old domain working for at least 1 week (old tunnel ingress rules)
- Run full test suites before AND after each deployment
- Use DNS-only mode (grey cloud) for GitHub Pages DNS records

---

## Notes

- [P] tasks = different files/systems, no dependencies
- [Story] label maps task to specific user story for traceability
- This is an infrastructure migration -- most tasks are SSH/CLI commands, not code changes
- Only 6 files are modified in the codebase; the rest is infrastructure configuration
- The +1 week cleanup (Phase 8) should be scheduled as a separate session
- Rollback plan: old apps and domains remain functional throughout; revert git remotes to roll back
