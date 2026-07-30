locals {
  # Where the application source lives relative to this module.
  src_dir      = "${path.module}/../src"
  build_dir    = "${path.module}/build"
  frontend_dir = "${path.module}/../frontend"
  # Integration markdown rendered by the SPA's /docs route.
  docs_dir = "${path.module}/../docs"

  # Resolve the public URL passed to the app:
  #   1. explicit custom domain, else
  #   2. explicit app_url override, else
  #   3. the CloudFront distribution domain.
  app_url = var.domain_name != "" ? "https://${var.domain_name}" : (
    var.app_url != "" ? var.app_url : "https://${aws_cloudfront_distribution.this.domain_name}"
  )

  # Environment variables handed to the Lambda (map 1:1 to process.env.*).
  app_environment = {
    URL                       = local.app_url
    ADMIN_EMAILS              = var.admin_emails
    MONGODB_URI               = var.mongodb_uri
    REDIS_URI                 = var.redis_uri
    JWT_PRIVATE_KEY           = module.jwt_keys.private_key_body
    JWT_PUBLIC_KEY            = module.jwt_keys.public_key_body
    GITHUB_CLIENT_ID          = var.github_client_id
    GITHUB_CLIENT_SECRET      = var.github_client_secret
    GOOGLE_CLIENT_ID          = var.google_client_id
    GOOGLE_CLIENT_SECRET      = var.google_client_secret
    GOOGLE_ANALYTICS_TAG_ID   = var.google_analytics_tag_id
    MAILRIFT_API_KEY          = var.mailrift_api_key
    MAILRIFT_SENDER_EMAIL     = var.mailrift_sender_email
    MAILRIFT_API_URL          = var.mailrift_api_url
    DC_MONITORING_WEBHOOK_URL = var.dc_monitoring_webhook_url
  }
}
