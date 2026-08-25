#!/usr/bin/env bash
# Create the `pedro-ops` operator identity in the management account.
#
# WHY THIS EXISTS, AND WHY IT USES ROOT
# -------------------------------------
# ADR-001 §4.3 says root is for one operation and never for routine work. That
# rule assumes a non-root principal already exists. On 25/08/2026 none did:
#
#   $ AWS_PROFILE=PERSONAL_ROOT aws sts assume-role \
#       --role-arn arn:aws:iam::699475944323:role/OrganizationAccountAccessRole ...
#   An error occurred (AccessDenied) when calling the AssumeRole operation:
#   Roles may not be assumed by root accounts.
#
# Root cannot reach Sandbox-Account at all. The only two IAM users with any
# console/admin standing (`admin`, `admin-user`) have no access keys, and the
# five service users are scoped to S3/SES. So there was no way to run a single
# Terraform plan without first creating a non-root principal — and creating an
# IAM principal requires root exactly once.
#
# This script is therefore the bootstrap that ENDS routine root use, not an
# instance of it. It is idempotent-ish (fails loudly if the user exists) and
# reversible in two commands, printed at the end.
#
# The generated secret is written to Bitwarden via rbw and to ~/.aws/credentials
# (mode 0600). It never touches the repo or Terraform state (ADR-001 §4.5).

set -euo pipefail

MGMT_ACCOUNT="851725512267"
SANDBOX_ACCOUNT="699475944323"
USER_NAME="pedro-ops"
POLICY_NAME="pedro-ops-baseline"
POLICY_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/policies/pedro-ops-baseline.json"
BW_ENTRY="api/aws-pedro-ops"

export AWS_PROFILE="${AWS_PROFILE:-PERSONAL_ROOT}"

caller_arn=$(aws sts get-caller-identity --query Arn --output text)
if [[ "$caller_arn" != "arn:aws:iam::${MGMT_ACCOUNT}:root" ]]; then
  echo "refusing: expected management-account root, got ${caller_arn}" >&2
  exit 1
fi
echo "caller: ${caller_arn} (the one sanctioned root operation)"

if aws iam get-user --user-name "$USER_NAME" >/dev/null 2>&1; then
  echo "refusing: IAM user ${USER_NAME} already exists — nothing to bootstrap" >&2
  exit 1
fi

aws iam create-user \
  --user-name "$USER_NAME" \
  --tags Key=ManagedBy,Value=infra-aws-004 Key=Purpose,Value=replaces-routine-root-use \
  --output json

aws iam put-user-policy \
  --user-name "$USER_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document "file://${POLICY_FILE}"

key_json=$(aws iam create-access-key --user-name "$USER_NAME" --output json)
key_id=$(jq -r '.AccessKey.AccessKeyId' <<<"$key_json")
key_secret=$(jq -r '.AccessKey.SecretAccessKey' <<<"$key_json")

# Bitwarden first — the durable copy must exist before anything else. `rbw add`
# only accepts input through $EDITOR, so hand it a one-shot "editor" that copies
# a 0600 scratch file over the temp file rbw opens.
rbw unlocked
secret_file=$(mktemp)
chmod 600 "$secret_file"
trap 'rm -f "$secret_file"' EXIT
printf '%s\naccess_key_id: %s\ninfra/aws pedro-ops — replaces routine root use.\nAssumes OrganizationAccountAccessRole in %s. Created %s.\n' \
  "$key_secret" "$key_id" "$SANDBOX_ACCOUNT" "$(date -I)" >"$secret_file"
EDITOR="cp $secret_file" rbw add --folder api "$BW_ENTRY" "$key_id"
rm -f "$secret_file"
trap - EXIT

umask 077
aws --profile pedro-ops configure set aws_access_key_id "$key_id"
aws --profile pedro-ops configure set aws_secret_access_key "$key_secret"
aws --profile pedro-ops configure set region us-east-1
aws --profile pedro-ops configure set output json

# Chained profile: pedro-ops -> OrganizationAccountAccessRole in Sandbox.
aws --profile sandbox configure set role_arn "arn:aws:iam::${SANDBOX_ACCOUNT}:role/OrganizationAccountAccessRole"
aws --profile sandbox configure set source_profile pedro-ops
aws --profile sandbox configure set region us-east-1
aws --profile sandbox configure set output json

unset key_secret key_json

cat <<EOF

created: ${key_id} for ${USER_NAME}
profiles: pedro-ops (management, read-mostly), sandbox (assumes into ${SANDBOX_ACCOUNT})

ROLLBACK (complete, no residue):
  aws --profile PERSONAL_ROOT iam delete-access-key --user-name ${USER_NAME} --access-key-id ${key_id}
  aws --profile PERSONAL_ROOT iam delete-user-policy --user-name ${USER_NAME} --policy-name ${POLICY_NAME}
  aws --profile PERSONAL_ROOT iam delete-user --user-name ${USER_NAME}
EOF
