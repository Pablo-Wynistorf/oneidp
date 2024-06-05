const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = process.env;

const { userDB, oAuthClientAppDB } = require('../../../../../database/database.js');

const router = express.Router();

router.post('/', async (req, res) => {
  const { oauthAppName, redirectUri, accessTokenValidity } = req.body;
  const req_cookies = req.headers.cookie;

  if (!req_cookies) {
    return res.status(400).json({ success: false, error: 'Access Token not found' });
  }

  const cookies = req_cookies.split(';').reduce((cookiesObj, cookie) => {
    const [name, value] = cookie.trim().split('=');
    cookiesObj[name] = value;
    return cookiesObj;
  }, {});

  const access_token = cookies['access_token'];

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
    const decoded = jwt.verify(access_token, JWT_SECRET);
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
      clientId = [...Array(45)].map(() => Math.random().toString(36)[2]).join('');
      existingClientId = await oAuthClientAppDB.findOne({ clientId });
    } while (existingClientId);

    let clientSecret;
    let existingclientSecret;
    do {
      clientSecret = [...Array(45)].map(() => Math.random().toString(36)[2]).join('');
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
