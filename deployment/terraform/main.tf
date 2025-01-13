# Specify Terraform provider and version
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.5.0"
}

# Define the AWS provider
provider "aws" {
  region = var.region
}

variable "region" {
  description = "In what region do you want the infrastructure?"
}

variable "api_port" {
  description = "Whats the API Port? (default: 80)"
  default = 80
}

variable "dc_monitoring_webhook_url" {
  description = "Whats the Discord Webhook URL for monitoring?"
}

variable "github_client_id" {
  description = "Whats the Github Client ID?"
}

variable "github_client_secret" {
  description = "Whats the Github Client Secret?"
}

variable "google_client_id" {
  description = "Whats the Google Client ID?"
}

variable "google_client_secret" {
  description = "Whats the Google Client Secret?"
}

variable "jwt_private_key" {
  description = "Whats the JWT Private Key?"
}

variable "jwt_public_key" {
  description = "Whats the JWT Public Key?"
}

variable "mj_api_key_private" {
  description = "Whats the Mailjet API Key Private?"
}

variable "mj_api_key_public" {
  description = "Whats the Mailjet API Key Public?"
}

variable "mj_sender_email" {
  description = "Whats the Mailjet Sender Email?"
  
}

variable "mongodb_uri" {
  description = "Whats the MongoDB URI?"
}

variable "redis_uri" {
  description = "Whats the Redis URI?"
}

variable "url" {
  description = "Whats the URL of the Application?"
}

variable "google_analytics_tag_id" {
  description = "Whats the Google Analytics Tag ID?"
  default = "G-XXXXXXXXXX"
}

data "template_file" "render-var-file" {
  template = <<-EOT
    region = "${var.region}"
    api_port = "${var.api_port}"
    dc_monitoring_webhook_url = "${var.dc_monitoring_webhook_url}"
    github_client_id = "${var.github_client_id}"
    github_client_secret = "${var.github_client_secret}"
    google_client_id = "${var.google_client_id}"
    google_client_secret = "${var.google_client_secret}"
    jwt_private_key = "${var.jwt_private_key}"
    jwt_public_key = "${var.jwt_public_key}"
    mj_api_key_private = "${var.mj_api_key_private}"
    mj_api_key_public = "${var.mj_api_key_public}"
    mj_sender_email = "${var.mj_sender_email}"
    mongodb_uri = "${var.mongodb_uri}"
    redis_uri = "${var.redis_uri}"
    url = "${var.url}"
    google_analytics_tag_id = "${var.google_analytics_tag_id}"
  EOT
}

resource "local_file" "create-var-file" {
  content  = data.template_file.render-var-file.rendered
  filename = "terraform.tfvars"
}
