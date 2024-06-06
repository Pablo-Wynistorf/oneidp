const express = require('express');
const jwt = require('jsonwebtoken');
const { userDB, oAuthRolesDB } = require('../../../database/database.js');
const { JWT_SECRET } = process.env;
const { notifyError } = require('../../..//notify/notifications.js');

const router = express.Router();

router.post('/', async (req, res) => {
  let access_token;

  const authorizationHeader = req.headers['authorization'];
  if (authorizationHeader && authorizationHeader.startsWith('Bearer ')) {
    access_token = authorizationHeader.split(' ')[1];
  }

  if (!access_token) {
    const req_cookies = req.headers.cookie;

    if (!req_cookies) {
      return res.status(400).json({ success: false, error: 'Access Token not found' });
    }

    const cookies = req_cookies.split(';').reduce((cookiesObj, cookie) => {
      const [name, value] = cookie.trim().split('=');
      cookiesObj[name] = value;
      return cookiesObj;
    }, {});

    access_token = cookies['access_token'];
  }

  if (!access_token) {
    return res.status(400).json({ success: false, error: 'Access Token not provided' });
  }

  try {
    let tokenData;
    
    try {
      tokenData = jwt.verify(access_token, JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ success: false, error: 'Access Token is invalid' });
    }

    const { userId, sid, oauthSid, clientId } = tokenData;

    const userData = await userDB.findOne({ userId, $or: [{ oauthSid }, { sid }] });
    if (!userData) {
      res.clearCookie('access_token');
      return res.redirect('/login');
    }

    if (!clientId || clientId === 'undefined') {
      return res.status(200).json({
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

module.exports = router;
