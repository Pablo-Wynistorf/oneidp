const express = require('express');
const jwt = require('jsonwebtoken');

const { userDB, oAuthRolesDB } = require('../../../../../database/database.js');

const router = express.Router();

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

router.post('/', async (req, res) => {
  const access_token = req.cookies.access_token
  const oauthClientAppId = req.body.oauthClientAppId;

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
      return res.status(465).json({ error: 'User does not have access to manage oauth apps' });
    }

    let oauthApps = userData.oauthClientAppIds || [];

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
      oauthRoleName: app.oauthRoleName,
      oauthUserIds: app.oauthUserIds,
    }));

    res.json({ oauthRoles: organizedData });
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;
