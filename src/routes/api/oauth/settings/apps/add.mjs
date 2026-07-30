import express from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { oAuthClientAppDB } from '../../../../../database/mongodb.mjs';
import redisCache from '../../../../../database/redis.mjs';
import { getSettings } from '../../../../../utils/app-settings.mjs';

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

router.post('/', async (req, res) => {
  const { oauthAppName, isPublicClient, redirectUri, accessTokenValidity } = req.body;
  const access_token = req.cookies.access_token;

  if (!access_token) {
    return res.status(400).json({ success: false, error: 'Access Token not found' });
  }

  // Self-service app registration can be switched off instance-wide. Admins
  // remain able to register clients through the admin console.
  const settings = await getSettings();
  if (!settings.appCreationEnabled) {
    return res.status(403).json({
      success: false,
      error: 'Creating new applications is currently disabled. Contact an administrator.',
    });
  }

  const oauthAppNameRegex = /^[a-zA-Z0-9\-\.]{1,30}$/;

  if (!oauthAppNameRegex.test(oauthAppName)) {
    return res.status(460).json({ success: false, error: 'Invalid oauthAppName' });
  }

  const oauthRedirectUrlRegex = /^[a-zA-Z0-9\.:\/_!?-]+$/;

  if (!oauthRedirectUrlRegex.test(redirectUri)) {
    return res.status(460).json({ success: false, error: 'Invalid oauthRedirectUrl' });
  }

  if (isNaN(accessTokenValidity) || accessTokenValidity < 0 || accessTokenValidity > 1728000) {
    return res.status(460).json({ success: false, error: 'Invalid access token validity, the access_token can have a maximum validity of 20 days' });
  }

  try {
    jwt.verify(access_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] }, async (error, decoded) => {
      if (error) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
      }

      const userId = decoded.userId;
      const sid = decoded.sid;

      try {
        const redisKey = `psid:${userId}:${sid}`;
        const session = await redisCache.keys(redisKey);

        if (session.length === 0) {
          res.clearCookie('access_token');
          return res.status(401).json({ success: false, error: 'Access Token is invalid' });
        }

        // UUIDv4 rather than a 6-digit number: the old range capped the
        // instance at 999999 apps and got slower as it filled up, because every
        // candidate had to be checked against the collection.
        const oauthClientAppId = randomUUID();

        let clientId;
        let existingClientId;
        do {
          clientId = [...Array(64)].map(() => Math.random().toString(36)[2]).join('');
          existingClientId = await oAuthClientAppDB.findOne({ clientId });
        } while (existingClientId);

        let clientSecret = null;
        if (!isPublicClient) {
          let existingclientSecret;
          do {
            clientSecret = [...Array(64)].map(() => Math.random().toString(36)[2]).join('');
            existingclientSecret = await oAuthClientAppDB.findOne({ clientSecret });
          } while (existingclientSecret);
        }

        const newoauthClientApp = new oAuthClientAppDB({
          oauthAppName,
          oauthClientAppId,
          clientId,
          ...(clientSecret && { clientSecret }),
          redirectUri,
          accessTokenValidity,
          owner: userId,
          isPublicClient: !!isPublicClient
        });

        await newoauthClientApp.save();

        const responseData = {
          success: true,
          clientId,
          redirectUri,
          oauthClientAppId,
          oauthAppName,
          accessTokenValidity,
          isPublicClient: !!isPublicClient
        };

        if (!isPublicClient) {
          responseData.clientSecret = clientSecret;
        }

        res.status(200).json(responseData);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Something went wrong, try again later' });
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

export default router;
