import express from 'express';
import jwt from 'jsonwebtoken';

import { oAuthClientAppDB, oAuthRolesDB } from '../../../../../database/mongodb.mjs';
import redisCache from '../../../../../database/redis.mjs';

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

router.post('/', async (req, res) => {
  const oauthClientAppId = req.body.oauthClientAppId;
  const access_token = req.cookies.access_token;

  if (!access_token) {
    return res.status(400).json({ success: false, error: 'Access Token not found' });
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

        const oauthApps = await oAuthClientAppDB.find({ owner: userId });

        if (!Array.isArray(oauthApps)) {
          return res.status(400).json({ error: 'Invalid format for oauthApps' });
        }
    
        if (oauthApps.length === 0) {
          return res.status(404).json({ error: 'No OAuth apps found for this user' });
        }
    
        const userApp = oauthApps.find(app => app.oauthClientAppId === oauthClientAppId);
        if (!userApp) {
          return res.status(465).json({ error: 'User does not have access to this app' });
        }

        await oAuthClientAppDB.deleteOne({ oauthClientAppId });
        // Match on the stored field instead of pattern-matching the role id.
        // The old regex interpolated the app id unescaped and unanchored, which
        // breaks on UUID hyphens and could over-match.
        await oAuthRolesDB.deleteMany({ oauthClientAppId });

        res.status(200).json({ success: true, message: 'OAuth app has been successfully deleted' });
      } catch (error) {
        res.status(500).json({ error: 'Something went wrong, try again later' });

      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

export default router;
