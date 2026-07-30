output "cloudfront_domain_name" {
  description = "Auto-generated CloudFront domain for the app."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution id."
  value       = aws_cloudfront_distribution.this.id
}

output "app_url" {
  description = "Public URL configured for the app."
  value       = local.app_url
}

output "api_gateway_endpoint" {
  description = "Direct HTTP API endpoint (origin behind CloudFront)."
  value       = aws_apigatewayv2_api.this.api_endpoint
}

output "lambda_function_name" {
  description = "Name of the deployed Lambda function."
  value       = aws_lambda_function.this.function_name
}

output "frontend_bucket" {
  description = "S3 bucket holding the built React SPA."
  value       = aws_s3_bucket.frontend.id
}
