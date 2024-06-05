const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = process.env;

const { userDB, oAuthClientAppDB, oAuthRolesDB } = require('../../../../../database/database.js');

const router = express.Router();

router.post('/', async (req, res) => {
  const req_cookies = req.headers.cookie;
  const { oauthClientAppId, oauthRoleId } = req.body;

  if (!req_cookies) {
    return res.status(400).json({ success: false, error: 'Access Token not found' });
  }

  const cookies = req_cookies.split(';').reduce((cookiesObj, cookie) => {
    const [name, value] = cookie.trim().split('=');
    cookiesObj[name] = value;
    return cookiesObj;
  }, {});

  const access_token = cookies['access_token'];

  try {
    const decoded = jwt.verify(access_token, JWT_SECRET);
    const userId = decoded.userId;
    const sid = decoded.sid;

    const userData = await userDB.findOne({ userId, sid });
    if (!userData) {
      res.clearCookie('access_token');
      return res.redirect('/login');
    }

    const userAccess = await userDB.findOne({ userId: userId, sid: sid, providerRoles: 'oauthUser' });

    if (!userAccess) {
      return res.status(460).json({ error: 'User has no permissions to manage oauth apps' });
    }

    let oauthApps = userData.oauthClientAppIds || [];

    if (!Array.isArray(oauthApps)) {
      return res.status(400).json({ error: 'Invalid format for oauthApps' });
    }

    if (oauthApps.length === 0) {
      return res.status(404).json({ error: 'No OAuth apps found for this user' });
    }

    if (oauthApps.indexOf(oauthClientAppId) === -1) {
      return res.status(461).json({ error: 'User does not have access to this oauth app' });
    }

    await oAuthRolesDB.deleteOne({ oauthRoleId });
    await oAuthClientAppDB.updateOne({ oauthClientAppId }, { $pull: { oauthRoleIds: oauthRoleId } });

    res.status(200).json({ success: true, message: 'OAuth role has been successfully deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;
