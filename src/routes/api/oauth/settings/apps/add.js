const express = require('express');
const jwt = require('jsonwebtoken');

const { userDB, oAuthClientAppDB } = require('../../../../../database/database.js');

const router = express.Router();

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

router.post('/', async (req, res) => {
  const { oauthAppName, redirectUri, accessTokenValidity } = req.body;
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
    const decoded = jwt.verify(access_token, JWT_PRIVATE_KEY);
    const userId = decoded.userId;
    const sid = decoded.sid;

    const userData = await userDB.findOne({ userId: userId, sid: sid });
    if (!userData) {
      res.clearCookie('access_token');
      return res.redirect('/login');
    }

    const userAccess = await userDB.findOne({ userId: userId, sid: sid, providerRoles: 'oauthUser' });

    if (!userAccess) {
      return res.status(465).json({ error: 'User does not have access to create oauth apps' });
    }

    let oauthClientAppId;
    let existingoauthClientAppId;
    do {
      oauthClientAppId = Math.floor(Math.random() * 900000) + 100000;
      existingoauthClientAppId = await oAuthClientAppDB.findOne({ oauthClientAppId });
    } while (existingoauthClientAppId);

    let clientId;
    let existingClientId;
    do {
      clientId = [...Array(64)].map(() => Math.random().toString(36)[2]).join('');
      existingClientId = await oAuthClientAppDB.findOne({ clientId });
    } while (existingClientId);

    let clientSecret;
    let existingclientSecret;
    do {
      clientSecret = [...Array(64)].map(() => Math.random().toString(36)[2]).join('');
      existingclientSecret = await oAuthClientAppDB.findOne({ clientSecret });
    } while (existingclientSecret);

    const newoauthClientApp = new oAuthClientAppDB({
      oauthAppName: oauthAppName,
      oauthClientAppId: oauthClientAppId,
      clientId: clientId,
      clientSecret: clientSecret,
      redirectUri: redirectUri,
      accessTokenValidity: accessTokenValidity,
    });

    await newoauthClientApp.save();
    await userDB.updateOne({ userId }, { $push: { oauthClientAppIds: oauthClientAppId } });

    res.status(200).json({ success: true, clientId, clientSecret, redirectUri, oauthClientAppId, oauthAppName, accessTokenValidity });
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;
