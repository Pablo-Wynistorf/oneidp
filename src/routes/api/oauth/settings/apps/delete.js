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
  const oauthClientAppId = req.body.oauthClientAppId;
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
        const session = await redisCache.hGetAll(redisKey);
    
        if (!session) {
          res.clearCookie('access_token');
          return res.status(401).json({ success: false, error: 'Access Token is invalid' });
        }

        const userAccess = await userDB.findOne({ userId, providerRoles: 'oauthUser' });

        if (!userAccess) {
          return res.status(465).json({ error: 'User does not have access to create oauth apps' });
        }

        const testOauthClientAppId = userAccess.oauthClientAppIds.includes(oauthClientAppId);

        if (!testOauthClientAppId) {
          return res.status(460).json({ error: 'User does not own this oauth app' });
        }

        await oAuthClientAppDB.deleteOne({ oauthClientAppId });
        await oAuthRolesDB.deleteMany({ oauthRoleId: { $regex: `${oauthClientAppId}-*` } });
        await userDB.updateOne(
          { userId },
          { $pull: { oauthClientAppIds: parseInt(oauthClientAppId) } }
        );

        res.status(200).json({ success: true, message: 'OAuth app has been successfully deleted' });
      } catch (error) {
        res.status(500).json({ error: 'Something went wrong, try again later' });
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;
