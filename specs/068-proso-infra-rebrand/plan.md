# Implementation Plan: Proso Infrastructure Rebrand

**Branch**: `068-proso-infra-rebrand` | **Date**: 2026-02-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/068-proso-infra-rebrand/spec.md`

## Summary

Migrate all production infrastructure from the old "VoxPage" naming to "Proso" following the codebase rebrand merged in PR #28. This covers DNS/Cloudflare configuration, Dokku app creation and database re-linking, log gateway migration, GitHub repo rename, GitHub Pages custom domain setup, straggler code fixes, and external service updates. The approach uses a parallel-run strategy: new apps coexist with old ones for a 1-week transition period before cleanup.

## Technical Context

**Language/Version**: Bash (SSH commands, CLI tools), YAML (cloudflared config), Dockerfile edits
**Primary Dependencies**: Dokku, cloudflared, Cloudflare API, GitHub CLI (`gh`), Docker
**Storage**: PostgreSQL (`voxpage-db` -- NOT renamed), Redis (`voxpage-cache` -- NOT renamed)
**Testing**: `pnpm --filter @proso/extension test:unit` (2300+ tests), `pnpm --filter @proso/server test` (287+ tests)
**Target Platform**: Dokku on ProxMox host (192.168.1.184), Cloudflare edge, GitHub
**Project Type**: Infrastructure migration (no new application code)
**Performance Goals**: Zero downtime during migration; old domain works for 1+ week
**Constraints**: NEVER rename database/cache services; NEVER destroy old app before verification
**Scale/Scope**: 6 files to fix, 4 DNS records to create, 2 Dokku apps to create, 1 repo rename, 3 git remotes to update

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applicability | Status |
| --------- | ------------- | ------ |
| I. Cross-Browser MV3 | N/A -- infrastructure only, no extension code changes | PASS |
| II. Privacy by Design | N/A -- no user data handling changes; database content untouched | PASS |
| III. Hexagonal Architecture | N/A -- no application architecture changes | PASS |
| IV. Test Coverage | Applicable -- spec requires full test suite before/after deploy | PASS |
| V. Observability | Applicable -- log gateway migration preserves telemetry pipeline | PASS |
| VI. Simplicity | Applicable -- "create new app + re-link" is simplest safe approach | PASS |

**Quality Gates:**
- TypeScript strict mode: N/A (no TS changes except straggler fixes)
- Biome lint: Will run on straggler fixes
- All tests: MUST pass before and after deployment
- E2E on Firefox: N/A (infrastructure only)

**Result: All gates PASS. No violations to justify.**

## Project Structure

### Documentation (this feature)

```text
specs/068-proso-infra-rebrand/
├── plan.md              # This file
├── research.md          # Phase 0 output (research findings)
├── spec.md              # Feature specification
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code Changes (repository root)

```text
# Files to MODIFY (straggler fixes)
packages/server/Dockerfile              # @voxpage/* → @proso/* (5 occurrences)
packages/site/robots.txt                # GitHub Pages URL → proso.com
packages/site/sitemap.xml               # GitHub Pages URLs → proso.com (4 occurrences)
AGENTS.md                               # "VoxPage" → "Proso" (2 occurrences)
MIGRATION_STATUS.md                     # "VoxPage" → "Proso" (2 occurrences)

# Files to REGENERATE
services/proso-log-gateway/package-lock.json  # npm install to fix name

# Files to UPDATE POST-MIGRATION
CLAUDE.md                               # Infrastructure state (domains, remotes, app names)
.claude/projects/*/memory/MEMORY.md     # Memory file (pending post-rename items)
```

### Infrastructure Changes (external to repo)

```text
# Cloudflare DNS (proso.com zone)
api.proso.com    → CNAME → <tunnel-UUID>.cfargotunnel.com  (proxied)
logs.proso.com   → CNAME → <tunnel-UUID>.cfargotunnel.com  (proxied)
proso.com        → CNAME → phsb5321.github.io              (DNS-only)
www.proso.com    → CNAME → phsb5321.github.io              (DNS-only)

# Cloudflare Tunnel ingress (/etc/cloudflared/config.yml on Dokku host)
+ api.proso.com       → http://localhost:80
+ logs.proso.com      → http://localhost:80
  voxpage-api.home301server.com.br → http://localhost:80  (keep 1 week)

# Dokku apps (ProxMox.Dokku host)
+ proso-api           (NEW -- linked to voxpage-db + voxpage-cache)
+ proso-log-gateway   (NEW -- logs.proso.com domain)
  voxpage-api         (OLD -- keep 1 week, then destroy)
  voxpage-log-gateway (OLD -- keep 1 week, then destroy)

# Git remotes (local)
origin          → git@github.com:phsb5321/Proso.git     (after rename)
dokku           → dokku@192.168.1.184:proso-api          (updated)
dokku-gateway   → dokku@ProxMox.Dokku:proso-log-gateway  (updated)

# GitHub
phsb5321/VoxPage → phsb5321/Proso  (repo rename)
Pages custom domain: proso.com
```

**Structure Decision**: This is an infrastructure migration with minimal code changes. The 6 straggler file fixes are committed and deployed as part of the Dokku deployment push. No new source files are created.

## Phase Dependency Graph

```
Phase 0 (Straggler Code Fixes) ─┐
                                 ├─→ Phase 2 (Dokku API Deploy) ─→ Phase 3 (Log Gateway)
Phase 1 (DNS & Cloudflare) ─────┘                    │
                                                      ├─→ Phase 6 (External Services)
Phase 4 (GitHub Pages Setup) ─→ Phase 4b (Repo Rename)
                                                      │
                          [All phases complete] ──────→ Phase 7 (Cleanup, +1 week)
```

**Parallelizable**:
- Phase 0 (code fixes) and Phase 1 (DNS) can run in parallel
- Phase 4 (GitHub) can run in parallel with Phases 2-3
- Phase 6 (external services) can start after Phase 2

**Sequential gates**:
- Phase 1 MUST complete before Phase 2 verification (DNS must resolve)
- Phase 2 MUST complete before Phase 3 (API is higher priority)
- Phase 4a (Pages custom domain) MUST complete before Phase 4b (repo rename)
- Phase 7 MUST wait 1 week after all other phases

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
| ---- | ------ | ---------- | ---------- |
| Database data loss during migration | Critical | Very Low | NEVER rename DB services; link existing to new app |
| API downtime during cutover | High | Low | Old app stays running; new app verified before DNS switch |
| Cloudflare Tunnel misconfiguration | High | Medium | Test ingress rules with `cloudflared tunnel ingress validate` |
| Dockerfile build failure after package rename | Medium | Medium | Fix stragglers BEFORE deployment push |
| GitHub Pages SSL failure | Medium | Medium | Use DNS-only (grey cloud) for Pages records |
| Paddle webhook delivery failure | Medium | Low | Update webhook URL AFTER API is verified on new domain |
| Environment variable missed during export | High | Medium | Diff `config:export` output between old and new app |

## Complexity Tracking

No constitution violations detected. No complexity justifications needed.
