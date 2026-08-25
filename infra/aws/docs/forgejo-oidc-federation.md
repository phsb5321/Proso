# Can Forgejo Actions federate to AWS via OIDC?

**Date:** 25/08/2026 · **Question from** `docs/briefs/04-account-foundation.md` §4
**Short answer:** the feature exists and is live on Pedro's instance, but AWS
cannot use it, because the issuer is reachable only over Tailscale. The
recommended target is therefore **GitHub Actions OIDC**, which needs no static
key either — not a scoped IAM user with a key in sops.

---

## 1. Forgejo supports it — proven on the running instance

Forgejo documents OIDC ID tokens for Actions in both the current release and the
LTS line (`forgejo.org/docs/latest/user/actions/security-openid-connect/` and
`/docs/v15.0/...`). It is not a proposal: issue #5034 asked for it, PR #10481
implemented workload identity federation, and it shipped.

Not taken on faith — the endpoint answers on Pedro's own server
(`services.forgejo` on `Nix.Server`, `pkgs.forgejo-lts`):

```
$ ssh Nix.Server 'curl -s http://localhost:3001/api/actions/.well-known/openid-configuration'
{"issuer":"https://server.tailf59220.ts.net:13001/api/actions",
 "jwks_uri":"https://server.tailf59220.ts.net:13001/api/actions/.well-known/keys",
 "subject_types_supported":["public"],
 "response_types_supported":["id_token"],
 "id_token_signing_alg_values_supported":["RS256"],
 "scopes_supported":["openid"], ...}

$ ssh Nix.Server 'curl -s -o /dev/null -w "%{http_code}\n" \
    http://localhost:3001/api/actions/.well-known/keys'
200
```

The JWKS returns a real RS256 key. Token shape matches what AWS expects:

| Claim | Value |
|---|---|
| `iss` | `<instance URL>/api/actions` |
| `aud` | `<instance URL>/<repo owner>` by default; overridable per request |
| `sub` | `repo:<repository>:ref:<full git ref>`, or `repo:<repository>:pull_request` |
| extras | `repository`, `repository_owner`, `ref_protected`, `workflow_ref`, `run_id`, `actor`, … |

A workflow requests one exactly as on GitHub:

```bash
curl -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
     "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sts.amazonaws.com"
```

One sharp edge worth recording: **from Forgejo 16 the `[repository]` portion of
`sub` gains numeric ids** (`owner-123/repo-456`) for repositories whose Actions
were enabled after the upgrade. A trust policy that pins `sub` by name will
silently stop matching. Pin `repository_id`/`repository_owner_id` instead, which
are immutable across renames.

## 2. AWS cannot consume it here

Creating an IAM OIDC identity provider makes **AWS** fetch
`https://<issuer>/.well-known/openid-configuration` and then the JWKS, from the
public internet, at registration and again as keys roll. The issuer must
therefore be publicly resolvable and reachable.

Pedro's is not:

```
$ grep -n 'ROOT_URL' ~/NixOS/hosts/server/configuration.nix
425:        ROOT_URL = "https://server.tailf59220.ts.net:13001/";

$ ssh Nix.Server 'ss -ltn | grep 13001'
LISTEN 0 8192            100.65.250.82:13001   0.0.0.0:*      # tailnet address
LISTEN 0 8192 [fd7a:115c:a1e0::9437:fa52]:13001 [::]:*

$ dig +short server.tailf59220.ts.net @1.1.1.1
                                                # empty — no public record
```

And the workaround people reach for does not exist: Forgejo derives `iss` from
`ROOT_URL`, and AWS requires the provider URL it was registered with to equal
the token's `iss` exactly. Publishing *only* the discovery and JWKS documents at
some public hostname would produce tokens whose `iss` names the Tailscale URL —
AWS rejects them. Making this work means giving Forgejo a public `ROOT_URL`,
i.e. exposing the forge, which is a security decision of its own and well
outside this brief.

**Proven, not assumed: Forgejo Actions → AWS OIDC is blocked by network
topology, not by a missing feature.**

## 3. What to do instead

### Recommended: GitHub Actions OIDC

The canonical remotes are on GitHub — Forgejo mirrors *from* GitHub for local CI
(`modules/services/forgejo-mirror.nix`). So the AWS-touching workflow can simply
run on GitHub Actions, where OIDC is a first-class, publicly-issued token:

- Provider URL `https://token.actions.githubusercontent.com`, audience
  `sts.amazonaws.com`.
- A role trusted via `sts:AssumeRoleWithWebIdentity`, with the trust policy
  pinning `aud` **and** `sub` (e.g. `repo:phsb5321/proso:ref:refs/heads/main`).
  A trust policy that checks only `aud` is assumable by *any* GitHub repository.
- Result: **no static AWS credential anywhere** — not in Forgejo, not in sops,
  not in the repo.

Split of duties, which costs nothing: Forgejo keeps running fast local CI on the
tailnet (lint, build, `terraform test` — none of which needs AWS); the deploy
job, the only one that touches AWS, runs on GitHub Actions with OIDC. The
credential boundary lines up with the network boundary.

The concrete role and trust policy belong to the Bootstrap tab
(`stacks/00-bootstrap`, deploy role); this document is the decision that they
should be an OIDC role rather than a user.

### Fallback, only if the deploy job must run on the tailnet

A scoped IAM user, key in sops, is the narrowest option that works — and it is
strictly worse. If it is chosen:

- Scope it to exactly the deploy role's actions; never `AdministratorAccess`.
- `sops`-encrypted, delivered as a Forgejo secret; never in the repo.
- Rotate every 90 days, tracked as a recurring task.
- Prefer a role assumed *from* that user, so the long-lived credential grants
  nothing directly and the session is short.

### Not viable

Exposing Forgejo publicly purely to satisfy AWS's fetch. It enlarges the attack
surface of the forge that holds every repository, to avoid a credential that
GitHub Actions OIDC already removes for free.

## 4. Verdict

| Option | Static credential | Works today |
|---|---|---|
| Forgejo Actions OIDC → AWS | none | **no** — issuer is Tailscale-only |
| **GitHub Actions OIDC → AWS** | **none** | **yes** — recommended |
| Scoped IAM user, key in sops, on the Forgejo runner | one, rotated | yes — fallback |
| Public `ROOT_URL` for Forgejo | none | yes, at a security cost not worth paying |
