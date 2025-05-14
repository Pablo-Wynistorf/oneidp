# Specify Terraform provider and version
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.86.1"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7.0"
    }
  }
  required_version = ">= 1.5.0"
}

# Define the AWS provider
provider "aws" {
  region = var.region
}

provider "aws" {
  region = "eu-central-1"
  alias  = "lambda_region"
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

variable "domain" {
  description = "Whats the domain?"
}

variable "url" {
  description = "Whats the URL of the Application?"
}

variable "google_analytics_tag_id" {
  description = "Whats the Google Analytics Tag ID?"
  default = "G-XXXXXXXXXX"
}

# Create a template file for the variables
data "template_file" "render_var_file" {
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
    domain = "${var.domain}"
    google_analytics_tag_id = "${var.google_analytics_tag_id}"
  EOT
}

# Create a local file with the variables
resource "local_file" "create_var_file" {
  content  = data.template_file.render_var_file.rendered
  filename = "terraform.tfvars"
}
