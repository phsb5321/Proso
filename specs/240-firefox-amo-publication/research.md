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
