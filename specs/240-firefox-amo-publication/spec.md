# Feature 240 — Public Firefox Add-ons publication

Date: 31/08/2026

## Problem

Firefox users cannot discover or install Proso from Mozilla Add-ons. Mozilla has approved versions 1.1.3, 1.2.0, and 1.2.1 only for self-distribution under the retired name **VoxPage**. The public product page does not exist, the current source version is 1.2.9, and the live website sends anonymous visitors to a private GitHub Releases page that returns 404.

## User stories

### US1 — Discover and install Proso

A Firefox user can search Mozilla Add-ons for **Proso**, open its public product page, and install an approved current version without a GitHub account.

**Independent acceptance:** Mozilla’s public add-on endpoint returns a public current version for `{41eb66cb-b520-4047-9b6c-63fdce6fca11}`, and the product-page install control is available anonymously.

### US2 — Keep existing self-distributed installations safe

A user already running the signed self-distributed build retains a valid update feed and downloadable XPI while the Mozilla-hosted channel is introduced.

**Independent acceptance:** `https://proso.com.br/updates.json` and every advertised XPI remain reachable with matching hashes before and after publication.

### US3 — Follow a truthful public install path

A visitor to `proso.com.br` sees the current distribution state and, once Mozilla publishes the listing, every Firefox install call-to-action points to that listing rather than a private repository or a stale “pending signing” notice.

**Independent acceptance:** the live homepage contains the Mozilla listing URL, has no private GitHub Releases install link, and makes no pending-signing claim after approval.

### US4 — See one product identity and one licence

The add-on, website, source metadata, and Mozilla listing identify the product as Proso and state the same open-source licence.

**Independent acceptance:** no public listing field uses VoxPage, and repository licence metadata agrees with the published AGPL-3.0-or-later terms.

## Functional requirements

- **FR-001:** Publish a Mozilla-hosted, publicly listed Firefox version newer than 1.2.1 under the existing extension ID.
- **FR-002:** The listed artifact MUST omit `browser_specific_settings.gecko.update_url` and MUST retain the extension ID, minimum Firefox version, and required data-collection declaration.
- **FR-003:** The listed artifact MUST be reproducible from the reviewed repository revision and pass Mozilla’s validator before submission.
- **FR-004:** The Mozilla product page MUST use the name Proso, a truthful reader-focused summary and description, the project website, support contact, privacy disclosure, appropriate categories, and the project licence.
- **FR-005:** Existing unlisted update metadata and signed artifacts MUST remain valid; publication MUST NOT replace or corrupt that channel.
- **FR-006:** Repository and website licence metadata MUST consistently state AGPL-3.0-or-later, matching the public terms already offered by Proso.
- **FR-007:** Website source MUST use `https://proso.com.br/` canonical URLs and expose the public Mozilla listing as the Firefox install destination after approval.
- **FR-008:** The corrected site MUST be published without dropping `updates.json` or `releases/`, and the live custom domain MUST preserve their content types and hashes.
- **FR-009:** Completion MUST be decided by anonymous live probes, not by a successful upload, signing event, dashboard label, or build log.

## Non-goals

- Chrome Web Store publication.
- Activating Paddle, paid checkout, or a production API deployment.
- Replacing the self-distributed Firefox channel.
- Claiming Mozilla review completion before the public listing is anonymously observable.

## Success criteria

1. Anonymous AMO lookup by GUID returns HTTP 200 with a public current version at least 1.2.9.
2. AMO search and the public product URL expose Proso, not VoxPage.
3. The submitted artifact passes the repository release-channel check and `web-ext lint` with zero errors.
4. The live site links to AMO and serves its update feed and signed XPI with unchanged integrity.
5. The repository’s full deterministic delivery gate and an independent different-family review pass at the exact submitted revision.
