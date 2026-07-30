###############################################################################
# jwt-keys module
#
# Generates an asymmetric RSA keypair used by the app to sign (RS256) and
# verify JWTs. The app wraps the raw base64 body between PEM header/footer
# lines itself, so this module exposes the *body only* (headers stripped) in
# addition to the full PEM.
###############################################################################

terraform {
  required_providers {
    tls = {
      source  = "hashicorp/tls"
      version = ">= 4.0.0"
    }
  }
}

variable "rsa_bits" {
  description = "Key size in bits for the generated RSA keypair."
  type        = number
  default     = 2048
}

resource "tls_private_key" "jwt" {
  algorithm = "RSA"
  rsa_bits  = var.rsa_bits
}

locals {
  # PKCS#8 private key -> matches the app's "-----BEGIN PRIVATE KEY-----" wrap.
  private_key_body = trimspace(
    replace(
      replace(tls_private_key.jwt.private_key_pem_pkcs8, "-----BEGIN PRIVATE KEY-----", ""),
      "-----END PRIVATE KEY-----", ""
    )
  )

  # SPKI public key -> matches the app's "-----BEGIN PUBLIC KEY-----" wrap.
  public_key_body = trimspace(
    replace(
      replace(tls_private_key.jwt.public_key_pem, "-----BEGIN PUBLIC KEY-----", ""),
      "-----END PUBLIC KEY-----", ""
    )
  )
}

output "private_key_body" {
  description = "PKCS#8 private key base64 body (no PEM header/footer) for JWT_PRIVATE_KEY."
  value       = local.private_key_body
  sensitive   = true
}

output "public_key_body" {
  description = "SPKI public key base64 body (no PEM header/footer) for JWT_PUBLIC_KEY."
  value       = local.public_key_body
}

output "private_key_pem" {
  description = "Full PKCS#8 private key PEM."
  value       = tls_private_key.jwt.private_key_pem_pkcs8
  sensitive   = true
}

output "public_key_pem" {
  description = "Full SPKI public key PEM."
  value       = tls_private_key.jwt.public_key_pem
}
