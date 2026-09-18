# Contributing to Proso

Bug reports, documentation fixes, translations, accessibility feedback, and code
contributions are welcome. You do not need to start with a large feature.

Please read the [Code of Conduct](CODE_OF_CONDUCT.md). For setup questions, see
[SUPPORT.md](SUPPORT.md).

## Report a bug or suggest a feature

Search [existing issues](https://github.com/phsb5321/Proso/issues) first. Include
what you were trying to do, what happened, and what you expected. For bugs, include
Firefox and Proso versions, installation source, reproduction steps, and whether
you use BYOK, a synthesis host, or managed credits.

Never post API keys, license keys, private page content, or unredacted logs.

## Development setup

Install Node.js 20.x, pnpm 10.30.3, GNU Make, and Firefox 109 or later.
Fork and clone the repository, then create an isolated worktree:

```bash
gh repo fork phsb5321/Proso --clone
cd Proso
git fetch origin main
git worktree add ../Proso-NNN-your-feature-name -b NNN-your-feature-name origin/main
cd ../Proso-NNN-your-feature-name
pnpm install --frozen-lockfile
make help
pnpm --filter @proso/extension build:firefox
```

Replace `NNN-your-feature-name` with your numbered feature branch name.
In Firefox, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary
Add-on**, and select `packages/extension/.output/firefox-mv2/manifest.json`.

## Checks and pull requests

Use `make verify` for the fast deterministic checks. Run the checks relevant to
your change from [the delivery harness](docs/agent-delivery-harness.md).
User-visible changes need the [user-gate workflow](.agents/skills/proso-user-gate/SKILL.md).
On NixOS, Playwright runs in Docker; see [the browser testing guide](docs/e2e-nixos.md).

Keep each PR focused, explain the user-visible result, record checks and any
limitations, and update the affected docs. Target `main` and complete the PR template.
Use Conventional Commits, for example `fix(popup): clarify provider setup`.

The workspace contains `packages/extension`, `packages/server`, `packages/shared`,
and `packages/site`. TypeScript is strict, Biome handles formatting, and domain
logic uses Result values rather than thrown exceptions. See [AGENTS.md](AGENTS.md)
for the full code and architecture conventions.

## Licensing status

The [README License section](README.md#license) records unresolved licensing
metadata. The existing contributor terms below are reproduced unchanged pending
owner reconciliation; they should be read alongside that warning.

## Contributor License Agreement (CLA)

By submitting a pull request, you agree to the following terms:

1. **License Grant**: You grant Proso a perpetual, worldwide, non-exclusive,
   royalty-free license to use, reproduce, modify, and distribute your contribution.

2. **Relicensing Rights**: You grant Proso the right to relicense your contribution
   under commercial license terms for enterprise customers.

3. **Original Work**: You represent that your contribution is your original work
   and you have the right to grant these permissions.

4. **Open Source Commitment**: The open source version of Proso will always
   remain available under AGPL-3.0.

