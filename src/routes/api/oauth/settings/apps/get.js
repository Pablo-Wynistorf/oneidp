const express = require('express');
const jwt = require('jsonwebtoken');

const { userDB, oAuthClientAppDB } = require('../../../../../database/mongodb.js');
const redisCache = require('../../../../../database/redis.js');

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
    jwt.verify(access_token, JWT_PUBLIC_KEY, async (error, decoded) => {
      if (error) {
        return res.redirect('/login');
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

        const userAccess = await userDB.findOne({ userId, providerRoles: 'oauthUser' });

        if (!userAccess) {
          return res.status(465).json({ error: 'User does not have access to get oauth apps' });
        }

        const oauthApps = await oAuthClientAppDB.find({ owner: userId });

        if (oauthApps.length === 0) {
          return res.status(404).json({ error: 'No OAuth apps found for this user' });
        }

        const organizedData = oauthApps.map(app => ({
          oauthAppName: app.oauthAppName,
          clientId: app.clientId,
          clientSecret: app.clientSecret,
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

module.exports = router;
