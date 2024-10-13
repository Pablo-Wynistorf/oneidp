const express = require('express');
const jwt = require('jsonwebtoken');

const { userDB, oAuthRolesDB, oAuthClientAppDB } = require('../../../../../../database/mongodb.js');
const redisCache = require('../../../../../../database/redis.js');

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

router.post('/', async (req, res) => {
  const basicAuth = req.headers.authorization;
  const access_token = req.cookies.access_token;
  const { oauthClientAppId, oauthRoleId } = req.body;
  let { userId_or_username } = req.body;

  if (!userId_or_username) {
    return res.status(400).json({ success: false, error: 'No userId or username provided' });
  }

  if (!oauthClientAppId) {
    return res.status(400).json({ success: false, error: 'oauthClientAppId not provided' });
  }

  if (!oauthRoleId) {
    return res.status(400).json({ success: false, error: 'oauthRoleId not provided' });
  }

  if (!access_token && !basicAuth) {
    return res.status(400).json({ success: false, error: 'No authentication provided' });
  }

  try {
    if (basicAuth) {
      const [clientId, clientSecret] = Buffer.from(basicAuth.split(' ')[1], 'base64').toString().split(':');
      const client = await oAuthClientAppDB.findOne({ clientId, clientSecret });

      if (!client) {
        return res.status(401).json({ success: false, error: 'Invalid client credentials' });
      }

      const basicAuth_oauthClientAppId = client.oauthClientAppId;

      if (basicAuth_oauthClientAppId !== oauthClientAppId) {
        return res.status(461).json({ error: 'User does not have access to this oauth app' });
      }

      const existingRole = await oAuthRolesDB.findOne({ oauthRoleId, oauthClientAppId: basicAuth_oauthClientAppId });

      if (!existingRole) {
        return res.status(404).json({ success: false, error: 'Oauth role not assigned to app' });
      }

      let oauthRoleUserIds;

      if (userId_or_username === '*') {
        oauthRoleUserIds = '*';
      } else {
        let userId;
        if (/^\d+$/.test(userId_or_username)) {
          const user = await userDB.findOne({ userId: userId_or_username });
          if (!user) {
            return res.status(404).json({ success: false, error: 'UserId not found' });
          }
          userId = user.userId;
        } else {
          const user = await userDB.findOne({ username: userId_or_username });
          if (!user) {
            return res.status(404).json({ success: false, error: 'Username not found' });
          }
          userId = user.userId;
        }

        oauthRoleUserIds = [userId];

        if (existingRole && existingRole.oauthUserIds === '*') {
          oauthRoleUserIds = '*';
        } else if (existingRole && Array.isArray(existingRole.oauthUserIds)) {
          oauthRoleUserIds = [...new Set([...existingRole.oauthUserIds, ...oauthRoleUserIds])];
        }
      }

      await oAuthRolesDB.findOneAndUpdate(
        { oauthRoleId, oauthClientAppId: basicAuth_oauthClientAppId },
        { oauthRoleId, oauthClientAppId: basicAuth_oauthClientAppId, oauthUserIds: oauthRoleUserIds },
        { upsert: true }
      );

      return res.status(200).json({ success: true, message: 'User successfully added to role' });
    }

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
          return res.status(461).json({ error: 'User does not have access to this app' });
        }

        const existingRole = await oAuthRolesDB.findOne({ oauthRoleId, oauthClientAppId });

        if (!existingRole) {
          return res.status(404).json({ error: 'OAuth role not found' });
        }

        let oauthRoleUserIds;

        if (userId_or_username === '*') {
          oauthRoleUserIds = '*';
        } else {
          if (/^\d+$/.test(userId_or_username)) {
            const user = await userDB.findOne({ userId: userId_or_username });
            if (!user) {
              return res.status(404).json({ success: false, error: 'UserId not found' });
            }
            oauthRoleUserIds = [userId_or_username];
          } else {
            const user = await userDB.findOne({ username: userId_or_username });
            if (!user) {
              return res.status(404).json({ success: false, error: 'Username not found' });
            }
            oauthRoleUserIds = [user.userId];
          }

          if (existingRole && existingRole.oauthUserIds === '*') {
            oauthRoleUserIds = '*';
          } else if (existingRole && Array.isArray(existingRole.oauthUserIds)) {
            oauthRoleUserIds = [...new Set([...existingRole.oauthUserIds, ...oauthRoleUserIds])];
          }
        }

        await oAuthRolesDB.findOneAndUpdate(
          { oauthRoleId, oauthClientAppId },
          { oauthRoleId, oauthClientAppId, oauthUserIds: oauthRoleUserIds },
          { upsert: true }
        );

        res.status(200).json({ success: true, message: 'User successfully added to role' });
      } catch (error) {
        res.status(500).json({ error: 'Something went wrong, try again later' });
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;
