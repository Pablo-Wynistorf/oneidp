const express = require('express');
const jwt = require('jsonwebtoken');

const { userDB, oAuthClientAppDB, oAuthRolesDB } = require('../../../../../database/mongodb.js');
const redisCache = require('../../../../../database/redis.js');

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

router.post('/', async (req, res) => {
  const access_token = req.cookies.access_token;
  const { oauthClientAppId, oauthRoleName } = req.body;

  if (!access_token) {
    return res.status(400).json({ success: false, error: 'Access Token not found' });
  }

  try {
    jwt.verify(access_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] }, async (error, decoded) => {
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
          return res.status(460).json({ error: 'User has no permissions to manage oauth apps' });
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

        const validRoleName = /^[a-zA-Z0-9\-_\. ]{1,40}$/;

        if (!validRoleName.test(oauthRoleName)) {
          return res.status(462).json({ error: 'Invalid role name' });
        }

        const oauthClientAppData = await oAuthClientAppDB.findOne({ oauthClientAppId });
        const oauthClientId = oauthClientAppData.clientId;

        const smallLettersRoleName = oauthRoleName.toLowerCase();

        const oauthRoleId = `uri:oneidp:oauth::${oauthClientAppId}:role/${smallLettersRoleName}`;

        const existingOauthRole = await oAuthRolesDB.findOne({ oauthRoleId, oauthClientId });

        if (existingOauthRole) {
          return res.status(463).json({ error: 'Role already exists' });
        }


        const newOauthRole = new oAuthRolesDB({
          oauthRoleId,
          oauthClientAppId,
          oauthRoleName,
          oauthClientId,
          owner: userId,
        });

        await newOauthRole.save();

        res.status(200).json({ success: true, message: 'OAuth role has been successfully added' });
      } catch (error) {
        res.status(500).json({ error: 'Something went wrong, try again later' });
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;