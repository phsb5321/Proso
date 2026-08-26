#!/usr/bin/env bash
# Prove the activated Identity Center path end to end without mutating AWS.
#
# Prerequisite: Pedro has opened the Identity Center invitation, set the
# password, and registered MFA. The two profiles are non-secret metadata and
# may be prepared before activation; see stacks/05-org-structure/README.md.
set -euo pipefail

readonly WORKLOAD_ACCOUNT="699475944323"
readonly MANAGEMENT_ACCOUNT="851725512267"
readonly SSO_PROFILE="${PROSO_SSO_PROFILE:-proso-sso}"
readonly MANAGEMENT_PROFILE="${PROSO_MANAGEMENT_PROFILE:-management-ops}"
readonly DEPLOY_ROLE="arn:aws:iam::${WORKLOAD_ACCOUNT}:role/proso-deploy"
readonly SSO_INSTANCE="arn:aws:sso:::instance/ssoins-7223fcff316331ec"
readonly INFRA_PERMISSION_SET="arn:aws:sso:::permissionSet/ssoins-7223fcff316331ec/ps-2670fee9caf657ad"
readonly MANAGEMENT_PERMISSION_SET="arn:aws:sso:::permissionSet/ssoins-7223fcff316331ec/ps-70926e4ddc9365f7"
readonly BREAKGLASS_PERMISSION_SET="arn:aws:sso:::permissionSet/ssoins-7223fcff316331ec/ps-cd142da24ace6f76"
readonly PLATFORM_GROUP="4468f408-8031-70b0-fd16-fea17c6d660a"
REPO_ROOT="$(git rev-parse --show-toplevel)"
readonly REPO_ROOT
readonly INFRA_ROOT="${REPO_ROOT}/infra/aws"
readonly SITE_PROOF_DIR="${REPO_ROOT}/.artifacts/sso-proof-site"

for tool in aws jq terraform git; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 127; }
done

check_profile_config() {
  local profile="$1" account="$2" role="$3"
  [[ "$(aws configure get sso_start_url --profile "$profile")" == "https://d-9067ca0796.awsapps.com/start/" ]]
  [[ "$(aws configure get sso_region --profile "$profile")" == "us-east-1" ]]
  [[ "$(aws configure get sso_account_id --profile "$profile")" == "$account" ]]
  [[ "$(aws configure get sso_role_name --profile "$profile")" == "$role" ]]
}

check_live_permission_sets() {
  local live_policy role_arn decision assignments trust old_state_rc

  [[ "$(aws --profile PERSONAL_ROOT sso-admin describe-permission-set \
    --instance-arn "$SSO_INSTANCE" --permission-set-arn "$INFRA_PERMISSION_SET" \
    --query '[PermissionSet.Name,PermissionSet.SessionDuration]' --output text)" == $'ProsoInfraDeploy\tPT4H' ]]
  [[ "$(aws --profile PERSONAL_ROOT sso-admin describe-permission-set \
    --instance-arn "$SSO_INSTANCE" --permission-set-arn "$MANAGEMENT_PERMISSION_SET" \
    --query '[PermissionSet.Name,PermissionSet.SessionDuration]' --output text)" == $'ManagementOps\tPT4H' ]]
  [[ "$(aws --profile PERSONAL_ROOT sso-admin describe-permission-set \
    --instance-arn "$SSO_INSTANCE" --permission-set-arn "$BREAKGLASS_PERMISSION_SET" \
    --query '[PermissionSet.Name,PermissionSet.SessionDuration]' --output text)" == $'WorkloadBreakGlass\tPT2H' ]]

  live_policy="$(aws --profile PERSONAL_ROOT sso-admin get-inline-policy-for-permission-set \
    --instance-arn "$SSO_INSTANCE" --permission-set-arn "$INFRA_PERMISSION_SET" \
    --query InlinePolicy --output text)"
  jq -e --arg role "$DEPLOY_ROLE" '
    .Statement | any(.Sid == "AssumeTheDeployRole" and .Action == "sts:AssumeRole" and .Resource == $role) and
    any(.Sid == "ReadWriteTerraformState" and .Resource == "arn:aws:s3:::proso-tfstate-699475944323/*") and
    any(.Sid == "DenyForeignAccountState" and .Effect == "Deny" and
      (.Action | index("s3:GetObjectVersion")) != null and
      (.Action | index("s3:DeleteObjectVersion")) != null and
      .Resource == "arn:aws:s3:::proso-tfstate-699475944323/05-org-structure/*") and
    any(.Sid == "UseTheStateKeyThroughS3Only" and
      .Condition.StringEquals["kms:ViaService"] == "s3.us-east-1.amazonaws.com" and
      .Condition["ForAnyValue:StringEquals"]["kms:ResourceAliases"] == "alias/proso-tfstate-699475944323")
  ' <<<"$live_policy" >/dev/null

  live_policy="$(aws --profile PERSONAL_ROOT sso-admin get-inline-policy-for-permission-set \
    --instance-arn "$SSO_INSTANCE" --permission-set-arn "$MANAGEMENT_PERMISSION_SET" \
    --query InlinePolicy --output text)"
  diff -u \
    <(jq -S . "$INFRA_ROOT/policies/management-ops-inline.json") \
    <(jq -S . <<<"$live_policy") >/dev/null

  aws --profile PERSONAL_ROOT sso-admin list-managed-policies-in-permission-set \
    --instance-arn "$SSO_INSTANCE" --permission-set-arn "$BREAKGLASS_PERMISSION_SET" \
    --output json | jq -e '
      [.AttachedManagedPolicies[].Arn] == ["arn:aws:iam::aws:policy/AdministratorAccess"]
    ' >/dev/null

  for spec in \
    "$INFRA_PERMISSION_SET $WORKLOAD_ACCOUNT" \
    "$MANAGEMENT_PERMISSION_SET $MANAGEMENT_ACCOUNT" \
    "$BREAKGLASS_PERMISSION_SET $WORKLOAD_ACCOUNT"; do
    read -r permission_set account <<<"$spec"
    assignments="$(aws --profile PERSONAL_ROOT sso-admin list-account-assignments \
      --instance-arn "$SSO_INSTANCE" --permission-set-arn "$permission_set" \
      --account-id "$account" --output json)"
    jq -e --arg group "$PLATFORM_GROUP" --arg account "$account" '
      [.AccountAssignments[] | select(.PrincipalType == "GROUP" and
        .PrincipalId == $group and .AccountId == $account)] | length == 1
    ' <<<"$assignments" >/dev/null
  done

  role_arn="$(aws --profile sandbox iam list-roles \
    --path-prefix /aws-reserved/sso.amazonaws.com/ \
    --query "Roles[?starts_with(RoleName, 'AWSReservedSSO_ProsoInfraDeploy_')].Arn | [0]" \
    --output text)"
  [[ "$role_arn" == arn:aws:iam::699475944323:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_ProsoInfraDeploy_* ]]

  decision="$(aws --profile sandbox iam simulate-principal-policy \
    --policy-source-arn "$role_arn" --action-names sts:AssumeRole \
    --resource-arns "$DEPLOY_ROLE" --query 'EvaluationResults[0].EvalDecision' --output text)"
  [[ "$decision" == "allowed" ]]
  decision="$(aws --profile sandbox iam simulate-principal-policy \
    --policy-source-arn "$role_arn" --action-names s3:GetObject \
    --resource-arns arn:aws:s3:::proso-tfstate-699475944323/00-bootstrap/terraform.tfstate \
    --query 'EvaluationResults[0].EvalDecision' --output text)"
  [[ "$decision" == "allowed" ]]
  decision="$(aws --profile sandbox iam simulate-principal-policy \
    --policy-source-arn "$role_arn" --action-names s3:GetObject \
    --resource-arns arn:aws:s3:::sandbox-cloudtrail-699475944323/AWSLogs/probe \
    --query 'EvaluationResults[0].EvalDecision' --output text)"
  [[ "$decision" == "implicitDeny" ]]
  decision="$(aws --profile sandbox iam simulate-principal-policy \
    --policy-source-arn "$role_arn" --action-names s3:GetObject \
    --resource-arns arn:aws:s3:::proso-tfstate-699475944323/05-org-structure/terraform.tfstate \
    --query 'EvaluationResults[0].EvalDecision' --output text)"
  [[ "$decision" == "explicitDeny" ]]
  decision="$(aws --profile sandbox iam simulate-principal-policy \
    --policy-source-arn arn:aws:iam::699475944323:role/proso-deploy \
    --action-names s3:GetObject \
    --resource-arns arn:aws:s3:::proso-tfstate-699475944323/05-org-structure/terraform.tfstate \
    --query 'EvaluationResults[0].EvalDecision' --output text)"
  [[ "$decision" == "explicitDeny" ]]

  trust="$(aws --profile sandbox iam get-role --role-name proso-deploy \
    --query Role.AssumeRolePolicyDocument --output json)"
  jq -e '
    .Statement | any(.Sid == "TrustedIdentityCenterPermissionSets" and
      .Condition.ArnLike["aws:PrincipalArn"] ==
      "arn:aws:iam::699475944323:role/aws-reserved/sso.amazonaws.com/*AWSReservedSSO_ProsoInfraDeploy_*")
  ' <<<"$trust" >/dev/null

  aws --profile PERSONAL_ROOT s3api head-object \
    --bucket proso-management-tfstate-851725512267 \
    --key 05-org-structure/terraform.tfstate --output json | jq -e '
      .ServerSideEncryption == "aws:kms" and
      (.SSEKMSKeyId | startswith("arn:aws:kms:us-east-1:851725512267:key/"))
    ' >/dev/null
  aws --profile sandbox s3api get-bucket-policy \
    --bucket proso-tfstate-699475944323 --query Policy --output text | jq -e '
      .Statement | any(.Sid == "DenySealedStateObjects0" and
        .Principal == "*" and
        (.Action | index("s3:GetObjectVersion")) != null and
        (.Action | index("s3:DeleteObjectVersion")) != null and
        .Resource == "arn:aws:s3:::proso-tfstate-699475944323/05-org-structure/*")
    ' >/dev/null
  set +e
  aws --profile sandbox s3api head-object --bucket proso-tfstate-699475944323 \
    --key 05-org-structure/terraform.tfstate >/dev/null 2>&1
  old_state_rc=$?
  set -e
  ((old_state_rc != 0))

  echo 'PERMISSION SET POLICY PASS — live policies, assignments, simulator, deploy trust, and state-account boundaries match.'
}

case "${1:-}" in
  --check)
    check_profile_config "$SSO_PROFILE" "$WORKLOAD_ACCOUNT" ProsoInfraDeploy
    check_profile_config "$MANAGEMENT_PROFILE" "$MANAGEMENT_ACCOUNT" ManagementOps
    [[ -f "$INFRA_ROOT/stacks/00-bootstrap/sandbox.s3.tfbackend" ]]
    [[ -f "$INFRA_ROOT/stacks/05-org-structure/management.s3.tfbackend" ]]
    [[ -f "$INFRA_ROOT/stacks/10-account-baseline/sandbox.s3.tfbackend" ]]
    [[ -f "$INFRA_ROOT/stacks/20-site/sandbox.s3.tfbackend" ]]
    check_live_permission_sets
    echo 'SSO PROOF READY — profiles, policies, assignments, trust, and workload backends are configured.'
    exit 0
    ;;
  '') ;;
  *) echo "usage: $0 [--check]" >&2; exit 2 ;;
esac

scratch="$(mktemp -d)"
cleanup() {
  rm -rf "$scratch" "$SITE_PROOF_DIR"
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE AWS_DEFAULT_PROFILE
}
trap cleanup EXIT INT TERM
chmod 700 "$scratch"

expect_identity() {
  local profile="$1" account="$2" role_pattern="$3" identity arn
  identity="$(aws --profile "$profile" sts get-caller-identity --output json)"
  [[ "$(jq -r .Account <<<"$identity")" == "$account" ]] || {
    echo "$profile resolved to the wrong account" >&2
    return 1
  }
  arn="$(jq -r .Arn <<<"$identity")"
  [[ "$arn" =~ $role_pattern ]] || {
    echo "$profile resolved to unexpected ARN: $arn" >&2
    return 1
  }
  echo "$profile -> $arn"
}

plan_clean() {
  local stack="$1" backend="$2" tfvars="$3" output rc
  terraform -chdir="$stack" init -reconfigure -input=false -no-color \
    -backend-config="$backend" >/dev/null
  set +e
  output="$(terraform -chdir="$stack" plan -detailed-exitcode -input=false \
    -lock=false -no-color -var-file="$tfvars" 2>&1)"
  rc=$?
  set -e
  if ((rc != 0)); then
    printf '%s\n' "$output" >&2
    echo "expected a clean plan for $stack, got exit $rc" >&2
    return 1
  fi
  grep -q 'No changes. Your infrastructure matches the configuration.' <<<"$output" || {
    printf '%s\n' "$output" >&2
    echo "plan exited 0 without Terraform's no-change receipt: $stack" >&2
    return 1
  }
  echo "PASS plan $(basename "$stack"): no changes"
}

# The profiles can exist before activation; login is the human/MFA boundary.
aws sso login --profile "$SSO_PROFILE"
expect_identity "$SSO_PROFILE" "$WORKLOAD_ACCOUNT" \
  '^arn:aws:sts::699475944323:assumed-role/AWSReservedSSO_ProsoInfraDeploy_[A-Za-z0-9]+/'

# ProsoInfraDeploy is an entry permission set: it reaches state directly and
# assumes the least-privilege role that owns all workload Terraform actions.
aws --profile "$SSO_PROFILE" sts assume-role \
  --role-arn "$DEPLOY_ROLE" \
  --role-session-name proso-sso-proof \
  --duration-seconds 3600 >"$scratch/deploy-session.json"
AWS_ACCESS_KEY_ID="$(jq -r .Credentials.AccessKeyId "$scratch/deploy-session.json")"
AWS_SECRET_ACCESS_KEY="$(jq -r .Credentials.SecretAccessKey "$scratch/deploy-session.json")"
AWS_SESSION_TOKEN="$(jq -r .Credentials.SessionToken "$scratch/deploy-session.json")"
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
unset AWS_PROFILE AWS_DEFAULT_PROFILE

identity="$(aws sts get-caller-identity --output json)"
[[ "$(jq -r .Account <<<"$identity")" == "$WORKLOAD_ACCOUNT" ]]
[[ "$(jq -r .Arn <<<"$identity")" =~ ^arn:aws:sts::699475944323:assumed-role/proso-deploy/ ]]
echo "deploy role -> $(jq -r .Arn <<<"$identity")"

cp "$INFRA_ROOT/stacks/00-bootstrap/example.tfvars" "$scratch/00.tfvars"
cp "$INFRA_ROOT/stacks/10-account-baseline/example.tfvars" "$scratch/10.tfvars"
sed -i 's/aws_profile = "sandbox"/aws_profile = null/' "$scratch/10.tfvars"
grep -q '^aws_profile = null$' "$scratch/10.tfvars"

"$INFRA_ROOT/scripts/deploy-site.sh" assemble \
  --repo "$REPO_ROOT" --out "$SITE_PROOF_DIR" >/dev/null
cp "$INFRA_ROOT/stacks/20-site/example.tfvars" "$scratch/20.tfvars"
sed -i \
  -e 's|assume_role_arn = "arn:aws:iam::699475944323:role/proso-deploy"|assume_role_arn = null|' \
  -e 's|site_source_dir = "../../../../.artifacts/site"|site_source_dir = "../../../../.artifacts/sso-proof-site"|' \
  "$scratch/20.tfvars"
grep -q '^assume_role_arn = null$' "$scratch/20.tfvars"

plan_clean "$INFRA_ROOT/stacks/00-bootstrap" \
  "$INFRA_ROOT/stacks/00-bootstrap/sandbox.s3.tfbackend" "$scratch/00.tfvars"
plan_clean "$INFRA_ROOT/stacks/10-account-baseline" \
  "$INFRA_ROOT/stacks/10-account-baseline/sandbox.s3.tfbackend" "$scratch/10.tfvars"
plan_clean "$INFRA_ROOT/stacks/20-site" \
  "$INFRA_ROOT/stacks/20-site/sandbox.s3.tfbackend" "$scratch/20.tfvars"

unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
aws sso login --profile "$MANAGEMENT_PROFILE"
expect_identity "$MANAGEMENT_PROFILE" "$MANAGEMENT_ACCOUNT" \
  '^arn:aws:sts::851725512267:assumed-role/AWSReservedSSO_ManagementOps_[A-Za-z0-9]+/'
aws --profile "$MANAGEMENT_PROFILE" organizations list-roots >/dev/null
aws --profile "$MANAGEMENT_PROFILE" iam get-account-summary >/dev/null
aws --profile "$MANAGEMENT_PROFILE" s3api get-bucket-versioning \
  --bucket nixos-server-backups >/dev/null

echo 'SSO PATH PASS — permission sets, deploy-role hop, state backends, and stacks 00/10/20 are proven.'
