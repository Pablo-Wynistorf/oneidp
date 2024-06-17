const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { userDB, oAuthClientAppDB, oAuthRolesDB } = require('../../../database/database.js');
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
    let oauthSid;
    let clientId = client_id;
    let clientSecret = client_secret;

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
      oauthSid = decodedRefreshToken.oauthSid;
      clientId = decodedRefreshToken.clientId;

      oauth_client = await oAuthClientAppDB.findOne({ clientId, clientSecret });

      if (!oauth_client) {
        return res.status(401).json({ error: 'Unauthorized', error_description: 'Invalid client_id or invalid refresh_token provided' });
      }

      oauth_user = await userDB.findOne({ userId, oauthSid });

      if (!oauth_user) {
        return res.status(401).json({ error: 'Unauthorized', error_description: 'User not found or session has expired' });
      }

    } else if (grant_type === 'authorization_code') {
      if (!clientSecret) {
        const authorizationHeader = req.headers.authorization;
        if (authorizationHeader) {
          const authorizationHeaderBase64 = authorizationHeader.split(' ')[1];
          authorizationHeaderDecoded = Buffer.from(authorizationHeaderBase64, 'base64').toString('utf-8');
          clientId = authorizationHeaderDecoded.split(':')[0];
          clientSecret = authorizationHeaderDecoded.split(':')[1];
        } else {
          return res.status(401).json({ error: 'Unauthorized', error_description: 'Invalid request, client_secret missing' });
        }
      }

      if (code_verifier) {
        oauth_user = await userDB.findOne({ oauthAuthorizationCode: code });

        if (!oauth_user) {
          return res.status(401).json({ error: 'Unauthorized', error_description: 'Invalid authorization code provided' });
        }

        const code_challenge_method = oauth_user.codeChallengeMethod;
        const code_challenge = oauth_user.codeChallenge;

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

        await userDB.findOneAndUpdate({ oauthAuthorizationCode: code }, { $unset: { nonce: 1, oauthAuthorizationCode: 1, codeChallenge: 1, codeChallengeMethod: 1 } });

      } else {
        if (!clientId || !clientSecret) {
          return res.status(400).json({ error: 'Invalid Request', error_description: 'client_id and client_secret are required for standard authorization code flow' });
        }

        oauth_client = await oAuthClientAppDB.findOne({ clientId, clientSecret });

        if (!oauth_client) {
          return res.status(401).json({ error: 'Unauthorized', error_description: 'Invalid client_id or client_secret provided' });
        }

        oauth_user = await userDB.findOneAndUpdate({ oauthAuthorizationCode: code }, { $unset: { oauthAuthorizationCode: 1 } });

        if (!oauth_user) {
          return res.status(401).json({ error: 'Unauthorized', error_description: 'Invalid authorization code provided' });
        }
      }

      userId = oauth_user.userId;
      oauthSid = oauth_user.oauthSid;
    }

    const username = oauth_user.username;
    const email = oauth_user.email;
    const mfaEnabled = oauth_user.mfaEnabled;
    const accessTokenValidity = oauth_client.accessTokenValidity;
    const nonce = oauth_user.nonce;

    const roleData = await oAuthRolesDB.find({
      $or: [
        { oauthClientId: clientId, oauthUserIds: userId },
        { oauthClientId: clientId, oauthUserIds: "*" },
      ],
    }).exec();

    const roleNames = roleData.map(role => role.oauthRoleName);

    const oauth_access_token = jwt.sign({ userId, oauthSid, clientId, iss: URL, sub: userId, aud: clientId }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: accessTokenValidity, keyid: JWK_PUBLIC_KEY.kid });
    const oauth_id_token = jwt.sign({ userId, username, email, roles: roleNames, mfaEnabled, iss: URL, sub: userId, aud: clientId, nonce }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h', keyid: JWK_PUBLIC_KEY.kid });
    const oauth_refresh_token = jwt.sign({ userId, oauthSid, clientId, iss: URL, sub: userId, aud: clientId }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '20d', keyid: JWK_PUBLIC_KEY.kid });

    return res.json({ access_token: oauth_access_token, id_token: oauth_id_token, refresh_token: oauth_refresh_token, expires_in: accessTokenValidity });

  } catch (error) {
    console.log(error);
    notifyError(error);
    res.status(500).json({ error: 'Server Error', error_description: 'Something went wrong on our site. Please try again later' });
  }
});

module.exports = router;
