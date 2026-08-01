# Feature Specification: Proso Infrastructure Rebrand

**Feature Branch**: `068-proso-infra-rebrand`
**Created**: 2026-02-24
**Status**: Draft
**Input**: Complete the Proso rebrand infrastructure migration (VoxPage -> Proso) across DNS, Cloudflare, Dokku, GitHub, and external services.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - API Consumers Reach Proso on New Domain (Priority: P1)

An API consumer (the Proso browser extension, or a developer using the API) sends requests to `api.proso.com` and receives correct responses. The old domain `voxpage-api.home301server.com.br` continues to work during a 1-week transition period.

**Why this priority**: The API is the production backend serving paying users. If it goes down, TTS synthesis, license validation, and credit management all break. This is the highest-risk, highest-impact migration step.

**Independent Test**: Can be fully tested by running `curl -s https://api.proso.com/health` and verifying a `{"status":"ok"}` response, then repeating all 9 API endpoint smoke tests.

**Acceptance Scenarios**:

1. **Given** the new Dokku app `proso-api` is deployed with database links, **When** a request is sent to `https://api.proso.com/health`, **Then** the response contains `{"status":"ok"}` with version info.
2. **Given** DNS records are configured, **When** `dig api.proso.com` is run, **Then** it resolves through Cloudflare Tunnel to the correct server.
3. **Given** old and new domains are both configured, **When** a request is sent to the old domain, **Then** it continues to respond correctly for at least 7 days.
4. **Given** the extension is built, **When** it makes API calls, **Then** all requests go to `api.proso.com` (not the old domain).
5. **Given** the database `voxpage-db` is linked to the new app, **When** database queries execute, **Then** all existing user data (subscriptions, credits, licenses) is preserved with zero data loss.

---

### User Story 2 - Log Gateway Receives Extension Telemetry (Priority: P2)

The Proso extension sends telemetry logs to `logs.proso.com` and the log gateway accepts and forwards them to Loki. Grafana dashboards display logs with `app="proso"` labels.

**Why this priority**: Logging is critical for debugging production issues, but the extension functions without it. It can be migrated independently after the API.

**Independent Test**: Can be tested by sending a POST to `https://logs.proso.com/ingest` with a valid log payload and verifying Loki receives it.

**Acceptance Scenarios**:

1. **Given** the log gateway is deployed on `proso-log-gateway`, **When** the extension sends a log batch to `https://logs.proso.com/ingest`, **Then** the gateway accepts with HTTP 200/204.
2. **Given** logs are flowing to Loki, **When** Grafana queries `{app="proso"}`, **Then** recent logs appear.

---

### User Story 3 - Landing Page Serves from proso.com (Priority: P2)

A visitor navigates to `proso.com` (or `www.proso.com`) and sees the Proso landing page with correct content, valid SSL, and working links.

**Why this priority**: The landing page is the public face of the product. It's independent of the API migration and can be done in parallel.

**Independent Test**: Navigate to `https://proso.com` in a browser and verify the page loads with valid SSL.

**Acceptance Scenarios**:

1. **Given** GitHub Pages custom domain is set to `proso.com`, **When** a browser navigates to `https://proso.com`, **Then** the landing page loads with a valid SSL certificate.
2. **Given** DNS records point to GitHub Pages, **When** `www.proso.com` is accessed, **Then** it redirects to or serves the same content as `proso.com`.
3. **Given** the GitHub repo is renamed to `phsb5321/Proso`, **When** GitHub Actions deploy workflow triggers, **Then** the site deploys successfully.

---

### User Story 4 - Repository Reflects New Brand (Priority: P3)

The GitHub repository is renamed from `phsb5321/VoxPage` to `phsb5321/Proso`. All CI/CD workflows, documentation files, and build artifacts reference the new name.

**Why this priority**: This is a branding concern. GitHub auto-redirects old URLs, so nothing breaks immediately. But stale references create confusion.

**Independent Test**: Visit `github.com/phsb5321/Proso`, verify the repo page loads. Run a straggler grep for "voxpage" and verify zero non-historical matches.

**Acceptance Scenarios**:

1. **Given** the repo is renamed, **When** old URLs like `github.com/phsb5321/VoxPage` are visited, **Then** they redirect to the new repo.
2. **Given** the codebase is grep'd for "voxpage" (case-insensitive), **When** excluding `specs/`, `node_modules/`, `.git/`, and `.output/`, **Then** zero matches are found.
3. **Given** the Dockerfile uses `@proso/*` package names, **When** `git push dokku main:main` runs, **Then** the Docker build succeeds.

---

### User Story 5 - External Services Updated (Priority: P3)

Paddle billing, Firefox AMO listing, and Grafana dashboards all reference "Proso" instead of "VoxPage". Paddle webhook URLs point to the new API domain.

**Why this priority**: These are manual, low-risk updates to third-party dashboards. They don't affect functionality but complete the brand transition.

**Independent Test**: Log into each service dashboard and verify the product name shows "Proso".

**Acceptance Scenarios**:

1. **Given** Paddle product is renamed, **When** a user views their billing, **Then** the product name shows "Proso".
2. **Given** Paddle webhooks point to `api.proso.com`, **When** a subscription event fires, **Then** the webhook reaches the new API.
3. **Given** Grafana dashboards use `app="proso"` filter, **When** viewing logs, **Then** current telemetry data appears.

---

### Edge Cases

- What happens if the Cloudflare Tunnel goes down during the transition? Both old and new domains fail -- this is existing infrastructure risk, not introduced by the migration.
- What if `postgres:link` auto-sets a conflicting `DATABASE_URL`? The link command auto-sets `DATABASE_URL` from the service. If a manual config var exists, the link variable gets an alternative name. Use `postgres:promote` to swap if needed.
- What if the Dokku host is running an old version with the `apps:rename` domain bug? We avoid `apps:rename` entirely by creating a fresh app.
- What happens to old domain after the 1-week transition? Remove the Cloudflare Tunnel ingress rule and let DNS TTL expire. Requests to the old domain will stop resolving.
- What if GitHub Pages SSL fails because Cloudflare proxy is enabled? Use DNS-only mode (grey cloud) for GitHub Pages DNS records to let GitHub manage its own SSL certificates.

## Requirements *(mandatory)*

### Functional Requirements

#### Phase 1: DNS & Cloudflare Configuration

- **FR-001**: System MUST verify `proso.com` domain ownership and zone access in Cloudflare before any DNS changes.
- **FR-002**: DNS records MUST be created for `api.proso.com` (CNAME to tunnel), `logs.proso.com` (CNAME to tunnel), `www.proso.com` (CNAME to GitHub Pages), and `proso.com` root (CNAME flatten or A records to GitHub Pages).
- **FR-003**: Cloudflare Tunnel ingress rules MUST be updated to route `api.proso.com` and `logs.proso.com` while keeping old `voxpage-api.home301server.com.br` temporarily.
- **FR-004**: The `cloudflared` systemd service MUST be restarted and tunnel health verified after config changes.

#### Phase 2: Dokku App Creation & Deployment

- **FR-005**: A new Dokku app `proso-api` MUST be created on the ProxMox host.
- **FR-006**: Existing databases MUST be linked to the new app: `voxpage-db` (PostgreSQL) and `voxpage-cache` (Redis) linked to `proso-api`. The database and cache services MUST NOT be renamed or recreated.
- **FR-007**: All environment variables from `voxpage-api` MUST be exported and set on `proso-api`, excluding auto-set variables (`DATABASE_URL`, `REDIS_URL`) which are injected by the link commands.
- **FR-008**: Domain `api.proso.com` MUST be set on the new app via `dokku domains:set`.
- **FR-009**: Port mapping MUST route `http:80:5000` on the new app.
- **FR-010**: The local `dokku` git remote MUST be updated to point to `proso-api`.
- **FR-011**: Deployment MUST succeed via `git push dokku main:main` with passing health checks.
- **FR-012**: The `/health` endpoint MUST return `{"status":"ok"}` on the new domain.
- **FR-013**: All 9 API endpoints MUST respond correctly on the new domain (health, license, subscription, voices, credits balance, credits history, synthesize, checkout, webhook).

#### Phase 3: Log Gateway Migration

- **FR-014**: A new Dokku app `proso-log-gateway` MUST be created and configured with the `logs.proso.com` domain.
- **FR-015**: The `dokku-gateway` git remote MUST be updated to point to the new app.
- **FR-016**: The log gateway MUST accept log pushes from the extension on the new domain.

#### Phase 4: GitHub & Static Site

- **FR-017**: The GitHub repository MUST be renamed from `phsb5321/VoxPage` to `phsb5321/Proso`.
- **FR-018**: GitHub Pages custom domain MUST be configured to `proso.com`.
- **FR-019**: GitHub Actions workflows MUST trigger correctly after the rename.
- **FR-020**: All hardcoded GitHub URLs in project files MUST be updated to reference the new repo name.
- **FR-021**: The site MUST be accessible at `https://proso.com` with valid SSL.

#### Phase 5: Straggler Code Fixes

- **FR-022**: The server Dockerfile MUST be updated from `@voxpage/*` to `@proso/*` package references and comment.
- **FR-023**: `packages/site/robots.txt` and `packages/site/sitemap.xml` MUST be updated from old GitHub Pages URLs to `proso.com` URLs.
- **FR-024**: `services/proso-log-gateway/package-lock.json` MUST be regenerated with the correct `proso-log-gateway` name.
- **FR-025**: `AGENTS.md` and `MIGRATION_STATUS.md` MUST be updated to reference "Proso" instead of "VoxPage".

#### Phase 6: External Services

- **FR-026**: Paddle billing dashboard product name MUST be updated to "Proso".
- **FR-027**: Paddle webhook URLs MUST point to `api.proso.com`.
- **FR-028**: Grafana/Loki dashboard label filters MUST be updated from `app="voxpage"` to `app="proso"`.
- **FR-029**: Firefox AMO listing MUST be updated to "Proso" on next submission.

#### Phase 7: Cleanup & Verification

- **FR-030**: After 1-week transition, old Cloudflare Tunnel ingress rules for the old domain MUST be removed.
- **FR-031**: The old Dokku app `voxpage-api` MUST be unlinked from databases and destroyed only after the new app is verified.
- **FR-032**: The old Dokku app `voxpage-log-gateway` MUST be destroyed after the new gateway is verified.
- **FR-033**: All stale git remotes MUST be updated or removed.
- **FR-034**: `CLAUDE.md` MUST be updated to reflect the final infrastructure state.
- **FR-035**: A final straggler grep MUST confirm zero non-historical "voxpage" references.

### Business Invariants (MUST be preserved)

| ID      | Rule                                        | Verification                                       |
| ------- | ------------------------------------------- | -------------------------------------------------- |
| INV-001 | Free tier never requires account creation   | No schema changes; verify free-tier endpoint works  |
| INV-002 | BYOK always available on all tiers          | No API changes; verify BYOK endpoint works          |
| INV-003 | Word-level sync always free                 | Client-side only; no server change                  |
| INV-004 | No credit expiration mid-billing cycle      | No schema changes; verify credits endpoint          |
| INV-005 | Browser TTS always unlimited                | Client-side only; no server change                  |
| INV-006 | Cached content never re-charges             | Cache logic unchanged; verify cache endpoint        |

### Safety Constraints

1. **NEVER** rename the PostgreSQL service `voxpage-db` or Redis service `voxpage-cache` -- these contain production data.
2. **NEVER** destroy `voxpage-api` until `proso-api` is fully verified and serving traffic.
3. **NEVER** create a new GitHub repository named `VoxPage` after renaming -- this would break redirects.
4. Keep old domain as fallback for at least 1 week.
5. Run full test suites before and after deployment.
6. Use DNS-only mode (grey cloud) for GitHub Pages DNS records to avoid SSL issues.

### Key Entities

- **Dokku App**: A deployed application container on the Dokku host, identified by name. Two will coexist temporarily: `voxpage-api` (old) and `proso-api` (new).
- **Cloudflare Tunnel**: A secure connection from the Dokku host to Cloudflare's edge, routing public domain traffic to local services. Single tunnel ID `1e71e3d9` routes all hostnames.
- **DNS Record**: A Cloudflare-managed record mapping a hostname to either a tunnel CNAME or GitHub Pages IP addresses.
- **Git Remote**: A named URL in the local git config pointing to a deployment target (origin, dokku, dokku-gateway).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `curl -s https://api.proso.com/health | jq .status` returns `"ok"` -- API is live on new domain.
- **SC-002**: `dig api.proso.com` resolves correctly through Cloudflare -- DNS is configured.
- **SC-003**: All 9 API endpoints respond correctly on new domain -- full API functionality verified.
- **SC-004**: Extension builds and connects to `api.proso.com` -- client-server integration works.
- **SC-005**: `https://proso.com` loads the landing page with valid SSL -- static site is live.
- **SC-006**: Grafana dashboards show logs with `app="proso"` label -- telemetry pipeline works.
- **SC-007**: Zero straggler references to "voxpage" in non-historical files -- brand transition complete.
- **SC-008**: Old domain continues to work during 1-week transition -- backwards compatibility maintained.
- **SC-009**: All 2,300+ extension tests and 287+ server tests pass -- no functional regressions.
- **SC-010**: No data loss -- existing database records, Redis cache, and user configurations preserved.

## Assumptions

1. The Dokku host is accessible via SSH alias `ProxMox.Dokku` (IP: `192.168.1.184`).
2. The `cloudflared` config file is at `/etc/cloudflared/config.yml` on the Dokku host.
3. The Dokku version is recent enough to have the `apps:rename` domain bug fix (PR #5019), though we avoid using `apps:rename` regardless.
4. The Cloudflare account has API token access for DNS record management.
5. The `proso.com` domain zone is already active in Cloudflare.
6. Paddle and AMO dashboard access is available for manual updates.
7. The Grafana/Loki instance is accessible for dashboard filter updates.

## Research Findings Summary

### R1: Dokku Migration Strategy
**Decision**: Create new app + re-link databases (manual approach), NOT `apps:rename`.
**Rationale**: Maximum safety. Old app stays running as fallback. No risk of domain bugs or config variable loss. `postgres:link` and `redis:link` auto-set `DATABASE_URL` and `REDIS_URL`.

### R2: Cloudflare Tunnel Multi-Domain
**Decision**: Single tunnel, multiple ingress rules. Old and new hostnames coexist.
**Rationale**: Simplest approach. One `cloudflared` process, one config file. Ingress rules evaluated top-to-bottom.

### R3: GitHub Pages + Cloudflare
**Decision**: DNS-only mode (grey cloud) for GitHub Pages records. Apex domain with CNAME Flattening.
**Rationale**: Avoids SSL certificate renewal failures. GitHub provides its own CDN. No benefit to double-proxying a static landing page.

### R4: DNS Management CLI
**Decision**: Use `cloudflared tunnel route dns` for tunnel CNAMEs, Cloudflare REST API for other records.
**Rationale**: Wrangler does NOT support DNS management. `cloudflared` is already installed. REST API works for non-tunnel records.

### R5: Dokku Zero-Downtime Deploy
**Decision**: Use `domains:set` + `ports:set`, rely on existing Dockerfile HEALTHCHECK.
**Rationale**: Health checks run against container directly (not public domain). Nginx auto-configures. Cloudflare Tunnel handles SSL.

### R6: GitHub Repo Rename
**Decision**: Rename to `phsb5321/Proso`. Set custom domain for Pages first. Update local remotes after.
**Rationale**: Minimal impact for private repo. Git operations auto-redirect. Custom domain insulates Pages from URL change. Never create a new `VoxPage` repo.

## Dependencies

- Phase 1 (DNS) must complete before Phase 2 (Dokku deploy) can be verified via public URL.
- Phase 2 (API deploy) should complete before Phase 3 (Log gateway), as the extension's primary function depends on the API.
- Phase 4 (GitHub rename) can happen in parallel with Phases 2-3, but Pages custom domain setup should happen before the repo rename.
- Phase 5 (code fixes) should happen as part of the deployment branch -- fix straggler references, commit, deploy.
- Phase 6 (external services) is independent and can happen any time after Phase 2.
- Phase 7 (cleanup) must wait at least 1 week after all other phases.
