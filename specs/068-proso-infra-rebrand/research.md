# Research: Proso Infrastructure Rebrand

**Feature**: `068-proso-infra-rebrand`
**Date**: 2026-02-24
**Status**: Complete

## R1: Dokku App Migration Strategy

### Decision
Create a new Dokku app `proso-api` and manually re-link existing databases. Do NOT use `dokku apps:rename`.

### Rationale
- `apps:rename` is destructive -- it deletes the old app during the process, removing our fallback
- Historical domain bug (Issue #4965) could rename custom domains; fixed in PR #5019 but we cannot verify Dokku version on host
- `apps:clone` does NOT copy custom domains or SSL certs, making it only marginally better than manual creation
- Manual "create + re-link" gives maximum control and preserves the old app as a verified fallback
- `postgres:link` and `redis:link` auto-set `DATABASE_URL` and `REDIS_URL` respectively -- no manual connection string copying needed

### Key Technical Details

**Database linking:**
```bash
dokku postgres:link voxpage-db proso-api    # Auto-sets DATABASE_URL
dokku redis:link voxpage-cache proso-api    # Auto-sets REDIS_URL
```

**Environment variable transfer:**
```bash
# Export from old app (excludes auto-set DATABASE_URL, REDIS_URL)
ssh ProxMox.Dokku "dokku config:export voxpage-api --format=shell"
# Set on new app (only non-auto-set vars)
ssh ProxMox.Dokku "dokku config:set proso-api KEY1=val1 KEY2=val2 ..."
```

**Domain and port configuration:**
```bash
dokku domains:set proso-api api.proso.com
dokku ports:set proso-api http:80:5000
```

**Health checks:** Dokku checks run against the container directly (localhost:5000), not the public domain. The Dockerfile already has a HEALTHCHECK directive. Zero-downtime deploys work by default.

### Alternatives Considered

| Approach | Pros | Cons |
| -------- | ---- | ---- |
| `apps:rename --skip-deploy` | Single command, preserves all config | Destructive (deletes old app), domain bug risk |
| `apps:clone --skip-deploy` | Keeps old app, copies env vars | Does NOT copy domains or SSL certs |
| Manual create + re-link | Maximum control, zero surprises, old app intact | Most labor-intensive, risk of missed env vars |

### Source Links
- [Dokku Application Management](https://dokku.com/docs/deployment/application-management/)
- [dokku-postgres Plugin](https://github.com/dokku/dokku-postgres)
- [dokku apps:rename domain bug - Issue #4965](https://github.com/dokku/dokku/issues/4965)
- [Zero Downtime Deploy Checks](https://dokku.com/docs/deployment/zero-downtime-deploys/)
- [Domain Configuration](https://dokku.com/docs/configuration/domains/)
- [Port Management](https://dokku.com/docs/networking/port-management/)

---

## R2: Cloudflare Tunnel Multi-Domain Configuration

### Decision
Use a single tunnel with multiple ingress rules. Keep old hostnames alongside new ones during the 1-week transition.

### Rationale
- A single `cloudflared` tunnel can route many hostnames to different local services via ingress rules
- Ingress rules are evaluated top-to-bottom; first match wins
- Old and new hostnames pointing to the same `http://localhost:80` coexist safely
- Only one `cloudflared` process, one config file, one systemd service to manage

### Key Technical Details

**Ingress config structure (`/etc/cloudflared/config.yml`):**
```yaml
tunnel: 1e71e3d9
credentials-file: /path/to/1e71e3d9.json

ingress:
  # New hostnames
  - hostname: api.proso.com
    service: http://localhost:80
  - hostname: logs.proso.com
    service: http://localhost:80
  # Old hostname (keep during transition)
  - hostname: voxpage-api.home301server.com.br
    service: http://localhost:80
  # Mandatory catch-all (MUST be last)
  - service: http_status:404
```

**DNS CNAME format for tunnel:**
```
Type: CNAME
Name: api (subdomain)
Target: 1e71e3d9.cfargotunnel.com
Proxy: Proxied (orange cloud) -- required for tunnel routing
```

**Auto-create DNS via CLI:**
```bash
cloudflared tunnel route dns 1e71e3d9 api.proso.com
cloudflared tunnel route dns 1e71e3d9 logs.proso.com
```

**Validation:**
```bash
cloudflared tunnel ingress validate  # Validates config.yml syntax
```

### Alternatives Considered

| Approach | Pros | Cons |
| -------- | ---- | ---- |
| Single tunnel, multiple ingress | Simplest, one process | All domains share one tunnel health |
| Multiple tunnels | Isolation | Unnecessary complexity |
| Cloudflare Load Balancer | Failover | Adds cost, overkill |

### Source Links
- [Cloudflare Tunnel Config File](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/local-management/configuration-file/)
- [DNS Records for Tunnel Routing](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/routing-to-tunnel/dns/)
- [Many Services, One Cloudflared](https://blog.cloudflare.com/many-services-one-cloudflared/)

---

## R3: GitHub Pages Custom Domain with Cloudflare

### Decision
Use DNS-only mode (grey cloud) for all GitHub Pages DNS records. Use apex domain (`proso.com`) with Cloudflare CNAME Flattening.

### Rationale
- When Cloudflare proxy is enabled (orange cloud), GitHub Pages **cannot provision or renew SSL certificates** because HTTP-01 challenges are intercepted
- With "Full (Strict)" SSL mode, the site breaks every ~90 days when cert expires (Error 526)
- DNS-only mode lets GitHub manage its own Let's Encrypt certificates automatically
- Cloudflare CNAME Flattening works even in DNS-only mode, enabling apex domain CNAME
- GitHub Pages has its own CDN (Fastly); double-proxying adds latency without value

### Key Technical Details

**DNS records (all DNS-only / grey cloud):**
```
Type: CNAME   Name: @     Target: phsb5321.github.io   Proxy: DNS-only
Type: CNAME   Name: www   Target: phsb5321.github.io   Proxy: DNS-only
```

Alternative (A records for apex):
```
Type: A   Name: @   Content: 185.199.108.153   Proxy: DNS-only
Type: A   Name: @   Content: 185.199.109.153   Proxy: DNS-only
Type: A   Name: @   Content: 185.199.110.153   Proxy: DNS-only
Type: A   Name: @   Content: 185.199.111.153   Proxy: DNS-only
```

**GitHub Pages setup:**
1. Add `CNAME` file with `proso.com` to repo (or configure via Settings > Pages)
2. Enable "Enforce HTTPS" in Pages settings
3. Wait for GitHub to provision SSL certificate (~15 minutes)

**Important:** DNS records for `api.proso.com` and `logs.proso.com` remain proxied (orange cloud) because they route through the Cloudflare Tunnel, not GitHub Pages.

### Alternatives Considered

| Approach | Pros | Cons |
| -------- | ---- | ---- |
| DNS-only (grey cloud) | SSL auto-renews, zero maintenance | No Cloudflare WAF for landing page |
| Proxied (orange cloud) + Full SSL | Cloudflare WAF/DDoS | SSL cert breaks every 90 days |
| Cloudflare Pages | Native Cloudflare integration | Requires migration from GitHub Actions deploy |

### Source Links
- [GitHub Pages Custom Domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [Secure and Fast GitHub Pages with CloudFlare](https://blog.cloudflare.com/secure-and-fast-github-pages-with-cloudflare/)
- [Cloudflare Certificate Renewal Discussion](https://github.com/orgs/community/discussions/23632)

---

## R4: DNS Management CLI

### Decision
Use `cloudflared tunnel route dns` for tunnel CNAME records. Use the Cloudflare dashboard or REST API for GitHub Pages records. Wrangler does NOT support DNS management.

### Rationale
- Wrangler (Cloudflare's Workers CLI) has no `dns` subcommand -- confirmed in docs and a feature request (workers-sdk #11772)
- `cloudflared tunnel route dns <TUNNEL> <HOSTNAME>` auto-creates CNAME records for tunnel routing
- The Cloudflare REST API handles arbitrary DNS records but requires API token and zone ID
- For only 4 DNS records, the Cloudflare dashboard is equally practical

### Key Technical Details

**Tunnel CNAME creation (preferred for api/logs subdomains):**
```bash
cloudflared tunnel route dns 1e71e3d9 api.proso.com
cloudflared tunnel route dns 1e71e3d9 logs.proso.com
```

**REST API for non-tunnel records (Pages CNAME/A records):**
```bash
ZONE_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=proso.com" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" | jq -r '.result[0].id')

curl -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"@","content":"phsb5321.github.io","proxied":false}'
```

**Verify zone access:**
```bash
curl -s "https://api.cloudflare.com/client/v4/zones?name=proso.com" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" | jq '.result[0].id'
```

### Alternatives Considered

| Tool | DNS Support | Notes |
| ---- | ----------- | ----- |
| Wrangler | No | Workers/Pages only, no DNS commands |
| `cloudflared` CLI | Tunnel CNAMEs only | Cannot create A records or non-tunnel CNAMEs |
| `flarectl` | Full CRUD | Requires Go installation |
| Cloudflare REST API | Full CRUD | Works with curl, no extra deps |
| Cloudflare Dashboard | Full CRUD | Not scriptable, but fine for 4 records |

### Source Links
- [Wrangler Commands Reference](https://developers.cloudflare.com/workers/wrangler/commands/)
- [Feature Request: DNS in Wrangler - workers-sdk #11772](https://github.com/cloudflare/workers-sdk/issues/11772)
- [Cloudflare API - DNS Records](https://developers.cloudflare.com/api/resources/dns/subresources/records/)
- [flarectl](https://pkg.go.dev/github.com/cloudflare/cloudflare-go/cmd/flarectl)

---

## R5: Dokku Zero-Downtime Deploy with Domain Change

### Decision
Use `domains:set` + `ports:set` on the new app, update Cloudflare Tunnel ingress, and rely on the existing Dockerfile HEALTHCHECK for zero-downtime deploys.

### Rationale
- Dokku health checks run against the container directly (`localhost:5000`), NOT the public domain -- domain changes don't affect health checks
- The Dockerfile already includes: `HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://localhost:5000/health')..."`
- Dokku's nginx auto-configures based on `domains:set` -- no manual nginx editing needed
- SSL is handled by Cloudflare Tunnel at the edge; Dokku only needs HTTP
- Zero-downtime is enabled by default in Dokku

### Key Technical Details

**Traffic flow:**
```
User → Cloudflare CDN → cloudflared tunnel → localhost:80 (nginx) → container:5000
```

**Dokku defaults for new apps:**
| Setting | Default | Our Value |
| ------- | ------- | --------- |
| Default checks wait | 10s | Sufficient (app starts in <5s) |
| Checks timeout | 30s | Sufficient |
| Checks attempts | 5 | Sufficient |
| Wait-to-retire | 60s | Sufficient |

**No nginx manual config needed** because:
1. `cloudflared` sends traffic to `localhost:80` with the correct `Host` header
2. Dokku's nginx matches the `Host` header against `domains:set` configuration
3. nginx routes to the correct Docker container

### Source Links
- [Zero Downtime Deploy Checks](https://dokku.com/docs/deployment/zero-downtime-deploys/)
- [app.json Format](https://dokku.com/docs/appendices/file-formats/app-json/)

---

## R6: GitHub Repository Rename Side Effects

### Decision
Rename `phsb5321/VoxPage` to `phsb5321/Proso`. Configure GitHub Pages custom domain BEFORE renaming. Update local git remotes after. Never create a new `VoxPage` repo.

### Rationale
- Internal Actions workflows continue working (GITHUB_REPOSITORY context updates automatically)
- No external repos depend on this private repo's workflows
- Git operations (clone/fetch/push) auto-redirect from old to new URL
- Issues, PRs, stars, releases all redirect automatically
- The redirect persists indefinitely UNLESS a new repo named `VoxPage` is created
- Pages custom domain insulates the site URL from the `.github.io/VoxPage` → `.github.io/Proso` change
- npm packages use `@proso/*` scope which is independent of the GitHub repo name

### Key Technical Details

**What auto-redirects after rename:**
- Git clone/fetch/push via old URL
- Issue and PR links
- Release download URLs
- Wiki links
- Stars and followers

**What does NOT redirect:**
- GitHub Actions `uses: phsb5321/VoxPage/...` references from external repos (not applicable -- private repo)
- The `.github.io` URL changes from `phsb5321.github.io/VoxPage` to `phsb5321.github.io/Proso`

**Post-rename checklist:**
1. Update local git remote: `git remote set-url origin git@github.com:phsb5321/Proso.git`
2. Verify GitHub Actions deploy triggers correctly
3. Verify GitHub Pages serves from custom domain `proso.com`
4. Update `repository` field in package.json files (informational, not functional)

### Source Links
- [Renaming a Repository - GitHub Docs](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)
- [Repository Redirects Are Here - GitHub Blog](https://github.blog/news-insights/product-news/repository-redirects-are-here/)
- [How Long Does GitHub Forward Renamed Repos?](https://github.com/orgs/community/discussions/22669)

---

## Straggler Code Audit

### Files with "voxpage" references (discovered during spec phase)

| File | Occurrences | Fix |
| ---- | ----------- | --- |
| `packages/server/Dockerfile` | 5 | Replace `@voxpage/server` → `@proso/server`, `@voxpage/shared` → `@proso/shared`, comment |
| `packages/site/robots.txt` | 1 | Replace GitHub Pages URL → `https://proso.com/sitemap.xml` |
| `packages/site/sitemap.xml` | 4 | Replace all `phsb5321.github.io/VoxPage/` → `proso.com/` |
| `services/proso-log-gateway/package-lock.json` | 2 | Regenerate via `cd services/proso-log-gateway && npm install` |
| `AGENTS.md` | 2 | Replace "VoxPage" → "Proso" |
| `MIGRATION_STATUS.md` | 2 | Replace "VoxPage" → "Proso" |

### Git remotes to update

| Remote | Current | New |
| ------ | ------- | --- |
| `origin` | `git@github.com:phsb5321/VoxPage.git` | `git@github.com:phsb5321/Proso.git` |
| `dokku` | `dokku@192.168.1.184:voxpage-api` | `dokku@192.168.1.184:proso-api` |
| `dokku-gateway` | `dokku@ProxMox.Dokku:voxpage-log-gateway` | `dokku@ProxMox.Dokku:proso-log-gateway` |
