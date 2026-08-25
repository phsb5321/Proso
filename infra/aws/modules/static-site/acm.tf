# CloudFront can only attach a certificate from us-east-1, whatever region the
# rest of the stack lives in. That is a hard AWS constraint, so it is a
# precondition rather than a README sentence.
resource "aws_acm_certificate" "this" {
  domain_name               = var.domain_names[0]
  subject_alternative_names = slice(var.domain_names, 1, length(var.domain_names))
  validation_method         = "DNS"

  tags = var.tags

  lifecycle {
    create_before_destroy = true

    precondition {
      condition     = data.aws_region.current.region == "us-east-1"
      error_message = "CloudFront requires its ACM certificate in us-east-1; this module was called with region ${data.aws_region.current.region}."
    }
  }
}
