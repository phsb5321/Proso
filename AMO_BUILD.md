# Reproduce the Firefox AMO package

This archive is the corresponding source for Proso’s listed Firefox build.
`SOURCE_COMMIT` identifies the exact repository revision used to create it.

## Environment

- Linux x86_64 (the build is platform-independent)
- Node.js 22
- pnpm 10.30.3
- GNU Make for the combined validation target

On NixOS, `nix-shell` enters the repository’s complete toolchain. On other
systems, install Node.js 22 and enable the pinned pnpm version from
`packageManager` in `package.json`.

## Build

From the archive root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @proso/extension build:firefox-listed
pnpm --filter @proso/extension zip:firefox-listed
```

The listed package is written to:

```text
packages/extension/.output-listed/prosoextension-<version>-firefox.zip
```

`<version>` is the `version` field of `packages/extension/package.json`.

The source uses WXT 0.20.13, Vite 6.4.3, and esbuild minification. It uses no
obfuscator and emits no production source maps. No credential or environment
variable is required. The listed build sets `PROSO_LISTED=1`; this removes only
the self-distributed channel’s `browser_specific_settings.gecko.update_url`.

## Validate both distribution channels

```bash
make release-channels
```

This builds listed and self-distributed Firefox variants, verifies that their
version and extension ID match, verifies the `update_url` channel boundary,
checks required `websiteContent`, optional BYOK `authenticationInfo`, and the
absence of telemetry categories, then runs Mozilla’s `web-ext lint` against the
listed build.
