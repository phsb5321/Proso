# stacks/15-member-account

Creates the `proso-prod` member account inside the `Workloads` OU, and gives it
a break-glass permission set.

**GATED — ADR-001 §5. Plan freely; do not apply without Pedro's explicit,
in-turn go.** Planned clean on 25/08/2026; not applied.

## Why it is gated

- **It uses root once.** Organizations account creation is the single operation
  ADR-001 §4.3 reserves for the root user.
- **It is close to irreversible.** Closing an AWS account starts a 90-day
  suspension before deletion. The email address stays claimed throughout, and
  the account keeps counting against the organisation quota.
- **The email must be unique across all of AWS and stay deliverable** — it is
  the only recovery path for that account's root user. Proposal:
  `pedrobalbino+proso-prod@proton.me`.

## Two guards in the code

```hcl
close_on_deletion = false     # removing this from Terraform must never close the account
lifecycle {
  prevent_destroy = true      # `terraform destroy` fails at plan time
  ignore_changes  = [email, name, role_name, iam_user_access_to_billing]
}
```

`prevent_destroy` only fires once the resource is in state, so it cannot be
demonstrated before the account exists. The mechanism itself was verified
against a throwaway resource:

```
Error: Instance cannot be destroyed
Resource terraform_data.guarded has lifecycle.prevent_destroy set, but the
plan calls for this resource to be destroyed.
```

`ignore_changes` covers fields that can only be altered by signing in to the
member account itself — drift there is not this stack's business to correct.

## Inputs come from stack 05

```bash
cd ../05-org-structure && terraform output workloads_ou_id platform_admins_group_id
```

Passed as variables rather than a remote-state data source: ADR-001 §6 keeps one
state per stack with no cross-stack coupling.

## Plan

```bash
cp example.tfvars prod.tfvars   # gitignored
terraform init
terraform plan -var-file=prod.tfvars
# Plan: 4 to add, 0 to change, 0 to destroy.
```

## The permission set is break-glass, not the deploy path

`ProsoProdAdmin` is `AdministratorAccess` at `PT2H` — half the sandbox session
length, because it reaches production. Routine deploys must use the
least-privilege deploy role from `stacks/00-bootstrap`, assumed via OIDC (see
`docs/forgejo-oidc-federation.md`), not this.
