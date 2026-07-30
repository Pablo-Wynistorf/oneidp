###############################################################################
# CloudFront distribution
#
# Two origins behind one hostname:
#   * S3        -> the React SPA (default behaviour)
#   * API GW    -> the Express app, on the /api, /.well-known and /gtag.js paths
#
# Keeping both on a single distribution is what allows the httpOnly session
# cookie to stay first-party and lets the API keep redirecting to SPA routes
# (/login, /consent, /dashboard) during the OAuth flow.
###############################################################################

# CachingDisabled / AllViewerExceptHostHeader for the dynamic API: every query
# string, cookie and header is forwarded except Host, which API Gateway rejects
# when it does not recognise it. Auth responses must never be cached, so the API
# behaviours keep a zero TTL regardless of the SPA's cache settings.
data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

# Short-lived edge cache for the SPA. Long enough that repeat views and asset
# requests are served from the edge (keeping S3 request costs down), short
# enough that a deploy is picked up within a minute without an invalidation.
resource "aws_cloudfront_cache_policy" "spa" {
  name        = "${var.project_name}-spa-short-ttl"
  comment     = "Short TTL cache for the ${var.project_name} SPA"
  min_ttl     = 0
  default_ttl = var.frontend_cache_ttl_seconds
  max_ttl     = var.frontend_cache_ttl_seconds

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true

    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

data "aws_cloudfront_response_headers_policy" "security_headers" {
  name = "Managed-SecurityHeadersPolicy"
}

locals {
  apigw_origin_id     = "apigw"
  apigw_origin_domain = replace(aws_apigatewayv2_api.this.api_endpoint, "https://", "")
  s3_origin_id        = "spa"

  # Path patterns that must reach the Express app rather than the SPA bucket.
  api_path_patterns = [
    "/api/*",
    "/.well-known/*",
    "/gtag.js",
  ]
}

# --- SPA history fallback ----------------------------------------------------
# S3 answers unknown keys with 403 (and 404 with ListBucket denied), so deep
# links like /oidc/roles have to resolve to index.html for the client router to
# take over.
#
# This deliberately does *not* use `custom_error_response`: those apply to the
# whole distribution, including the /api behaviours, so an API 403 or 404 came
# back as index.html with status 200. The SPA read that HTML body as a lost
# session and signed the user out mid-request. Rewriting the URI in a viewer
# request function keeps the fallback attached to the SPA behaviour alone and
# lets real API error statuses through untouched.
resource "aws_cloudfront_function" "spa_router" {
  name    = "${var.project_name}-spa-router"
  runtime = "cloudfront-js-2.0"
  comment = "Rewrites ${var.project_name} SPA deep links to /index.html"
  publish = true

  code = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      var lastSegment = uri.slice(uri.lastIndexOf('/') + 1);

      // The build produces a single index.html plus hashed assets, so no route
      // has an index document of its own. A file extension means a real asset;
      // everything else, trailing slash included, is a client route. Mapping
      // "/dashboard/" to "/dashboard/index.html" is what made trailing-slash
      // deep links come back as S3 AccessDenied; the SPA redirects them to the
      // canonical path once it loads.
      if (lastSegment === '' || lastSegment.indexOf('.') === -1) {
        request.uri = '/index.html';
      }

      return request;
    }
  EOT
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  comment             = "${var.project_name} identity provider"
  price_class         = "PriceClass_100"
  is_ipv6_enabled     = true
  default_root_object = "index.html"

  aliases = var.domain_name != "" ? [var.domain_name] : []

  # --- Origins ---------------------------------------------------------------

  origin {
    domain_name = local.apigw_origin_domain
    origin_id   = local.apigw_origin_id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = local.s3_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # --- Default behaviour: the SPA --------------------------------------------

  default_cache_behavior {
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD"]

    cache_policy_id            = aws_cloudfront_cache_policy.spa.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security_headers.id

    # Deep links are resolved before the request reaches S3, so the SPA fallback
    # is scoped to this behaviour only (see the function below).
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_router.arn
    }
  }

  # --- API behaviours --------------------------------------------------------

  dynamic "ordered_cache_behavior" {
    for_each = local.api_path_patterns

    content {
      path_pattern           = ordered_cache_behavior.value
      target_origin_id       = local.apigw_origin_id
      viewer_protocol_policy = "redirect-to-https"
      compress               = true

      allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods  = ["GET", "HEAD"]

      cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
      origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.domain_name == "" ? true : null
    acm_certificate_arn            = var.domain_name != "" ? var.acm_certificate_arn : null
    ssl_support_method             = var.domain_name != "" ? "sni-only" : null
    minimum_protocol_version       = var.domain_name != "" ? "TLSv1.2_2021" : null
  }

  # Ensure the API stage exists before CloudFront starts sending traffic.
  depends_on = [aws_apigatewayv2_stage.default]
}
