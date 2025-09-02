const express = require('express');
const jwt = require('jsonwebtoken');
const { oAuthClientAppDB } = require('../../../database/postgres.js');
const redisCache = require('../../../database/redis.js');

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

router.all('/', (req, res) => {
  let { id_token_hint, post_logout_redirect_uri } = req.query;

  if (!id_token_hint) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'Token not provided' });
  }


  jwt.verify(id_token_hint, JWT_PUBLIC_KEY, { algorithms: ['RS256'] }, async (error, decoded) => {
    if (error) {
      return res.status(400).json({ error: 'invalid_token', error_description: 'Invalid token provided' });
    }
    const { userId, osid, aud } = decoded;

    const appData = await oAuthClientAppDB.findOne({ clientId: aud, });
    if (!appData) {
      return res.status(400).json({ error: 'invalid_client', error_description: 'Invalid client_id' });
    }

    await endUserSession(userId, osid);
  });

  return res.redirect(post_logout_redirect_uri);
});

async function endUserSession(userId, osid) {
  const redisKeyPattern = `osid:${userId}:${osid}`;
  
  try {
      const sessions = await redisCache.keys(redisKeyPattern);
      
      if (sessions.length > 0) {
          await redisCache.del(sessions);
      } else {
      }
  } catch (error) {
      console.error('Error removing sessions:', error);
  }
};


module.exports = router;