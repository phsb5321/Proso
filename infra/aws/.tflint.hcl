# tflint covers CORRECTNESS — deprecated syntax, unused declarations, invalid
# instance types, malformed ARNs. It is deliberately separate from Trivy and
# Checkov, which cover SAFETY. A config can be perfectly secure and still be
# broken; ADR-001 §2 keeps the two concerns as two pipeline stages.

config {
  # `.terraform/modules` holds vendored copies of upstream modules. Linting
  # them reports findings nobody in this repo can fix.
  call_module_type = "local"
  force            = false
}

plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

plugin "aws" {
  enabled = true
  version = "0.48.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}
