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
      // Refresh Token Flow
      let decodedRefreshToken;
      try {
        decodedRefreshToken = jwt.verify(refresh_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] });
      } catch (error) {
        return res.status(401).json({ error: 'invalid_grant', error_description: 'Invalid refresh token provided' });
      }

      userId = decodedRefreshToken.userId;
      orsid = decodedRefreshToken.orsid;
      clientId = decodedRefreshToken.clientId;

      // Client authentication for refresh tokens
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

      // For refresh tokens, scope might have been included at authorization time. 
      // However, standard practice is that refresh tokens can request the same or fewer scopes.
      // If you stored scope at the initial issuance, you could fetch it from Redis. 
      // For simplicity, assume the same scope is used (if previously stored).
      // If you want to implement scope restriction on refresh, you need to store and fetch from Redis.

      // Let's say we stored the scope along with orsid for demonstration (not shown previously):
      // const orsidSession = await redisCache.hGetAll(orsidRedisKey);
      // requestedScope = orsidSession.scope || "openid";

      // If not stored, default to at least 'openid' because ID token was issued initially:
      // requestedScope = requestedScope || 'openid';

      // For this example, let's just assume 'openid' scope since we must produce an access_token anyway.
      requestedScope = 'openid';

    } else if (grant_type === 'authorization_code') {
      // Authorization Code Flow
      let providedClientId = clientId;
      let providedClientSecret = clientSecret;

      if (!providedClientSecret) {
        // Check the Authorization header if client_secret wasn't provided directly
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
        console.log("potentialClient", potentialClient);
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
      requestedScope = session.scope; // scope stored at authorization time
      storedRedirectUri = session.redirectUri; // redirect_uri stored at authorization time

      // Validate provided redirect_uri
      if (!redirect_uri || redirect_uri !== storedRedirectUri) {
        await redisCache.del(redisKey); // Invalidate code
        return res.status(400).json({ error: 'invalid_request', error_description: 'redirect_uri does not match the one used in the authorization request' });
      }

      // Delete the code after use
      await redisCache.del(redisKey);

      // PKCE Verification if provided
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
        // For public clients, code_verifier is mandatory
        if (oauth_client.isPublicClient) {
          return res.status(401).json({ error: 'invalid_grant', error_description: 'Public clients must use PKCE' });
        }

        // For confidential clients, if no code_verifier, client_secret must be provided
        if (!providedClientSecret && !oauth_client.isPublicClient) {
          return res.status(400).json({ error: 'invalid_request', error_description: 'client_secret is required for confidential clients without PKCE' });
        }
      }
    }

    // Validate that openid scope is present if we are to return an ID token
    const scopes = requestedScope ? requestedScope.split(' ') : [];
    const isOpenId = scopes.includes('openid');
    const isProfile = scopes.includes('profile');
    const isEmail = scopes.includes('email');

    // Common token generation logic
    oauth_user = await userDB.findOne({ userId });
    if (!oauth_user) {
      return res.status(401).json({ error: 'invalid_grant', error_description: 'User not found' });
    }

    const username = oauth_user.username;
    const email = oauth_user.email;
    const mfaEnabled = oauth_user.mfaEnabled;
    const accessTokenValidity = oauth_client.accessTokenValidity;

    // Determine what roles are applicable
    const roleData = await oAuthRolesDB.find({
      $or: [
        { oauthClientId: clientId, oauthUserIds: userId },
        { oauthClientId: clientId, oauthUserIds: "*" },
      ],
    }).exec();

    const roleNames = roleData.map(role => role.oauthRoleName);

    osid = await generateRandomString(15);
    orsid = await generateRandomString(15);
    const timestamp = Math.floor(Date.now() / 1000);

    const osidRedisKey = `osid:${userId}:${osid}`;
    await redisCache.hSet(osidRedisKey, {
      oauthClientAppId: oauth_client.oauthClientAppId,
      createdAt: timestamp,
    });
    await redisCache.expire(osidRedisKey, accessTokenValidity);

    if (grant_type === 'refresh_token') {
      // Refresh token flow: Return only access_token and expires_in.
      // Usually, when refreshing, you can also return a new ID token if 'openid' scope is still there.
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

      // If openid scope was present originally, we might return a new id_token as well.
      let responseBody = {
        access_token: oauth_access_token,
        expires_in: accessTokenValidity,
        token_type: "Bearer"
      };

      if (isOpenId) {
        // We issue a new ID token
        const idTokenPayload = {
          iss: URL,
          sub: userId,
          aud: clientId
          // You can decide whether to re-include nonce. Generally, nonce is for initial auth requests.
        };

        if (isProfile) {
          idTokenPayload.username = username;
        }
        if (isEmail) {
          idTokenPayload.email = email;
        }

        // Roles is a custom claim - ensure that you only add it if the client is allowed/expected to receive it,
        // possibly behind a specific scope or policy.
        idTokenPayload.roles = roleNames;

        const oauth_id_token = jwt.sign(
          idTokenPayload,
          JWT_PRIVATE_KEY,
          { algorithm: 'RS256', expiresIn: '48h', keyid: JWK_PUBLIC_KEY.kid }
        );

        responseBody.id_token = oauth_id_token;
      }

      return res.json(responseBody);
    }

    // Authorization code flow: Return access_token, id_token (if openid), refresh_token, expires_in
    const orsidRedisKey = `orsid:${userId}:${orsid}`;
    await redisCache.hSet(orsidRedisKey, {
      oauthClientAppId: oauth_client.oauthClientAppId,
      createdAt: timestamp,
      // Store the scope and other parameters if you want to use them on refresh
      scope: requestedScope
    });
    // Refresh token is generally long-lived
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

    // Only issue ID token if openid scope is present
    if (isOpenId) {
      const idTokenPayload = {
        iss: URL,
        sub: userId,
        aud: clientId,
        nonce: nonce,
        osid: osid
      };

      if (isProfile) {
        idTokenPayload.username = username;
        // Additional profile claims could be added if relevant and requested
      }

      if (isEmail) {
        idTokenPayload.email = email;
      }

      // If you want to conditionally add roles based on a custom scope, do so:
      // For now, let's add roles if we consider that part of the user info:
      idTokenPayload.roles = roleNames;
      idTokenPayload.mfaEnabled = mfaEnabled; // Consider if you want this claim behind a scope as well

      const oauth_id_token = jwt.sign(
        idTokenPayload,
        JWT_PRIVATE_KEY,
        { algorithm: 'RS256', expiresIn: '48h', keyid: JWK_PUBLIC_KEY.kid }
      );
      responseBody.id_token = oauth_id_token;
    }

    // Issue refresh token if offline_access requested or always (depends on policy)
    // OIDC states offline_access scope is required to issue long-lived refresh tokens.
    // Let's issue refresh_token only if offline_access scope is present:
    const isOfflineAccess = scopes.includes('offline_access');
    if (isOfflineAccess) {
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
    }

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
