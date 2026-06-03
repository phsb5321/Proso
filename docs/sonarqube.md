# SonarQube Integration

Static analysis + quality gate for the Proso monorepo. Runs against the
**self-hosted** SonarQube instance (Community Edition) — not SonarCloud.

- **Server:** `https://sonarqube.home301server.com.br`
- **Project key:** `proso`
- **Workflow:** [`.github/workflows/sonar.yml`](../.github/workflows/sonar.yml)
- **Scanner config:** [`sonar-project.properties`](../sonar-project.properties)

## Required repository configuration (one-time, manual)

The Sonar job is **skipped unless `SONAR_HOST_URL` is set as a repo variable**
(`if: vars.SONAR_HOST_URL != ''`), so the workflow stays green on forks and
before setup. To actually enable analysis:

1. **Create the project** in the Sonar UI — Administration → Projects → Create,
   project key `proso`, display name `Proso`.
2. **Mint a token** — My Account → Security → Generate. Type
   **`PROJECT_ANALYSIS_TOKEN`** (never a user token), scoped to the single
   `proso` project, name `gh-actions-proso`, 90-day expiry. Shown once.
3. **Set the repo variable** (Settings → Secrets and variables → Actions →
   **Variables** tab):
   - `SONAR_HOST_URL` = `https://sonarqube.home301server.com.br`
     — this is a non-secret **variable**, read via `${{ vars.SONAR_HOST_URL }}`.
4. **Set the repo secret** (same screen, **Secrets** tab):
   - `SONAR_TOKEN` = the token from step 2.
5. **Verify:** `https://sonarqube.home301server.com.br/dashboard?id=proso`.

Token rotation is quarterly (90-day expiry); regenerate, update `SONAR_TOKEN`,
re-run, then revoke the old token.

## How the workflow works

Triggered on push/PR to `main`. Steps:

1. `actions/checkout` with `fetch-depth: 0` — full history is required for
   SCM blame / new-code attribution.
2. Install deps, then run extension + server tests with `--coverageReporters=lcov`
   (both `continue-on-error: true` — a failing test still lets analysis run; the
   dedicated test workflows are the hard gate for test failures).
3. `SonarSource/sonarqube-scan-action` — reads `sonar-project.properties`,
   uploads coverage via the `sonar.javascript.lcov.reportPaths` declared there.
4. `SonarSource/sonarqube-quality-gate-action` — polls the gate and fails the
   check if it is red.

Coverage report paths (`sonar-project.properties`) must match where Jest writes
lcov: `packages/<pkg>/coverage/lcov.info`. **If the lcov file is missing, Sonar
silently records 0 % coverage** — which then trips the new-code coverage gate.
Keep the paths and the Jest `coverageDirectory` in sync.

`dependabot[bot]` runs are skipped (`if:` guard) rather than wired with a
dependabot-scoped token — Proso has no dependabot-scope `SONAR_TOKEN`, and
skipping avoids the empty-token 401 that would otherwise block Dependabot PRs.

## Quality gate

Configure in the Sonar UI (Quality Gates → attach to `proso`). Target, matching
[`codecov.yml`](../codecov.yml):

- New-code coverage ≥ **60 %** (patch target 80 % in Codecov)
- New bugs / vulnerabilities = **0**
- New code smells ≤ 10
- Duplication on new code within "Sonar way" defaults

## Conventions & gotchas

- **Action pins:** every `uses:` is pinned to a full commit SHA with a trailing
  `# vX.Y.Z` comment (Dependabot needs the comment to bump it). Current pins:
  scan-action `v8.1.0`, quality-gate-action `v1.2.0`. Never strip the comment.
- **Project key:** Pedro's fleet convention is `<org>_<repo>` (e.g.
  `phsb5321_proso`). Proso currently uses the bare `proso` key. Renaming the key
  orphans existing analysis history and requires re-creating the project + token
  in the UI, so it is left as-is unless deliberately migrated.
- `sonar.organization` is a SonarCloud field and is ignored by the self-hosted
  Community Edition; it is harmless in `sonar-project.properties`.
- Badges (`api/project_badges/measure`) require the project to be public in Sonar
  (Administration → Permissions → grant "Anyone" Browse) or they return 401.
