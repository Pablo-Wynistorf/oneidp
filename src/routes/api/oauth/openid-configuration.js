const express = require('express');
require('dotenv').config();

const router = express.Router();
const { URL } = process.env;

router.get('/', (req, res) => {
  const metadata = {
    issuer: `${URL}`,
    authorization_endpoint: `${URL}/api/oauth/authorize`,
    token_endpoint: `${URL}/api/oauth/token`,
    userinfo_endpoint: `${URL}/api/oauth/userinfo`,
    end_session_endpoint: `${URL}/api/oauth/logout`,
    revocation_endpoint: `${URL}/api/oauth/revoke`,
    jwks_uri: `${URL}/.well-known/jwks.json`,
    response_types_supported: [
      'code',
      'token',
      'id_token',
      'code token',
      'code id_token',
      'token id_token',
      'code token id_token'
    ],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_signing_alg_values_supported: ['RS256'],
    scopes_supported: [
      "openid",
      "profile",
      "email",
      "offline_access"
    ],
    token_endpoint_auth_methods_supported: [
      "client_secret_post",
      "client_secret_basic",
      "none"
    ],
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    claims_supported: [
      "sub",
      "iss",
      "aud",
      "nonce",
      "email",
      "username",
      "name",
      "given_name",
      "family_name",
      "roles",
      "mfaEnabled"
    ]
  };

  res.json(metadata);
});

module.exports = router;
