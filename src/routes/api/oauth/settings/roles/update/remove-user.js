const express = require('express');
const jwt = require('jsonwebtoken');
const { userDB, oAuthRolesDB, oAuthClientAppDB } = require('../../../../../../database/mongodb.js');

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

router.post('/', async (req, res) => {
  const basicAuth = req.headers.authorization;
  const access_token = req.cookies.access_token;
  const { oauthClientAppId, oauthRoleId, userId_or_username } = req.body;

  if (!oauthClientAppId) {
    return res.status(400).json({ success: false, error: 'oauthClientAppId not provided' });
  }

  if (!userId_or_username) {
    return res.status(400).json({ success: false, error: 'No userId or username provided' });
  }

  if (basicAuth) {
    try {
      const [clientId, clientSecret] = Buffer.from(basicAuth.split(' ')[1], 'base64').toString().split(':');
      const client = await oAuthClientAppDB.findOne({ clientId, clientSecret });

      if (!client) {
        return res.status(401).json({ success: false, error: 'Invalid client credentials' });
      }

      const basicAuth_oauthClientAppId = client.oauthClientAppId;

      if (basicAuth_oauthClientAppId !== oauthClientAppId) {
        return res.status(461).json({ success: false, error: 'User does not have access to this oauth app' });
      }

      const role = await oAuthRolesDB.findOne({ oauthRoleId, oauthClientAppId: basicAuth_oauthClientAppId });
      if (!role) {
        return res.status(404).json({ success: false, error: 'Role not found' });
      }

      let userId;

      if (/^\d+$/.test(userId_or_username)) {
        const user = await userDB.findOne({ userId: userId_or_username });
        if (!user) {
          return res.status(404).json({ success: false, error: 'UserId not found' });
        }
        userId = user.userId;
      } else {
        const user = await userDB.findOne({ username: userId_or_username });
        if (!user) {
          return res.status(404).json({ success: false, error: 'Username not found' });
        }
        userId = user.userId;
      }

      if (!Array.isArray(role.oauthUserIds)) {
        return res.status(400).json({ success: false, error: 'Invalid role user list' });
      }

      const index = role.oauthUserIds.indexOf(userId);
      if (index === -1) {
        return res.status(404).json({ success: false, error: 'User is not in the role' });
      }

      role.oauthUserIds.splice(index, 1);

      await oAuthRolesDB.findOneAndUpdate(
        { oauthRoleId, oauthClientAppId: basicAuth_oauthClientAppId },
        { $set: { oauthUserIds: role.oauthUserIds } }
      );

      return res.status(200).json({ success: true, message: 'User successfully removed from role' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, error: 'Something went wrong, try again later' });
    }
  }

  if (!access_token) {
    return res.status(400).json({ success: false, error: 'No authentication provided' });
  }

  jwt.verify(access_token, JWT_PUBLIC_KEY, async (error, decoded) => {
    if (error) {
      return res.redirect('/login');
    }

    const userIdFromToken = decoded.userId;
    const sid = decoded.sid;

    try {
      const userData = await userDB.findOne({ userId: userIdFromToken, sid });
      if (!userData) {
        res.clearCookie('access_token');
        return res.redirect('/login');
      }

      const userAccess = await userDB.findOne({ userId: userIdFromToken, sid, providerRoles: 'oauthUser' });

      if (!userAccess) {
        return res.status(460).json({ success: false, error: 'User has no permissions to manage oauth apps' });
      }

      let oauthApps = userData.oauthClientAppIds || [];
      if (!Array.isArray(oauthApps)) {
        return res.status(400).json({ success: false, error: 'Invalid format for oauthApps' });
      }

      if (!oauthApps.includes(oauthClientAppId)) {
        return res.status(461).json({ success: false, error: 'User does not have access to this oauth app' });
      }

      const role = await oAuthRolesDB.findOne({ oauthRoleId, oauthClientAppId });
      if (!role) {
        return res.status(404).json({ success: false, error: 'Role not found' });
      }

      let userId;

      if (/^\d+$/.test(userId_or_username)) {
        const user = await userDB.findOne({ userId: userId_or_username });
        if (!user) {
          return res.status(404).json({ success: false, error: 'UserId not found' });
        }
        userId = user.userId;
      } else {
        const user = await userDB.findOne({ username: userId_or_username });
        if (!user) {
          return res.status(404).json({ success: false, error: 'Username not found' });
        }
        userId = user.userId;
      }

      if (!Array.isArray(role.oauthUserIds)) {
        return res.status(400).json({ success: false, error: 'Invalid role user list' });
      }

      const index = role.oauthUserIds.indexOf(userId);
      if (index === -1) {
        return res.status(404).json({ success: false, error: 'User is not in the role' });
      }

      role.oauthUserIds.splice(index, 1);

      await oAuthRolesDB.findOneAndUpdate(
        { oauthRoleId, oauthClientAppId },
        { $set: { oauthUserIds: role.oauthUserIds } }
      );

      return res.status(200).json({ success: true, message: 'User successfully removed from role' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, error: 'Something went wrong, try again later' });
    }
  });
});

module.exports = router;
