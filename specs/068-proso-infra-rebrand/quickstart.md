# Quickstart: Proso Infrastructure Rebrand

**Feature**: `068-proso-infra-rebrand`
**Date**: 2026-02-24

## Prerequisites

Before starting the migration, verify:

1. **SSH access to Dokku host**: `ssh ProxMox.Dokku "dokku version"`
2. **Cloudflare account access**: Log into dashboard and verify `proso.com` zone exists
3. **GitHub admin access**: Verify you can access repo Settings for `phsb5321/VoxPage`
4. **All tests pass**: Run `pnpm --filter @proso/extension test:unit && pnpm --filter @proso/server test`
5. **Clean git state**: `git status` shows clean working directory on `main` branch

## Execution Order

### Phase 0: Fix Straggler Code (local, ~10 min)

Fix the 6 files with "voxpage" references, commit on the feature branch.

### Phase 1: DNS & Cloudflare (~15 min)

1. Create tunnel CNAME records for `api.proso.com` and `logs.proso.com`
2. Create DNS-only CNAME records for `proso.com` and `www.proso.com`
3. Update cloudflared ingress config on Dokku host
4. Restart cloudflared, verify tunnel health

### Phase 2: Dokku API Deploy (~30 min)

1. Create `proso-api` app
2. Link `voxpage-db` and `voxpage-cache`
3. Export/set environment variables
4. Set domain and ports
5. Update git remote, push to deploy
6. Verify health endpoint and all 9 API endpoints

### Phase 3: Log Gateway (~15 min)

1. Create `proso-log-gateway` app
2. Set domain, copy env vars
3. Update git remote, push to deploy
4. Verify log ingestion

### Phase 4: GitHub (~15 min)

1. Configure GitHub Pages custom domain to `proso.com`
2. Rename repo to `phsb5321/Proso`
3. Update local `origin` remote
4. Verify Pages deploys and site loads

### Phase 5: External Services (~10 min, manual)

1. Update Paddle product name and webhook URL
2. Update Grafana dashboard filters
3. Note AMO update for next extension submission

### Phase 6: Cleanup (+1 week)

1. Remove old tunnel ingress rules
2. Unlink and destroy old Dokku apps
3. Update CLAUDE.md and memory files
4. Final straggler grep

## Rollback Plan

If any phase fails:

- **Phase 1 (DNS)**: Delete new DNS records. Old domain continues working.
- **Phase 2 (Dokku)**: Old `voxpage-api` app still running. Revert git remote. Old domain still in tunnel config.
- **Phase 3 (Gateway)**: Old `voxpage-log-gateway` still running. Revert git remote.
- **Phase 4 (GitHub)**: Cannot easily un-rename a repo, but old URLs auto-redirect. Pages custom domain can be reverted.
- **Phase 5 (External)**: Manual dashboard changes are easily reversible.

## Smoke Test Checklist

After all phases complete, verify:

```bash
# SC-001: API health
curl -s https://api.proso.com/health | jq .status
# Expected: "ok"

# SC-002: DNS resolution
dig api.proso.com +short
# Expected: shows Cloudflare IP

# SC-005: Landing page
curl -s -o /dev/null -w "%{http_code}" https://proso.com
# Expected: 200

# SC-008: Old domain still works
curl -s https://voxpage-api.home301server.com.br/health | jq .status
# Expected: "ok" (for 1 week)

# SC-007: Straggler check
grep -ri "voxpage" --exclude-dir=node_modules --exclude-dir=.git \
  --exclude-dir=dist --exclude-dir=.output --exclude-dir=specs \
  packages/ services/ .github/ CLAUDE.md AGENTS.md MIGRATION_STATUS.md
# Expected: no output

# SC-009: Tests pass
pnpm --filter @proso/extension test:unit
pnpm --filter @proso/server test
# Expected: all pass
```
