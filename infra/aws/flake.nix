# Pinned toolchain for the policy gates. One definition, used identically by
# the pre-commit hook, `scripts/gate.sh`, and the Forgejo runner — so "it
# passed locally" and "it passed in CI" mean the same thing.
#
# Terraform (not OpenTofu) per ADR-001 §2; it is BSL, hence `allowUnfree`.
# Setting it here rather than expecting the caller's nixpkgs config keeps the
# shell reproducible for anyone who clones this repo.
#
# Checkov is NOT taken from nixpkgs: the current build fails its runtime
# dependency check (`aiohttp<3.14.0,>=3.8.0 not satisfied by version 3.14.1`).
# It is installed by `uv` from PyPI at the version pinned in
# `policy/versions.env` instead — see scripts/lib/checkov.sh for the reason
# this is still deterministic.
{
  description = "Policy-as-code gates for Proso's AWS Terraform";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = {
    self,
    nixpkgs,
  }: let
    systems = ["x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin"];
    forAllSystems = f:
      nixpkgs.lib.genAttrs systems (system:
        f (import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        }));
  in {
    devShells = forAllSystems (pkgs: {
      default = pkgs.mkShell {
        name = "infra-aws-policy";
        packages = with pkgs; [
          terraform # >= 1.11 for `use_lockfile` (ADR-001 §2.4)
          tflint
          tflint-plugins.tflint-ruleset-aws
          trivy
          uv # installs the pinned checkov; see note above
          lefthook # pre-commit driver, matching the Proso repo
          awscli2
          jq
          curl # future public-issuer OIDC wrapper; see scripts/ci-assume-role.sh
          git
        ];

        TFLINT_AWS_PLUGIN = "${pkgs.tflint-plugins.tflint-ruleset-aws}/tflint-ruleset-aws";
        TFLINT_AWS_PLUGIN_VERSION = pkgs.tflint-plugins.tflint-ruleset-aws.version;
      };
    });

    formatter = forAllSystems (pkgs: pkgs.alejandra);
  };
}
