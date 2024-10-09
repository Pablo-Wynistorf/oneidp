const express = require('express');
const jwt = require('jsonwebtoken');

const { userDB, oAuthRolesDB } = require('../../../../../database/mongodb.js');
const redisCache = require('../../../../../database/redis.js');

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

router.post('/', async (req, res) => {
  const access_token = req.cookies.access_token
  const oauthClientAppId = req.body.oauthClientAppId;

  if (!access_token) {
    return res.status(400).json({ success: false, error: 'Access Token not found' });
  }

  jwt.verify(access_token, JWT_PUBLIC_KEY, async (error, decoded) => {
    if (error) {
      return res.redirect('/login');
    }
      
    const userId = decoded.userId;
    const sid = decoded.sid;

    const redisKey = `psid:${userId}:${sid}`;
    const session = await redisCache.hGetAll(redisKey);

    if (Object.keys(session).length === 0) {
      res.clearCookie('access_token');
      return res.status(401).json({ success: false, error: 'Access Token is invalid' });
    }

    const userAccess = await userDB.findOne({ userId: userId, providerRoles: 'oauthUser' });

    if (!userAccess) {
      return res.status(465).json({ error: 'User does not have access to manage oauth apps' });
    }

    let oauthApps = userAccess.oauthClientAppIds || [];

    if (!Array.isArray(oauthApps)) {
      return res.status(400).json({ error: 'Invalid format for oauthApps' });
    }

    if (oauthApps.length === 0) {
      return res.status(404).json({ error: 'No OAuth apps found for this user' });
    }

    if (oauthApps.indexOf(oauthClientAppId) === -1) {
      return res.status(466).json({ error: 'User does not have access to this oauth app' });
    }

    const oauthRolesData = await oAuthRolesDB.find({ oauthRoleId: { $regex: `${oauthClientAppId}-*` } });

    if (!oauthRolesData || oauthRolesData.length === 0) {
      return res.status(404).json({ error: 'No OAuth roles found for this app' });
    }

    const organizedData = oauthRolesData.map(app => ({
      oauthRoleId: app.oauthRoleId,
      oauthClientAppId : oauthClientAppId,
      oauthRoleName: app.oauthRoleName,
      oauthUserIds: app.oauthUserIds,
    }));

    res.json({ oauthRoles: organizedData });
  });
});

module.exports = router;
