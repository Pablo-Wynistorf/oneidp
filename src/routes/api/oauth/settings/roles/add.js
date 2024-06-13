const express = require('express');
const jwt = require('jsonwebtoken');

const { userDB, oAuthClientAppDB, oAuthRolesDB } = require('../../../../../database/database.js');

const router = express.Router();

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

router.post('/', async (req, res) => {
  const access_token = req.cookies.access_token
  const { oauthClientAppId, oauthRoleName } = req.body;

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

    const validRoleName = /^[a-zA-Z0-9\-_\. ]{1,40}$/;

    if (!validRoleName.test(oauthRoleName)) {
      return res.status(462).json({ error: 'Invalid role name' });
    }

    const oauthClientAppData = await oAuthClientAppDB.findOne({ oauthClientAppId });
    const oauthClientId = oauthClientAppData.clientId;

    const smallLettersRoleName = oauthRoleName.toLowerCase();

    const existingOauthRoleName = await oAuthRolesDB.findOne({ oauthRoleName: smallLettersRoleName, oauthClientId: oauthClientId });
    if (existingOauthRoleName) {
      return res.status(463).json({ error: 'Role name already exists' });
    }

    const oauthRoleId = `uri:loginapp:oauth::${oauthClientAppId}:role/${smallLettersRoleName}`;
    
    const newOauthRole = new oAuthRolesDB({
      oauthRoleId: oauthRoleId,
      oauthClientAppId: oauthClientAppId,
      oauthRoleName: oauthRoleName,
      oauthClientId: oauthClientId,
    });

    await newOauthRole.save();

    await oAuthClientAppDB.updateOne({ oauthClientAppId }, { $push: { oauthRoleIds: oauthRoleId } });

    res.status(200).json({ success: true, message: 'OAuth role has been successfully added' });
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;
