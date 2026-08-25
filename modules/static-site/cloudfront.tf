data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_response_headers_policy" "security" {
  name = "Managed-SecurityHeadersPolicy"
}

# Origin Access Control, not the legacy Origin Access Identity: OAI cannot sign
# with SigV4 and is no longer the documented path for new distributions.
resource "aws_cloudfront_origin_access_control" "this" {
  name                              = "${var.name}-oac"
  description                       = "SigV4 access from the ${var.name} distribution to its private origin bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# checkov:skip=CKV_AWS_68:AWS WAF costs USD 5.00/month for the web ACL alone,
# 500x this stack's entire USD 0.01/month ceiling, to protect a bucket of static
# public files with no query processing and no origin compute.
# checkov:skip=CKV2_AWS_47:Same — the Log4j managed rule group requires the same
# paid web ACL, and there is no Java, no logging framework and no dynamic origin.
# checkov:skip=CKV_AWS_374:Geo restriction is deliberately none. proso.com.br is
# a public download site for a Firefox add-on; restricting it by country would
# break the product, not secure it.
resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.name} static site"
  default_root_object = var.default_root_object
  price_class         = var.price_class

  # Phase 1 serves on the *.cloudfront.net domain so the distribution can be
  # verified before DNS moves. Phase 2 adds the aliases.
  aliases = var.attach_custom_domain ? var.domain_names : []

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "s3-${aws_s3_bucket.site.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-${aws_s3_bucket.site.id}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = !var.attach_custom_domain
    acm_certificate_arn            = var.attach_custom_domain ? aws_acm_certificate.this.arn : null
    ssl_support_method             = var.attach_custom_domain ? "sni-only" : null
    minimum_protocol_version       = var.attach_custom_domain ? "TLSv1.2_2021" : null
  }

  tags = var.tags

  lifecycle {
    precondition {
      condition     = !var.attach_custom_domain || var.default_root_object != ""
      error_message = "A distribution serving a custom domain must define a default root object."
    }
  }
}

# --- standard logging v2 -----------------------------------------------------
# The legacy logging_config block writes with an ACL grant, which is impossible
# on a BucketOwnerEnforced bucket. Standard logging v2 delivers through the
# vended-log pipeline and needs no ACLs.

resource "aws_cloudwatch_log_delivery_source" "cloudfront" {
  name         = "${var.name}-cf-access-logs"
  log_type     = "ACCESS_LOGS"
  resource_arn = aws_cloudfront_distribution.this.arn
}

resource "aws_cloudwatch_log_delivery_destination" "cloudfront" {
  name          = "${var.name}-cf-access-logs-s3"
  output_format = "parquet"

  delivery_destination_configuration {
    destination_resource_arn = aws_s3_bucket.logs.arn
  }
}

resource "aws_cloudwatch_log_delivery" "cloudfront" {
  delivery_source_name     = aws_cloudwatch_log_delivery_source.cloudfront.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.cloudfront.arn
  s3_delivery_configuration {
    suffix_path                 = "cloudfront/{DistributionId}/{yyyy}/{MM}/{dd}"
    enable_hive_compatible_path = false
  }

  depends_on = [aws_s3_bucket_policy.logs]
}
