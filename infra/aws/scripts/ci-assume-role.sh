#!/usr/bin/env bash
#
# Mint an Actions OIDC token from a publicly verifiable issuer, assume the
# deploy role, verify the account, then exec the given command.
#
#   scripts/ci-assume-role.sh scripts/drift-check.sh
#
# ADR-001 §2 puts long-lived credentials at the top of the list to avoid, and
# §4.3 reserves root for a single operation. This script is where both become
# mechanical rather than aspirational:
#
#   1. Ambient credentials are SCRUBBED before anything else. The runner host
#      has a `PERSONAL_ROOT` profile holding literal AWS root keys
#      (`arn:aws:iam::851725512267:root`). Without this, the SDK's default
#      chain would happily fall back to it and the job would run as root
#      against the management account — succeeding silently, which is the worst
#      possible failure mode. `AWS_CONFIG_FILE=/dev/null` closes the profile
#      path as well as the environment one.
#
#   2. The identity is VERIFIED, not assumed. A trust policy pointing at the
#      wrong account produces a working plan against the wrong infrastructure,
#      and nothing in a plan's output announces which account it ran in.
#
# Prepared for a future keyless live-plan workflow. The active Forgejo workflow
# does not invoke it because Forgejo's issuer is Tailscale-only and AWS cannot
# validate it; see docs/forgejo-oidc-federation.md. Keeping the credential
# handling here makes it reviewable as shell instead of YAML-quoted shell.

set -euo pipefail

EXPECTED_ACCOUNT="699475944323" # Sandbox-Account (ADR-001 §3)

if (($# == 0)); then
  echo "usage: $0 <command> [args...]" >&2
  exit 2
fi

for v in AWS_ROLE_ARN ACTIONS_ID_TOKEN_REQUEST_URL ACTIONS_ID_TOKEN_REQUEST_TOKEN RUNNER_TEMP; do
  if [[ -z "${!v:-}" ]]; then
    echo "$v is unset." >&2
    echo "AWS_ROLE_ARN comes from the repo variable AWS_ROLE_TO_ASSUME; the" >&2
    echo "ACTIONS_ID_TOKEN_* pair requires 'permissions: id-token: write' on" >&2
    echo "the job. Failing closed rather than falling back to any other" >&2
    echo "credential on this runner." >&2
    exit 1
  fi
done

# (1) scrub — see the header. Order matters: nothing below may run with these set.
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
unset AWS_PROFILE AWS_DEFAULT_PROFILE
export AWS_CONFIG_FILE=/dev/null
export AWS_SHARED_CREDENTIALS_FILE=/dev/null
export AWS_EC2_METADATA_DISABLED=true
export AWS_REGION="${AWS_REGION:-us-east-1}"

umask 077
TOKEN_FILE="$RUNNER_TEMP/aws-oidc-token"
trap 'rm -f "$TOKEN_FILE"' EXIT

# `jq -e` so an error payload (which is valid JSON without .value) fails here
# rather than writing the string "null" into the token file.
curl -fsS \
  -H "Authorization: Bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
  "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=sts.amazonaws.com" |
  jq -er '.value' >"$TOKEN_FILE"

export AWS_WEB_IDENTITY_TOKEN_FILE="$TOKEN_FILE"

# (2) verify
account="$(aws sts get-caller-identity --query Account --output text)"
if [[ "$account" != "$EXPECTED_ACCOUNT" ]]; then
  echo "Refusing to continue: assumed identity is in account $account," >&2
  echo "expected Sandbox-Account $EXPECTED_ACCOUNT. Check the role's trust" >&2
  echo "policy and the AWS_ROLE_TO_ASSUME variable." >&2
  exit 1
fi

arn="$(aws sts get-caller-identity --query Arn --output text)"
echo "Authenticated to account $account as $arn (OIDC, no long-lived key)."

exec "$@"
