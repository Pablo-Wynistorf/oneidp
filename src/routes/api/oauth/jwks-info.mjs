import express from 'express';
import 'dotenv/config';

const router = express.Router();

import { getJWKPublicKey } from '../../../utils/get-jwk.mjs';

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

export default router;
