const express = require('express');
const jwt = require('jsonwebtoken');
const { userDB, oAuthRolesDB } = require('../../../database/mongodb.js');
const redisCache = require('../../../database/redis.js');
const { notifyError } = require('../../..//notify/notifications.js');
require('dotenv').config();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

const router = express.Router();

router.all('/', (req, res) => {
  let access_token;

  const authorizationHeader = req.headers['authorization'];
  if (authorizationHeader && authorizationHeader.startsWith('Bearer ')) {
    access_token = authorizationHeader.split(' ')[1];
  }

  if (!access_token) {
    access_token = req.cookies.access_token;

    if (!access_token) {
      return res.status(400).json({ success: false, error: 'Access Token not provided' });
    }
  }

  jwt.verify(access_token, JWT_PUBLIC_KEY, async (error, tokenData) => {
    if (error) {
      return res.status(401).json({ success: false, error: 'Access Token is invalid' });
    }

    const { userId, clientId, sid } = tokenData;

    try {
      
      const redisKey = `psid:${userId}:${sid}`;
      const session = await redisCache.hGetAll(redisKey);
  
      if (!session) {
        res.clearCookie('access_token');
        return res.status(401).json({ success: false, error: 'Access Token is invalid' });
      }

      const userData = await userDB.findOne({ userId });
      if (!userData) {
        return res.status(401).json({ success: false, error: 'Error retrieving userdata' });
      }

      if (!clientId || clientId === 'undefined') {
        return res.status(200).json({
          sub: userId,
          userId,
          username: userData.username,
          email: userData.email,
          providerRoles: userData.providerRoles,
          mfaEnabled: userData.mfaEnabled,
        });
      }

      const roleData = await oAuthRolesDB.find({
        $or: [
          { oauthClientId: clientId, oauthUserIds: userId },
          { oauthClientId: clientId, oauthUserIds: "*" },
        ],
      }).exec();

      const roleNames = roleData.map((role) => role.oauthRoleName);

      res.status(200).json({
        sub: userId,
        userId,
        username: userData.username,
        email: userData.email,
        roles: roleNames,
        mfaEnabled: userData.mfaEnabled,
      });
    } catch (error) {
      notifyError(error);
      return res.status(500).json({ error: 'Something went wrong, try again later' });
    }
  });
});

module.exports = router;
