# Research — Feature 240

## Before state — 31/08/2026 20:16 BRT

### Mozilla Add-ons

Authenticated Developer Hub state:

- Add-on id: `2978221`
- GUID: `{41eb66cb-b520-4047-9b6c-63fdce6fca11}`
- Slug/name: `voxpage` / `VoxPage`
- Versions: 1.1.3, 1.2.0, and 1.2.1 — all Approved, self-hosted/unlisted
- Latest approval email: 1.2.1 tentatively approved by automatic validation on 01/08/2026
- No listed version, pending listed review, or public product page exists

Anonymous probes:

```text
GET /en-US/firefox/addon/proso/                              404
GET /en-US/firefox/addon/voxpage/                            404
GET /api/v5/addons/addon/{GUID}/                             401
GET /api/v5/addons/search/?q=Proso&type=extension            0 matching results
```

The 401 is the private unlisted object, not a public listing. The authenticated dashboard confirms the channel and versions.

### Authentication recovery

The Firefox Accounts login reached two-step authentication. `rbw` exposed no TOTP because its cache omitted the built-in URI, but the official Bitwarden item `Mozilla` contains that URI. The official CLI was unlocked from `BW_KEYRING`, the code was generated locally without printing or persisting the seed, and the AMO session is now authenticated in the task’s isolated browser profile. No human credential handoff is required.

### Public install and update path

The live homepage’s first install link is:

```text
https://github.com/phsb5321/Proso/releases
```

That private-repository URL returns 404 anonymously.

The live feed advertises:

| Version | Update URL | SHA-256 |
|---|---|---|
| 1.1.3 | `https://phsb5321.github.io/Proso/releases/voxpage-1.1.3.xpi` | `d2ca4dfac143b09fcd7d1b8288bb55a2687010ed86313c9a6c84244205e89794` |
| 1.2.1 | `https://phsb5321.github.io/Proso/releases/proso-1.2.1.xpi` | `c1e4eef1c97bdc470b504425630a1458b8c66d585ca82004fbec64ef5856aa4c` |

Both downloaded bytes match their advertised hashes, but GitHub Pages serves both XPIs as `text/html`. The existing CloudFront origin serves the same 1.2.1 XPI as `application/x-xpinstall`.

### Existing CloudFront origin

- Distribution: `E270HHOCYNLND`
- Domain: `d23aubpqrsmco3.cloudfront.net`
- Homepage, update feed, legal pages: HTTP 200 with correct types
- `releases/proso-1.2.1.xpi`: HTTP 200 `application/x-xpinstall`
- Origin is private and OAC-only; S3 direct access returns 403
- `proso.com.br` still resolves to GitHub Pages (`185.199.108-111.153` plus GitHub IPv6 addresses)
- Previous ACM certificate reached `VALIDATION_TIMED_OUT`; a replacement request and fresh Cloudflare validation record are required before DNS cutover

### Repository state

- Exact base: `9e40e34a8d66dfe91c0dc864c7befbf87f8535ca`
- Extension source version: 1.2.9
- Root package version: 1.2.1
- Listed-build support already exists and removes only `update_url`
- The manifest incorrectly declared required `none` plus optional `websiteContent`/`technicalAndInteraction`. Mozilla defines collection as any data handled outside the add-on or local browser; synthesis necessarily transmits the requested page text, so `websiteContent` is required. Remote telemetry is not required and conflicts with the constitution.
- Remote telemetry was dormant in release builds only because no token was injected, but entrypoints failed open on an absent `telemetryEnabled`, the settings toggle rendered checked, and the manifest requested the telemetry host. Publication must remove that capability rather than describe it as active.
- Root licence file: GPL-3.0
- Root/extension package metadata: MIT
- Server metadata and public site terms: AGPL-3.0 / AGPL-3.0-or-later

The objective licence normalization target is AGPL-3.0-or-later because that is the current public offer and server/source posture; this removes contradictory metadata rather than inventing a new public licence.

## Submission outcome — 31/08/2026

- Listed version id: `6452602`
- Binary version: 1.2.9
- Uploaded binary SHA-256: `6c63c81cd5db92dad0a3832a568178e8f8adf6a724a47ea4a8236248cf504d9d`
- Corresponding-source SHA-256: `796681f961d8d6b672d8b8c771702ba270b18a0d3063c6b149adcbf1533d8310`
- Source revision: `210da8b4ff6bb9f3d1eb5e430a9440fcc9801940`
- Automated validation: 0 errors; AMO status `Awaiting Review`
- Identity: name and slug are now `Proso` / `proso`
- Listing metadata: summary, full description, Language Support and Photos/Music & Videos categories, support address/site, custom AGPL-3.0-or-later text, privacy policy, icon, four screenshots with captions, release notes, and reviewer notes

WXT’s generated source ZIP was rejected before upload: it contained only the extension workspace, omitted the root lock/workspace and shared package, and could not reproduce the monorepo build. `scripts/package-amo-listed.sh` now archives the complete committed tree and adds `SOURCE_COMMIT`. A fresh extraction installed from the frozen lock and rebuilt all 19 packaged files byte-for-byte; tree-manifest SHA-256 `ef79f8ef7f30ed4a2795117487cc07da976f9026fbc19720f37be3874f9eb512`.

## Site/cutover outcome — 31/08/2026 21:52 BRT

- `gh-pages` PR #238 published the exact source archive and changed existing update links to `proso.com.br`; both XPI hashes stayed unchanged.
- The corrected site, source archive, update manifest, and signed XPIs were published to the private S3/OAC origin through least-privilege role `proso-deploy`.
- A replacement ACM certificate was requested, validated by an exact DNS-only Cloudflare CNAME, reached `ISSUED`, and was attached to CloudFront with `TLSv1.2_2021`.
- The Cloudflare apex CNAME changed from `phsb5321.github.io` to `d23aubpqrsmco3.cloudfront.net`, DNS only. The prior target is the rollback value.
- Live `proso.com.br` serves the corrected site through CloudFront, with zero stale install/free-tier claims, four AMO links, correct canonical URL, both XPI hashes intact, source archive SHA intact, and no public workspace `package.json`.
- Final Terraform plan: `No changes`.
- `www.proso.com.br` no longer serves the stale GitHub Pages site: its proxied CNAME points at the apex, an enabled HTTPS WWW-to-apex redirect preserves path/query, and a companion HTTP-to-HTTPS redirect produces a verified two-hop HTTP journey to the canonical URL.
- Cloudflare Email Routing is enabled with verified destination `pedrobalbino@proton.me`; `support@`, `privacy@`, `security@`, and `commercial@proso.com.br` are active literal routes. Cloudflare owns three MX records plus SPF/DKIM; the previous null MX and deny-all SPF are the recorded rollback values. A Gmail message to `support@proso.com.br` arrived in Proton with `Delivered-To: pedrobalbino@proton.me`, proving the public support address end to end.

## Independent gate and corrected candidate — 31/08/2026 23:37 BRT

The first Anthropic different-family gate BLOCKED exact head `7590491` on three reproduced completion blockers: pending install CTAs required the public 404; the submitted source named a dangling pre-rebase commit and exposed the entire private monorepo; and the Knip gate found two telemetry capture exports orphaned by the removal. It also found missing historical source offers and optional BYOK authentication disclosure.

The corrected 1.2.10 candidate closes each finding:

- Pending install controls route to the honest in-page status; only the status callout links AMO. The gate binds `data-amo-status` to both copy and every CTA, with a mismatch plant.
- Required `websiteContent` remains; optional `authenticationInfo` covers BYOK credentials; no telemetry category exists.
- Retired telemetry identifiers/credentials/IndexedDB events are cleared on update, and the two unused capture modules are deleted. Knip reports 46 known, 0 new.
- Source packaging requires a clean HEAD exactly pushed to its origin branch and archives only the extension build closure. Version 1.2.10 source SHA-256 is `e9bf6504efd5b443b33ce4c2c1346431ecee833dadf354dc4f5d6321630d2116`, bound to reachable commit `c270d8e` and PR #241. Fresh extraction rebuilt all 19 package files byte-for-byte; tree SHA-256 `bde87bd97d6d5f690352eff251af16627ac4e332290d070cb1a85b83bd526e08`.
- Build-tested historical source closures are live for 1.1.3 (`3fa96c20…`) and 1.2.1 (`5f371c4d…`); the dangling 1.2.9 archive is removed.
- The unpublished AMO 1.2.9 candidate is disabled. Corrected AMO version `6452761` (1.2.10) is submitted with binary SHA-256 `6edf5661d6f48f787d90722d544bf0a7829bfe8a55dc701435fd40fa8460a406`, complete source and reviewer notes, 0 validation errors, and status **Awaiting Review**.
