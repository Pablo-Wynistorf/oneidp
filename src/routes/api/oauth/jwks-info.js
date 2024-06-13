const express = require('express');
require('dotenv').config();

const router = express.Router();

const { getJWKPublicKey } = require('../../../utils/get-jwk.js');

router.get('/', (req, res) => {
  const JWK_PUBLIC_KEY = getJWKPublicKey();

  if (JWK_PUBLIC_KEY) {
    res.json({
      keys: [JWK_PUBLIC_KEY]
    });
  } else {
    res.status(500).json({ error: 'JWKS not available' });
  }
});

module.exports = router;
