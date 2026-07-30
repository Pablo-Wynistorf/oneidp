import express from 'express';
import jwt from 'jsonwebtoken';

import { oAuthClientAppDB } from '../../../../../database/mongodb.mjs';
import redisCache from '../../../../../database/redis.mjs';

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

router.get('/', async (req, res) => {
  const access_token = req.cookies.access_token;

  if (!access_token) {
    return res.status(400).json({ success: false, error: 'Access Token not found' });
  }

  try {
    jwt.verify(access_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] }, async (error, decoded) => {
      if (error) {
        // XHR endpoint: answer with a status the SPA can act on. Redirecting to
        // /login here hands fetch() an HTML page instead of JSON.
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

        const oauthApps = await oAuthClientAppDB.find({ owner: userId });

        // An owner with no applications yet is a normal state, not a 404: this
        // is exactly what a user who was just granted the capability sees.
        const organizedData = oauthApps.map(app => ({
          oauthAppName: app.oauthAppName,
          clientId: app.clientId,
          clientSecret: app.clientSecret || undefined,
          isPublicClient: app.isPublicClient,
          redirectUri: app.redirectUri,
          oauthClientAppId: app.oauthClientAppId,
          accessTokenValidity: app.accessTokenValidity,
        }));

        res.json({ oauthApps: organizedData });
      } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Something went wrong, try again later' });
      }
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

export default router;
