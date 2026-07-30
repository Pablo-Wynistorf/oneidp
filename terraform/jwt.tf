# Generates the RS256 JWT signing keypair used by the app. The generated keys
# are used automatically unless jwt_private_key / jwt_public_key are provided.
module "jwt_keys" {
  source   = "./modules/jwt-keys"
  rsa_bits = var.jwt_rsa_bits
}
