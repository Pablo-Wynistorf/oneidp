const express = require('express');
const jwt = require('jsonwebtoken');

const { userDB, oAuthRolesDB } = require('../../../../../database/mongodb.js');
const redisCache = require('../../../../../database/redis.js');

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY || ''}
-----END PUBLIC KEY-----
`.trim();

router.post('/', async (req, res) => {
  const accessToken = req.cookies.access_token;
  const oauthClientAppId = req.body.oauthClientAppId;
  const oauthRoleId = req.body.oauthRoleId;

  if (!accessToken) {
    return res.status(400).json({ success: false, error: 'Access Token not found' });
  }

  try {
    const decoded = jwt.verify(accessToken, JWT_PUBLIC_KEY);
    const { userId, sid } = decoded;

    const redisKey = `psid:${userId}:${sid}`;
    const session = await redisCache.hGetAll(redisKey);

    if (!session) {
      res.clearCookie('access_token');
      return res.status(401).json({ success: false, error: 'Access Token is invalid' });
    }

    const userAccess = await userDB.findOne({ userId, providerRoles: 'oauthUser' });
    if (!userAccess) {
      return res.status(403).json({ error: 'User does not have access to manage OAuth apps' });
    }

    let oauthApps = userAccess.oauthClientAppIds || [];

    if (!Array.isArray(oauthApps)) {
      return res.status(400).json({ error: 'Invalid format for oauthClientAppIds' });
    }

    if (oauthApps.length === 0) {
      return res.status(404).json({ error: 'No OAuth apps found for this user' });
    }

    if (!oauthApps.includes(oauthClientAppId)) {
      return res.status(403).json({ error: 'User does not have access to this OAuth app' });
    }

    const oauthRolesData = await oAuthRolesDB.findOne({ oauthRoleId });
    if (!oauthRolesData) {
      return res.status(404).json({ error: 'No OAuth roles found for this app' });
    }

    const oauthUserIds = oauthRolesData.oauthUserIds || [];

    if (oauthUserIds.length === 1 && oauthUserIds[0] === '*') {
      return res.json({ oauthUserIds: ['*'], oauthUserNames: ['*'] });
    }

    const userNames = await Promise.all(
      oauthUserIds.map(async (userId) => {
        const user = await userDB.findOne({ userId });
        return user ? user.username : `${userId}_unknown_user`;
      })
    );

    res.json({ oauthUserIds, oauthUserNames: userNames });
  } catch (error) {
    console.error(error);
    if (error.name === 'JsonWebTokenError') {
      return res.redirect('/login');
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
