const express = require('express');
const jwt = require('jsonwebtoken');

const { userDB, oAuthRolesDB } = require('../../../../../../database/database.js');

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

const isValidOauthRoleUserIds = (ids) => {
  if (ids === '*') return true;
  if (!Array.isArray(ids)) return false;
  if (ids.length === 0) return false;
  return ids.every(id => {
    if (id === '*') return true;
    const numberId = Number(id);
    return !isNaN(numberId) && (typeof id === 'number' || id === numberId.toString());
  });
};




router.post('/', async (req, res) => {
  const access_token = req.cookies.access_token;
  const { oauthClientAppId, oauthRoleId, oauthRoleUserIds } = req.body;

  if (!oauthRoleUserIds) {
    return res.status(400).json({ success: false, error: 'No user ids provided' });
  }

  if (!oauthClientAppId) {
    return res.status(400).json({ success: false, error: 'oauthClientAppId not provided' });
  }

  if (!oauthRoleId) {
    return res.status(400).json({ success: false, error: 'oauthRoleId not provided' });
  }

  if (!access_token) {
    return res.status(400).json({ success: false, error: 'No authentication provided' });
  }

  try {
    const decoded = jwt.verify(access_token, JWT_PUBLIC_KEY);

    const userId = decoded.userId;
    const sid = decoded.sid;

    const userData = await userDB.findOne({ userId, sid });
    if (!userData) {
      res.clearCookie('access_token');
      return res.redirect('/login');
    }

    const userAccess = await userDB.findOne({ userId, sid, providerRoles: 'oauthUser' });

    if (!userAccess) {
      return res.status(460).json({ error: 'User has no permissions to manage oauth apps' });
    }

    let oauthApps = userData.oauthClientAppIds || [];

    if (oauthApps.length === 0) {
      return res.status(404).json({ error: 'No OAuth apps found for this user' });
    }

    if (!oauthApps.includes(oauthClientAppId)) {
      return res.status(461).json({ error: 'User does not have access to this oauth app' });
    }

    const existingRole = await oAuthRolesDB.findOne({ oauthRoleId, oauthClientAppId, owner: userId });

    if (!existingRole) {
      return res.status(404).json({ error: 'User has no access to manage this role' });
    }

    if (!isValidOauthRoleUserIds(oauthRoleUserIds)) {
      return res.status(400).json({ error: 'Invalid format for oauthRoleUserIds' });
    }

    if (oauthRoleUserIds === '*') {
      await oAuthRolesDB.updateOne(
        { oauthRoleId, oauthClientAppId },
        { $set: { oauthUserIds: '*' } }
      );
    } else {
      await oAuthRolesDB.updateOne(
        { oauthRoleId, oauthClientAppId },
        { $set: { oauthUserIds: oauthRoleUserIds } }
      );
    }

    res.status(200).json({ success: true, message: 'OAuth role has been successfully updated' });
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;
