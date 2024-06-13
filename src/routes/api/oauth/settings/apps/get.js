const express = require('express');
const jwt = require('jsonwebtoken');

const { userDB, oAuthClientAppDB } = require('../../../../../database/database.js');

const router = express.Router();

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

router.get('/', async (req, res) => {
  const access_token = req.cookies.access_token;

  if (!access_token) {
    return res.status(400).json({ success: false, error: 'Access Token not found' });
  }

  try {
    const decoded = jwt.verify(access_token, JWT_PRIVATE_KEY);
    const userId = decoded.userId;
    const sid = decoded.sid;

    const userData = await userDB.findOne({ userId, sid });
    if (!userData) {
      res.clearCookie('access_token');
      return res.redirect('/login');
    }

    const userAccess = await userDB.findOne({ userId: userId, sid: sid, providerRoles: 'oauthUser' });

    if (!userAccess) {
      return res.status(465).json({ error: 'User does not have access to create oauth apps' });
    }

    let oauthApps = userData.oauthClientAppIds || [];

    if (!Array.isArray(oauthApps)) {
      return res.status(400).json({ error: 'Invalid format for oauthApps' });
    }

    if (oauthApps.length === 0) {
      return res.status(404).json({ error: 'No OAuth apps found for this user' });
    }

    const oauthAppsData = await oAuthClientAppDB.find({ oauthClientAppId: { $in: oauthApps } }).exec();

    if (!oauthAppsData || oauthAppsData.length === 0) {
      return res.status(404).json({ error: 'No OAuth apps found' });
    }

    const organizedData = oauthAppsData.map(app => ({
      oauthAppName: app.oauthAppName,
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      redirectUri: app.redirectUri,
      oauthClientAppId: app.oauthClientAppId,
      accessTokenValidity: app.accessTokenValidity,
    }));

    res.json({ oauthApps: organizedData });
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;