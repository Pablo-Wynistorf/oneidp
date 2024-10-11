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

router.post('/', async (req, res) => {
  const { oauthClientAppId, oauthAppName, redirectUri, accessTokenValidity } = req.body;
  const access_token = req.cookies.access_token;

  if (!access_token) {
    return res.status(400).json({ success: false, error: 'Access Token not found' });
  }

  const oauthAppNameRegex = /^[a-zA-Z0-9\-\.]{1,30}$/;
  if (!oauthAppNameRegex.test(oauthAppName)) {
    return res.status(460).json({ success: false, error: 'Invalid oauthAppName' });
  }

  const oauthRedirectUrlRegex = /^[a-zA-Z0-9\.:\/_!?-]+$/;
  if (!oauthRedirectUrlRegex.test(redirectUri)) {
    return res.status(460).json({ success: false, error: 'Invalid oauthRedirectUrl' });
  }
  if (isNaN(accessTokenValidity) || accessTokenValidity < 0 || accessTokenValidity > 604800) {
    return res.status(460).json({ success: false, error: 'Invalid access token validity' });
  }

  try {
    const decoded = jwt.verify(access_token, JWT_PUBLIC_KEY);
    const userId = decoded.userId;
    const sid = decoded.sid;

    const redisKey = `psid:${userId}:${sid}`;
    const session = await redisCache.keys(redisKey);

    if (session.length === 0) {
      res.clearCookie('access_token');
      return res.status(401).json({ success: false, error: 'Access Token is invalid' });
    }

    const userData = await userDB.findOne({ userId });

    let oauthApps = userData.oauthClientAppIds || [];

    if (oauthApps.length === 0) {
      return res.status(404).json({ error: 'No OAuth apps found for this user' });
    }

    if (oauthApps.indexOf(oauthClientAppId) === -1) {
      return res.status(461).json({ error: 'User does not have access to this oauth app' });
    }

    await oAuthClientAppDB.updateOne({ oauthClientAppId }, {
      $set: {
        oauthAppName,
        redirectUri,
        accessTokenValidity,
      },
    });

    return res.status(200).json({
      success: true,
      redirectUri,
      oauthClientAppId,
      oauthAppName,
      accessTokenValidity,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Something went wrong, try again later' });
  }
});

module.exports = router;
