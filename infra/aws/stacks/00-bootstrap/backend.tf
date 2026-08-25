# Partial backend configuration: the per-account values live in *.s3.tfbackend
# so that the same stack can be initialised against Sandbox or, later, prod
# without editing tracked HCL.
#
#   terraform init -backend-config=sandbox.s3.tfbackend
#
# This file must be absent for the very first apply — the bucket it points at
# does not exist yet. The exact one-time sequence is in README.md.
terraform {
  backend "s3" {}
}
