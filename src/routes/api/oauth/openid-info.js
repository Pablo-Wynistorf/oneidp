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
    jwks_uri: `${URL}/.well-known/jwks.json`,
    response_types_supported: ['code', 'token', 'id_token'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_signing_alg_values_supported: ['RS256'],
    scopes_supported: ["openid"],
    grant_types_supported: ["authorization_code"],
  };
  res.json(metadata);
});

module.exports = router;
