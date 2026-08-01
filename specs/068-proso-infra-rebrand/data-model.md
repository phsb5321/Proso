# Data Model: Proso Infrastructure Rebrand

**Feature**: `068-proso-infra-rebrand`
**Date**: 2026-02-24
**Type**: Infrastructure migration (no database schema changes)

## Overview

This feature involves ZERO database schema changes. All entities below describe infrastructure components that are reconfigured, not data models that are created or modified.

## Infrastructure Entities

### Dokku App

Represents a deployed application on the Dokku host.

| Attribute | Old Value | New Value |
| --------- | --------- | --------- |
| Name | `voxpage-api` | `proso-api` |
| Domain | `voxpage-api.home301server.com.br` | `api.proso.com` |
| Port mapping | `http:80:5000` | `http:80:5000` (unchanged) |
| Linked postgres | `voxpage-db` | `voxpage-db` (unchanged) |
| Linked redis | `voxpage-cache` | `voxpage-cache` (unchanged) |

**State transition**: Old app runs in parallel with new app for 1 week, then old app is destroyed.

```
[voxpage-api: running] ─── Phase 2 ──→ [voxpage-api: running] + [proso-api: running]
                                                    │
                                          +7 days (Phase 7)
                                                    │
                                                    ▼
                                        [voxpage-api: destroyed] + [proso-api: running]
```

### Dokku Log Gateway App

| Attribute | Old Value | New Value |
| --------- | --------- | --------- |
| Name | `voxpage-log-gateway` | `proso-log-gateway` |
| Domain | (via tunnel) | `logs.proso.com` |

### Cloudflare DNS Records

| Record | Type | Target | Proxy Mode |
| ------ | ---- | ------ | ---------- |
| `api.proso.com` | CNAME | `1e71e3d9.cfargotunnel.com` | Proxied (orange) |
| `logs.proso.com` | CNAME | `1e71e3d9.cfargotunnel.com` | Proxied (orange) |
| `proso.com` | CNAME | `phsb5321.github.io` | DNS-only (grey) |
| `www.proso.com` | CNAME | `phsb5321.github.io` | DNS-only (grey) |

### Cloudflare Tunnel Ingress Rules

Order matters (top-to-bottom, first match wins).

| Hostname | Service | Status |
| -------- | ------- | ------ |
| `api.proso.com` | `http://localhost:80` | NEW |
| `logs.proso.com` | `http://localhost:80` | NEW |
| `voxpage-api.home301server.com.br` | `http://localhost:80` | KEEP (1 week) then REMOVE |
| (catch-all) | `http_status:404` | KEEP |

### Git Remotes

| Remote | Old URL | New URL |
| ------ | ------- | ------- |
| `origin` | `git@github.com:phsb5321/VoxPage.git` | `git@github.com:phsb5321/Proso.git` |
| `dokku` | `dokku@192.168.1.184:voxpage-api` | `dokku@192.168.1.184:proso-api` |
| `dokku-gateway` | `dokku@ProxMox.Dokku:voxpage-log-gateway` | `dokku@ProxMox.Dokku:proso-log-gateway` |

## Database Impact

**PostgreSQL (`voxpage-db`)**: NO changes. Service name stays `voxpage-db`. Data untouched. Only the app link changes (linked to `proso-api` in addition to `voxpage-api` during transition).

**Redis (`voxpage-cache`)**: NO changes. Service name stays `voxpage-cache`. Data untouched. Same dual-link pattern during transition.

## Validation Rules

- `DATABASE_URL` on `proso-api` must match `DATABASE_URL` on `voxpage-api` (same database)
- `REDIS_URL` on `proso-api` must match `REDIS_URL` on `voxpage-api` (same cache)
- All 9 API endpoints must return identical responses on both domains during transition
- Extension test suite must pass with no changes (API URLs are already `api.proso.com` in code)
