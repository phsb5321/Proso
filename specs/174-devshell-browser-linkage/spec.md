# Feature 174 — the dev shell must ship a Firefox that starts

Date: 14/08/2026

## Problem

`shell.nix` put the top-level `nss` on `LD_LIBRARY_PATH` while also shipping
`firefox`. In the pinned channel those are incompatible:

| Package | Version |
|---|---|
| `pkgs.nss` (what the shell exported) | **3.112.5** |
| `pkgs.firefox` | 152.0.6, whose `libxul.so` requires **`NSS_3.113`** |
| `pkgs.nss_latest` | **3.125** |

The shell's NSS shadowed the one the Firefox wrapper resolves for itself, so
every Firefox launch inside `nix-shell` died:

```
XPCOMGlueLoad error for file .../firefox-152.0.6/lib/firefox/libxul.so:
.../nss-3.112.5/lib/libnss3.so: version `NSS_3.113' not found
Couldn't load XPCOM.
```

geckodriver surfaced that as `Could not start Firefox: binary is not a Firefox
executable` — which reads like a broken build or a product regression. It was
neither. The browser was fine; the environment was wrong. Real acceptance runs
spent minutes to reach a misleading error, and the reading-journey gates could
not run in the shell the harness documents.

## Requirements

- **FR-001** The dev shell exports one NSS that satisfies the Firefox it ships.
- **FR-002** A linkage failure is reported AS a linkage failure, naming the
  required symbol version, the offending library, and the remedy.
- **FR-003** The check executes the binary. Resolving a path or stat-ing it
  proves nothing about symbol versions.
- **FR-004** The Firefox-driving targets run the check first, so a broken
  environment fails fast instead of failing confusingly later.

## Non-goal, stated explicitly

**This does not make `make user-gate` green, and must not.** `user-gate` is a
deliberate fail-closed stub (`@exit 2`) pending the Feature 095 public-control
acceptance; its exit code is a product hold, not an infrastructure defect.
Turning it green here would be exactly the "success without observable effect"
failure this repository keeps finding. What this feature restores is the ability
of the browser gates to run at all.

## Acceptance

`node scripts/browser-linkage-check.mjs` PASSes in a fixed environment and FAILs
naming NSS in a shadowed one; `public-actor-gate` and `chrome-mv3-diagnostics`
both pass inside `nix-shell`.
