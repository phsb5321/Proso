# Claims truth audit — install CTA / status copy (T013A)

**Date:** 23/09/2026 12:36 BRT · **Branch:** `240-claims-truth` (worktree `proso-240-claims-truth`) · **Base:** `e09b24c`

Scope: every install/status/distribution claim shipped in `packages/site`
(`index.html` install-status block, AMO links, version metadata; `terms.html`;
status/CTA copy on the remaining pages), plus the self-distributed channel
wording. Method: anonymous fetches only — no login, no AMO/gh-pages/Paddle
access, no product code touched.

## Ground truth (captured 23/09/2026 12:30–12:36 BRT, anonymous)

**1. AMO API v5 — `https://addons.mozilla.org/api/v5/addons/addon/proso/`:**

```json
{
  "slug": "proso",
  "status": "public",
  "url": "https://addons.mozilla.org/en-US/firefox/addon/proso/",
  "current_version": {
    "version": "1.2.13",
    "reviewed": "2026-09-21T13:06:09Z",
    "file": {
      "url": "https://addons.mozilla.org/firefox/downloads/file/5046294/proso-1.2.13.xpi",
      "hash": "sha256:0e1a16334820136d0f91c9c194ff5306b297eb68f8d15e21615e973825d3989b"
    }
  },
  "compatibility": { "firefox": { "min": "109.0", "max": "*" } },
  "last_updated": "2026-09-21T13:06:09Z"
}
```

**2. AMO versions list — `.../addon/proso/versions/`** (count 3, all
`file_status: "public"`): `1.2.13` (reviewed `2026-09-21T13:06:09Z`),
`1.2.12` (reviewed `2026-09-21T11:41:09Z`), `1.2.10` (reviewed
`2026-09-04T02:30:26Z`). Nothing is pending review.

**3. Self-distributed feed — `https://proso.com.br/updates.json`:** exactly
three entries for `{41eb66cb-b520-4047-9b6c-63fdce6fca11}` — `1.1.3`
(`voxpage-1.1.3.xpi`) → `1.2.1` → **`1.2.12` (final)**, each with
`strict_min_version: "109.0"`. `HEAD https://proso.com.br/releases/proso-1.2.12.xpi`
→ `HTTP 200`, `content-type: application/x-xpinstall`, 365 317 bytes.

**4. Link probes:** `https://addons.mozilla.org/firefox/addon/proso/` →
`301` to the canonical listing (valid); `https://proso.com.br/legal/terms.html`
→ `200`. Version chain: `packages/extension/package.json` `1.2.13` =
JSON-LD `softwareVersion` `1.2.13` = AMO `current_version` `1.2.13`.

Conclusion of truth: **the add-on is published and current at 1.2.13 on AMO;
the self-distributed channel is closed at 1.2.12 and still served; the minimum
Firefox version is 109.0 everywhere.**

## Audit table

Verdicts: **TRUE** (matches ground truth today) · **STALE** (was true when
written, contradicts current truth) · **FALSE** (contradicts truth as written).

### A. `packages/site/index.html` — install-status block, AMO links, version metadata

| Claim | file:line | Ground truth | Verdict |
|---|---|---|---|
| JSON-LD `"operatingSystem": "Firefox 109+"` | packages/site/index.html:36 | AMO `compatibility.firefox.min "109.0"` | TRUE |
| JSON-LD `"softwareVersion": "1.2.13"` | packages/site/index.html:37 | AMO `current_version.version "1.2.13"`; `packages/extension/package.json` `1.2.13` | TRUE (manual metadata — drifts on the next release; see patch notes) |
| Nav CTA "Install for Firefox" → `addons.mozilla.org/firefox/addon/proso/` | packages/site/index.html:83 | Link `301` → canonical listing; `status: "public"` | TRUE |
| Hero CTA "Install for Firefox" → AMO link | packages/site/index.html:95 | Same probe | TRUE |
| `data-amo-status="published"` on `#install-status` | packages/site/index.html:149 | AMO `status: "public"` (listed & live) | TRUE |
| "Proso is published on Mozilla Add-ons. Firefox 109 or later is required." | packages/site/index.html:153 | `status: "public"`; `firefox.min "109.0"` | TRUE |
| CTA "Add to Firefox" → AMO link | packages/site/index.html:154 | Same probe | TRUE |
| "Before listening, configure a provider API key, a synthesis host you operate, or an eligible managed plan. Provider charges may apply." | packages/site/index.html:158 | Matches the extension's own first-run copy (BYOK / local host / managed) | TRUE |
| "The public AMO build sends no usage telemetry." | packages/site/index.html:222 | Build gate `make release-channels` asserts absence of telemetry categories (AMO_BUILD.md:50-52); not externally verifiable | TRUE (build-verified invariant) |
| "One click from Mozilla Add-ons installs the signed build. No account needed, no signup forms." | packages/site/index.html:240 | `current_version.file` = AMO-signed `proso-1.2.13.xpi`, `file_status` implied public; AMO listing installs without an account | TRUE |
| Pricing-card CTA "Install for Firefox" → AMO link | packages/site/index.html:294 | Same probe | TRUE |

### B. `packages/site/terms.html`

| Claim | file:line | Ground truth | Verdict |
|---|---|---|---|
| Nav CTA "Install for Firefox" → AMO link | packages/site/terms.html:42 | Link `301` → canonical listing | TRUE |
| Note referencing the "standalone Terms of Service" at `legal/terms.html` | packages/site/terms.html:53 | `https://proso.com.br/legal/terms.html` → `200` | TRUE |

### C. Other shipped pages — status/CTA copy

| Claim | file:line | Ground truth | Verdict |
|---|---|---|---|
| Nav CTAs "Install for Firefox" → AMO link (identical on three pages) | packages/site/pricing.html:42, packages/site/privacy.html:42, packages/site/success.html:32 | Link `301` → canonical listing | TRUE |
| Free-tier CTA "Install for Firefox" → AMO link | packages/site/pricing.html:84 | Same probe | TRUE |
| "Install Proso from Mozilla Add-ons in Firefox 109 or later. Before listening, configure your provider API key, a synthesis host you operate, or an eligible managed plan." | packages/site/pricing.html:172 | `status: "public"`; `firefox.min "109.0"`; matches install-status copy at index.html:158 | TRUE |
| Nav CTA "Install for Firefox" → `index.html#install-status` | packages/site/support.html:39 | Anchor exists (index.html:149) | TRUE |

### D. Self-distributed channel wording (verification requested)

| Claim | file:line | Ground truth | Verdict |
|---|---|---|---|
| "Update — 21/09/2026: 1.2.13 submitted, self-distributed channel closed"; body: "**1.2.13 is submitted to AMO** (version id 6502140, `unreviewed`, …)" | docs/reading-journey-status.md:3, 5-6 | AMO now reports `current_version "1.2.13"` `reviewed 2026-09-21T13:06:09Z`, file public — approved, not `unreviewed` | STALE (channel-closed half TRUE; `submitted`/`unreviewed` snapshot superseded same day) |
| "The self-distributed channel is live and closed, not left behind. `updates.json` advertises 1.1.3 → 1.2.1 → **1.2.12**, and `releases/proso-1.2.12.xpi` answers 200 as `application/x-xpinstall`…" | docs/reading-journey-status.md:16-18 | Live feed (23/09/2026 12:32 BRT): exactly those three entries ending at 1.2.12; XPI `200`, `application/x-xpinstall`, 365 317 bytes (hash `5d0dd2c3…` as advertised). Note: the 1.1.3 artifact keeps the retired `voxpage-1.1.3.xpi` filename — harmless | TRUE (channel closes at 1.2.12 exactly as worded) |
| "The signed self-distributed channel intentionally remains at 1.2.1; the 1.2.10 binary is the separate Mozilla-hosted listing and is awaiting Mozilla review." | infra/aws/docs/20-site-status.md:186-187 | Feed's final entry is **1.2.12**, not 1.2.1; AMO versions `1.2.10`/`1.2.12`/`1.2.13` all reviewed and `file_status: "public"` — nothing awaits review | STALE (both halves now wrong) |
| Channel-boundary wording: the listed build "removes only the self-distributed channel's `browser_specific_settings.gecko.update_url`"; `make release-channels` "builds listed and self-distributed Firefox variants" and checks the boundary | AMO_BUILD.md:38, 44-52 | Consistent with the two observed channels (AMO-hosted listed updates by id; self-distributed feed closed at 1.2.12, builds still possible) | TRUE |

**Totals: 21 claims audited — 19 TRUE, 2 STALE, 0 FALSE.** All shipped site
copy (§A–C) is truthful today; both stale claims are in docs (§D).

## Minimal proposed copy/metadata diff (proposed only — NOT applied)

No `packages/site` change is required: every shipped install-CTA/status claim
matches the AMO API and the live feed. The minimal diff corrects the two stale
doc claims:

```diff
--- a/docs/reading-journey-status.md
+++ b/docs/reading-journey-status.md
@@ -1,5 +1,13 @@
 # Reading journey status
 
+## Update — 23/09/2026: 1.2.13 approved and current on AMO
+
+The anonymous AMO API now reports the add-on `public` with `current_version`
+1.2.13 (`reviewed` 2026-09-21T13:06:09Z, file `proso-1.2.13.xpi`, public),
+superseding the `unreviewed` snapshot below. The self-distributed channel stays
+closed at 1.2.12 — `updates.json` and `releases/proso-1.2.12.xpi` are unchanged
+and still served.
+
 ## Update — 21/09/2026: 1.2.13 submitted, self-distributed channel closed
 
 **1.2.13 is submitted to AMO** (version id 6502140, `unreviewed`, 0 validation
--- a/infra/aws/docs/20-site-status.md
+++ b/infra/aws/docs/20-site-status.md
@@ -185,3 +185,6 @@
 minimal build-tested source closures for 1.1.3, 1.2.1, and the corrected 1.2.10 candidate are publicly available.
-The signed self-distributed channel intentionally remains at 1.2.1; the 1.2.10
-binary is the separate Mozilla-hosted listing and is awaiting Mozilla review.
+The signed self-distributed channel is closed at 1.2.12 — its final feed entry
+on `https://proso.com.br/updates.json`, with `releases/proso-1.2.12.xpi` still
+served. The Mozilla-hosted listing carries 1.2.10, 1.2.12 and 1.2.13, all
+reviewed and public; 1.2.13 is the current release.
```

Optional follow-up (out of T013A, no diff proposed): `softwareVersion` at
index.html:37 is hand-maintained and will go stale at the next release — wire it
to `packages/extension/package.json` at site build time or drop the field.

## NOT covered (explicit)

- **Pricing/money-path truth** — tier prices, credits, JSON-LD `offers` vs
  pricing cards (e.g. `$3.33`/`$9.99` annual-equivalents vs terms.html
  `$39.99`/`$119.99` annual), Paddle/refund claims. Not install-CTA/status.
- **Competitor comparison table** claims (index.html:338-406), incl. "Available
  (paywall unclear)" (index.html:383) — third-party claims, not ours to verify.
- **Funding-channel copy** (support.html:98, "appear here as soon as they are
  published") — donation channels, not the install path.
- **AMO-authored listing text** (summary/name/tags on addons.mozilla.org) —
  used as ground truth only; authored outside the repo.
- **`specs/240-firefox-amo-publication/spec.md` problem framing** (spec.md:7,
  "the live website sends anonymous visitors to a private GitHub Releases page
  that returns 404") — historical problem statement of this spec, not shipped
  copy; the live site now points every CTA at AMO (verified above).
- **Extension UI strings** — covered by `docs/l10n-inventory.md` (21/09/2026).
- **`sitemap.xml` lastmod, og:/twitter: metadata beyond version**, robots.txt —
  no status/version claims found there.
- **Legal substance** of terms/privacy (only the terms.html link truth was
  checked, per scope).
- **Reviewer notes, source listings, MD5/size of older artifacts** and anything
  requiring AMO/gh-pages/Paddle authentication — deliberately untouched.
