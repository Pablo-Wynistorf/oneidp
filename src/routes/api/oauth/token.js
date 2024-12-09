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
  const { grant_type, code, client_id, client_secret, refresh_token, code_verifier, redirect_uri } = req.body;
  const JWK_PUBLIC_KEY = getJWKPublicKey();

  try {
    let oauth_client;
    let oauth_user;
    let userId;
    let osid;
    let orsid;
    let clientId = client_id;
    let clientSecret = client_secret;
    let nonce;
    let requestedScope;
    let storedRedirectUri;

    if (grant_type !== 'authorization_code' && grant_type !== 'refresh_token') {
      return res.status(400).json({ error: 'unsupported_grant_type', error_description: 'Only authorization_code and refresh_token are supported' });
    }

    if (grant_type === 'refresh_token') {
      let decodedRefreshToken;
      try {
        decodedRefreshToken = jwt.verify(refresh_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] });
      } catch (error) {
        return res.status(401).json({ error: 'invalid_grant', error_description: 'Invalid refresh token provided' });
      }

      userId = decodedRefreshToken.userId;
      orsid = decodedRefreshToken.orsid;
      clientId = decodedRefreshToken.clientId;

      oauth_client = await oAuthClientAppDB.findOne({ clientId, clientSecret });
      if (!oauth_client) {
        return res.status(401).json({ error: 'invalid_client', error_description: 'Invalid client credentials or refresh token' });
      }

      const redisKey = `orsid:${userId}:${orsid}`;
      const session = await redisCache.keys(redisKey);

      if (session.length === 0) {
        res.clearCookie('refresh_token');
        return res.status(401).json({ error: 'invalid_grant', error_description: 'Refresh Token is invalid or expired' });
      }

      requestedScope = 'openid';

    } else if (grant_type === 'authorization_code') {
      let providedClientId = clientId;
      let providedClientSecret = clientSecret;

      if (!providedClientSecret) {
        const authorizationHeader = req.headers.authorization;
        if (authorizationHeader) {
          const authorizationHeaderBase64 = authorizationHeader.split(' ')[1];
          let authorizationHeaderDecoded = Buffer.from(authorizationHeaderBase64, 'base64').toString('utf-8');
          providedClientId = authorizationHeaderDecoded.split(':')[0];
          providedClientSecret = authorizationHeaderDecoded.split(':')[1];
        }
      }

      // Client ID must be provided
      if (!providedClientId) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'client_id is required' });
      }

      // Fetch OAuth client
      let potentialClient;
      if (providedClientSecret) {
        potentialClient = await oAuthClientAppDB.findOne({ clientId: providedClientId, clientSecret: providedClientSecret });
      } else {
        // Try to find a public client
        potentialClient = await oAuthClientAppDB.findOne({ clientId: providedClientId, isPublicClient: true });
      }

      if (!potentialClient) {
        return res.status(401).json({ error: 'invalid_client', error_description: 'Invalid client credentials or public client not found' });
      }

      oauth_client = potentialClient;
      clientId = oauth_client.clientId;

      if (!oauth_client.isPublicClient && !providedClientSecret) {
        return res.status(401).json({ error: 'invalid_client', error_description: 'client_secret is required for confidential clients' });
      }

      // Check authorization code in Redis
      const redisKey = `ac:${code}`;
      const session = await redisCache.hGetAll(redisKey);

      if (Object.keys(session).length === 0) {
        return res.status(401).json({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' });
      }

      userId = session.userId;
      nonce = session.nonce;
      requestedScope = session.scope; 
      storedRedirectUri = session.redirectUri;

      if (!redirect_uri || redirect_uri !== storedRedirectUri) {
        await redisCache.del(redisKey);
        return res.status(400).json({ error: 'invalid_request', error_description: 'redirect_uri does not match the one used in the authorization request' });
      }

      await redisCache.del(redisKey);

      if (code_verifier) {
        const code_challenge_method = session.codeChallengeMethod;
        const code_challenge = session.codeChallenge;

        if (code_challenge_method === 'S256') {
          const generatedCodeChallenge = crypto.createHash('sha256').update(code_verifier).digest('base64url');
          if (code_challenge !== generatedCodeChallenge) {
            return res.status(401).json({ error: 'invalid_grant', error_description: 'Code verifier does not match code challenge' });
          }
        } else {
          return res.status(400).json({ error: 'invalid_request', error_description: 'Unsupported code_challenge_method' });
        }
      } else {
        if (oauth_client.isPublicClient) {
          return res.status(401).json({ error: 'invalid_grant', error_description: 'Public clients must use PKCE' });
        }

        if (!providedClientSecret && !oauth_client.isPublicClient) {
          return res.status(400).json({ error: 'invalid_request', error_description: 'client_secret is required for confidential clients without PKCE' });
        }
      }
    }

    const scopes = requestedScope ? requestedScope.split(' ') : [];
    const isProfile = scopes.includes('profile');
    const isEmail = scopes.includes('email');

    oauth_user = await userDB.findOne({ userId });
    if (!oauth_user) {
      return res.status(401).json({ error: 'invalid_grant', error_description: 'User not found' });
    }

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

    osid = await generateRandomString(15);
    const timestamp = Math.floor(Date.now() / 1000);

    const osidRedisKey = `osid:${userId}:${osid}`;
    await redisCache.hSet(osidRedisKey, {
      oauthClientAppId: oauth_client.oauthClientAppId,
      createdAt: timestamp,
    });
    await redisCache.expire(osidRedisKey, accessTokenValidity);

    if (grant_type === 'refresh_token') {
      const payload = {
        userId,
        osid,
        clientId,
        iss: URL,
        sub: userId,
        aud: clientId
      };

      const oauth_access_token = jwt.sign(
        payload,
        JWT_PRIVATE_KEY,
        { algorithm: 'RS256', expiresIn: accessTokenValidity, keyid: JWK_PUBLIC_KEY.kid }
      );

      let responseBody = {
        access_token: oauth_access_token,
        expires_in: accessTokenValidity,
        token_type: "Bearer"
      };

      const idTokenPayload = {
        iss: URL,
        sub: userId,
        aud: clientId,
        nonce: nonce,
        osid: osid
      };

      if (isProfile) {
        idTokenPayload.username = username;
      }
      if (isEmail) {
        idTokenPayload.email = email;
      }

      idTokenPayload.roles = roleNames;

      idTokenPayload.mfaEnabled = mfaEnabled;

      const oauth_id_token = jwt.sign(
        idTokenPayload,
        JWT_PRIVATE_KEY,
        { algorithm: 'RS256', expiresIn: '48h', keyid: JWK_PUBLIC_KEY.kid }
      );

      responseBody.id_token = oauth_id_token;

      return res.json(responseBody);
    }

    orsid = await generateRandomString(15);
    const orsidRedisKey = `orsid:${userId}:${orsid}`;
    await redisCache.hSet(orsidRedisKey, {
      oauthClientAppId: oauth_client.oauthClientAppId,
      createdAt: timestamp,
      scope: requestedScope || "openid"
    });

    await redisCache.expire(orsidRedisKey, 20 * 24 * 60 * 60);

    const oauth_access_token_payload = {
      userId,
      osid,
      clientId,
      iss: URL,
      sub: userId,
      aud: clientId
    };

    const oauth_access_token = jwt.sign(
      oauth_access_token_payload,
      JWT_PRIVATE_KEY,
      { algorithm: 'RS256', expiresIn: accessTokenValidity, keyid: JWK_PUBLIC_KEY.kid }
    );

    let responseBody = {
      access_token: oauth_access_token,
      expires_in: accessTokenValidity,
      token_type: "Bearer"
    };

    const idTokenPayload = {
      iss: URL,
      sub: userId,
      aud: clientId,
      nonce: nonce,
      osid: osid
    };

    if (isProfile) {
      idTokenPayload.username = username;
      idTokenPayload.name = username;
    }

    if (isEmail) {
      idTokenPayload.email = email;
    }

    idTokenPayload.roles = roleNames;

    idTokenPayload.mfaEnabled = mfaEnabled;

    const oauth_id_token = jwt.sign(
      idTokenPayload,
      JWT_PRIVATE_KEY,
      { algorithm: 'RS256', expiresIn: '48h', keyid: JWK_PUBLIC_KEY.kid }
    );
    responseBody.id_token = oauth_id_token;

    const oauth_refresh_token_payload = {
      userId,
      orsid,
      clientId,
      iss: URL,
      sub: userId,
      aud: clientId
    };

    const oauth_refresh_token = jwt.sign(
      oauth_refresh_token_payload,
      JWT_PRIVATE_KEY,
        { algorithm: 'RS256', expiresIn: '20d', keyid: JWK_PUBLIC_KEY.kid }
      );

    responseBody.refresh_token = oauth_refresh_token;

    return res.json(responseBody);
  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'server_error', error_description: 'Something went wrong. Please try again later' });
  }
});

async function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

module.exports = router;
