###############################################################################
# General
###############################################################################

variable "aws_region" {
  description = "AWS region to deploy the Lambda + API Gateway into."
  type        = string
  default     = "eu-central-1"
}

variable "project_name" {
  description = "Name prefix used for all created resources."
  type        = string
  default     = "oneidp"
}

variable "domain_name" {
  description = <<-EOT
    Optional custom domain for the app (e.g. "login.example.com"). When set, it
    is attached to the CloudFront distribution as an alias and used as the
    public URL passed to the app. Requires acm_certificate_arn (in us-east-1).
    Leave empty to use the auto-generated *.cloudfront.net domain.
  EOT
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = <<-EOT
    ARN of an ACM certificate in us-east-1 covering domain_name. Only used when
    domain_name is set. CloudFront requires the certificate to live in us-east-1.
  EOT
  type        = string
  default     = ""
}

###############################################################################
# Frontend delivery
###############################################################################

variable "frontend_cache_ttl_seconds" {
  description = <<-EOT
    How long CloudFront and browsers may cache the SPA (HTML and assets alike).
    Keeps repeat requests on the edge instead of hitting S3, while making a new
    deploy visible within this window. Deploys additionally invalidate the
    entry point, so the practical delay is usually zero.
  EOT
  type        = number
  default     = 60
}

###############################################################################
# Lambda runtime
###############################################################################

variable "lambda_runtime" {
  description = "Node.js runtime for the Lambda function."
  type        = string
  default     = "nodejs22.x"
}

variable "lambda_memory_size" {
  description = "Memory (MB) allocated to the Lambda function."
  type        = number
  default     = 512
}

variable "lambda_timeout" {
  description = "Timeout (seconds) for the Lambda function."
  type        = number
  default     = 30
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for the Lambda log group."
  type        = number
  default     = 14
}

###############################################################################
# Application environment variables
#   These map 1:1 to the process.env.* values the app reads at runtime.
###############################################################################

variable "app_url" {
  description = <<-EOT
    Public base URL of the app (used to build OAuth redirect URIs and email
    links). Leave empty to automatically use the CloudFront domain. If a
    custom domain_name is provided it takes precedence over this value.
  EOT
  type        = string
  default     = ""
}

variable "admin_emails" {
  description = <<-EOT
    Comma-separated email addresses allowed into the /admin console
    (ADMIN_EMAILS). Admin rights are configuration, not data: they cannot be
    granted from inside the application, and the address must be verified on the
    account. Every /api/admin request re-checks this list.
  EOT
  type        = string
  default     = "admin@onedns.ch"
}

variable "mongodb_uri" {
  description = "MongoDB connection string (MONGODB_URI)."
  type        = string
  sensitive   = true
}

variable "redis_uri" {
  description = "Redis connection string (REDIS_URI)."
  type        = string
  sensitive   = true
}

variable "jwt_rsa_bits" {
  description = "Key size for the auto-generated JWT RSA keypair."
  type        = number
  default     = 2048
}

variable "github_client_id" {
  description = "GitHub OAuth client id (GITHUB_CLIENT_ID)."
  type        = string
  default     = ""
}

variable "github_client_secret" {
  description = "GitHub OAuth client secret (GITHUB_CLIENT_SECRET)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "google_client_id" {
  description = "Google OAuth client id (GOOGLE_CLIENT_ID)."
  type        = string
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth client secret (GOOGLE_CLIENT_SECRET)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "google_analytics_tag_id" {
  description = "Google Analytics tag id (GOOGLE_ANALYTICS_TAG_ID)."
  type        = string
  default     = ""
}

variable "mailrift_api_key" {
  description = "MailRift REST API key with the mail:send permission (MAILRIFT_API_KEY)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "mailrift_sender_email" {
  description = "MailRift mailbox address used as sender (MAILRIFT_SENDER_EMAIL)."
  type        = string
  default     = ""
}

variable "mailrift_api_url" {
  description = "MailRift API base URL (MAILRIFT_API_URL). Leave empty to use https://api.mailrift.io/v1."
  type        = string
  default     = ""
}

variable "dc_monitoring_webhook_url" {
  description = "Discord monitoring webhook URL (DC_MONITORING_WEBHOOK_URL)."
  type        = string
  default     = ""
  sensitive   = true
}
