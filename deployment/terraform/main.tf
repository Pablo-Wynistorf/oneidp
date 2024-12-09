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

data "template_file" "render-var-file" {
  template = <<-EOT
    region = "${var.region}"
  EOT
}

resource "local_file" "create-var-file" {
  content  = data.template_file.render-var-file.rendered
  filename = "terraform.tfvars"
}
