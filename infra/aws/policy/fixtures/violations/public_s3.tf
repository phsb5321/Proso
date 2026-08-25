# The gate's FAIL fixture — the deliberately insecure resource from the brief's
# definition of done. It is committed, not typed by hand at demo time, so the
# red half of the gate is re-provable on every CI run rather than once.
#
# `scripts/gate.sh` SKIPS this directory (see `policy/versions.env`
# FIXTURE_VIOLATIONS_DIR); `scripts/falsify-gates.sh` points the scanners at it
# and fails if they come back clean. Deleting or "fixing" this file therefore
# breaks the falsification test — which is the intended alarm, not a bug.
#
# Every violation below is annotated with the check that must catch it. If a
# scanner upgrade renames or drops a check, falsify-gates.sh goes red and the
# annotation tells the next reader what changed.

terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

# CKV_AWS_20  — S3 bucket allows public READ
# CKV_AWS_21  — versioning disabled
# CKV_AWS_18  — access logging disabled
# CKV_AWS_145 — not encrypted with a KMS CMK
# CKV_AWS_53..56 — no public access block
# AVD-AWS-0086..0094 (Trivy) — the same family
resource "aws_s3_bucket" "public_plant" {
  bucket = "proso-policy-gate-plant-do-not-create"
}

resource "aws_s3_bucket_public_access_block" "public_plant" {
  bucket = aws_s3_bucket.public_plant.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_acl" "public_plant" {
  bucket = aws_s3_bucket.public_plant.id
  acl    = "public-read"
}

# Anonymous world-readable bucket policy — the canonical "leaked bucket".
resource "aws_s3_bucket_policy" "public_plant" {
  bucket = aws_s3_bucket.public_plant.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicReadGetObject"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.public_plant.arn}/*"
    }]
  })
}
