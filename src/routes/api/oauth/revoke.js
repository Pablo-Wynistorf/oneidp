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

router.post('/', (req, res) => {
  let { token, client_secret } = req.body;
  const authorizationHeader = req.headers.authorization;

  if (!client_secret) {
    if (authorizationHeader) {
      const authorizationHeaderBase64 = authorizationHeader.split(' ')[1];
      let authorizationHeaderDecoded = Buffer.from(authorizationHeaderBase64, 'base64').toString('utf-8');
      client_secret = authorizationHeaderDecoded.split(':')[1];
    }
  }

  if (!token) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'Token not provided' });
  }


  jwt.verify(token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] }, async (error, decoded) => {
    if (error) {
      return res.status(400).json({ error: 'invalid_token', error_description: 'Invalid token provided' });
    }
    const { userId, osid, aud } = decoded;

    const appData = await oAuthClientAppDB.findOne({ clientId: aud, clientSecret: client_secret });
    if (!appData) {
      return res.status(400).json({ error: 'invalid_client', error_description: 'Invalid client_secret' });
    }

    await endUserSession(userId, osid);
  });

  return res.status(200).json({ success: true });
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