const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { userDB, oAuthClientAppDB, oAuthRolesDB } = require('../../../database/mongodb.js');
const redisCache = require('../../../database/redis.js');
const { notifyError } = require('../../../notify/notifications.js');
require('dotenv').config();

const { getJWKPublicKey } = require('../../../utils/get-jwk.js');

const router = express.Router();

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

const URL = process.env.URL;

router.post('/', async (req, res) => {
  const { grant_type, code, client_id, client_secret, refresh_token, code_verifier } = req.body;

  const JWK_PUBLIC_KEY = getJWKPublicKey();

  try {
    let oauth_client;
    let oauth_user;
    let userId;
    let osid;
    let clientId = client_id;
    let clientSecret = client_secret;
    let nonce;

    if (grant_type !== 'authorization_code' && grant_type !== 'refresh_token') {
      return res.status(400).json({ error: 'Unsupported grant_type. Only authorization_code and refresh_token are supported' });
    }

    if (grant_type === 'refresh_token') {
      let decodedRefreshToken;
      try {
        decodedRefreshToken = jwt.verify(refresh_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] });
      } catch (error) {
        return res.status(401).json({ error: 'Unauthorized', error_description: 'Invalid refresh token provided' });
      }

      userId = decodedRefreshToken.userId;
      osid = decodedRefreshToken.osid;
      clientId = decodedRefreshToken.clientId;

      oauth_client = await oAuthClientAppDB.findOne({ clientId, clientSecret });

      if (!oauth_client) {
        return res.status(401).json({ error: 'Unauthorized', error_description: 'Invalid client_id or invalid refresh_token provided' });
      }

      const redisKey = `osid:${userId}:${osid}`;
      const session = await redisCache.hGetAll(redisKey);
  
      if (Object.keys(session).length === 0) {
        res.clearCookie('refresh_token');
        return res.status(401).json({ success: false, error: 'Refresh Token invalid' });
      }

    } else if (grant_type === 'authorization_code') {
      if (!clientSecret) {
        const authorizationHeader = req.headers.authorization;
        if (authorizationHeader) {
          const authorizationHeaderBase64 = authorizationHeader.split(' ')[1];
          let authorizationHeaderDecoded = Buffer.from(authorizationHeaderBase64, 'base64').toString('utf-8');
          clientId = authorizationHeaderDecoded.split(':')[0];
          clientSecret = authorizationHeaderDecoded.split(':')[1];
        } else {
          return res.status(401).json({ error: 'Unauthorized', error_description: 'Invalid request, client_secret missing' });
        }
      }

      if (code_verifier) {        
        const redisKey = `ac:${code}`;
        const session = await redisCache.hGetAll(redisKey);

        if (Object.keys(session).length === 0) {
          return res.status(401).json({ error: 'Unauthorized', error_description: 'Invalid authorization code provided' });
        }

        userId = session.userId;
        nonce = session.nonce;

        await redisCache.del(redisKey);

        const code_challenge_method = session.codeChallengeMethod;
        const code_challenge = session.codeChallenge;

        if (code_challenge_method === 'S256') {
          const generatedCodeChallenge = crypto.createHash('sha256').update(code_verifier).digest('base64url');
          if (code_challenge !== generatedCodeChallenge) {
            return res.status(401).json({ error: 'Unauthorized', error_description: 'Code verifier does not match code challenge' });
          }
        } else {
          return res.status(400).json({ error: 'Invalid Request', error_description: 'Unsupported code_challenge_method' });
        }

        oauth_client = await oAuthClientAppDB.findOne({ clientId, clientSecret });

        if (!oauth_client) {
          return res.status(401).json({ error: 'Unauthorized', error_description: 'Invalid client_id or client_secret provided' });
        }

      } else {
        if (!clientId || !clientSecret) {
          return res.status(400).json({ error: 'Invalid Request', error_description: 'client_id and client_secret are required for standard authorization code flow' });
        }

        oauth_client = await oAuthClientAppDB.findOne({ clientId, clientSecret });

        if (!oauth_client) {
          return res.status(401).json({ error: 'Unauthorized', error_description: 'Invalid client_id or client_secret provided' });
        }

        const redisKey = `ac:${code}`;
        const session = await redisCache.hGetAll(redisKey);

        if (Object.keys(session).length === 0) {
          console.log('no session')
          return res.status(401).json({ error: 'Unauthorized', error_description: 'Invalid authorization code provided' });
        }
        userId = session.userId;
        nonce = session.nonce;

        await redisCache.del(redisKey);
      }
    }

    oauth_user = await userDB.findOne({ userId });
    const username = oauth_user.username;
    const email = oauth_user.email;
    const mfaEnabled = oauth_user.mfaEnabled;
    const accessTokenValidity = oauth_client.accessTokenValidity;

    const roleData = await oAuthRolesDB.find({
      $or: [
        { oauthClientId: clientId, oauthUserIds: userId },
        { oauthClientId: clientId, oauthUserIds: "*" },
      ],
    }).exec();

    const roleNames = roleData.map(role => role.oauthRoleName);

    osid = osid || await generateRandomString(15);
    
    const timestamp = Math.floor(Date.now() / 1000);
    const redisKey = `osid:${userId}:${osid}`;
  
    await redisCache.hSet(redisKey, {
      timestamp,
    })
    await redisCache.expire(redisKey, accessTokenValidity);

    const oauth_access_token = jwt.sign({ userId, osid, clientId, iss: URL, sub: userId, aud: clientId }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: accessTokenValidity, keyid: JWK_PUBLIC_KEY.kid });
    const oauth_id_token = jwt.sign({ userId, username, email, roles: roleNames, mfaEnabled, iss: URL, sub: userId, aud: clientId, nonce }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h', keyid: JWK_PUBLIC_KEY.kid });
    const oauth_refresh_token = jwt.sign({ userId, osid, clientId, iss: URL, sub: userId, aud: clientId }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '20d', keyid: JWK_PUBLIC_KEY.kid });

    return res.json({ access_token: oauth_access_token, id_token: oauth_id_token, refresh_token: oauth_refresh_token, expires_in: accessTokenValidity });

  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Server Error', error_description: 'Something went wrong on our site. Please try again later' });
  }
});

async function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

module.exports = router;
