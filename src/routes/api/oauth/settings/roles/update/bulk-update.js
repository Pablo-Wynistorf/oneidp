const express = require('express');
const jwt = require('jsonwebtoken');

const { userDB, oAuthRolesDB } = require('../../../../../../database/mongodb.js');

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

const getUserIdsFromUsernames = async (usernames) => {
  const userDocs = await userDB.find({ username: { $in: usernames } }).select('username userId');
  const userMap = new Map(userDocs.map(user => [user.username, user.userId]));
  return { userMap, userIds: usernames.map(username => userMap.get(username)).filter(userId => userId) };
};

const checkUserIdsExist = async (userIds) => {
  const existingUsers = await userDB.find({ userId: { $in: userIds } }).select('userId');
  const existingUserIds = new Set(existingUsers.map(user => user.userId));
  return userIds.filter(userId => existingUserIds.has(userId));
};

router.post('/', async (req, res) => {
  const access_token = req.cookies.access_token;
  const { oauthClientAppId, oauthRoleId, oauthRoleUserIds, oauthRoleUserNames } = req.body;

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

    if (
      (Array.isArray(oauthRoleUserIds) && oauthRoleUserIds.includes('*')) ||
      (Array.isArray(oauthRoleUserNames) && oauthRoleUserNames.includes('*'))
    ) {
      await oAuthRolesDB.updateOne(
        { oauthRoleId, oauthClientAppId },
        { $set: { oauthUserIds: '*' } }
      );
      return res.status(200).json({ success: true, message: 'OAuth role has been successfully updated' });
    }
    
    

    let finalUserIds = [];

    if (Array.isArray(oauthRoleUserNames)) {
      const { userMap, userIds: usernamesToIds } = await getUserIdsFromUsernames(oauthRoleUserNames);
      finalUserIds = finalUserIds.concat(usernamesToIds);
    }

    if (Array.isArray(oauthRoleUserIds)) {
      const validUserIds = await checkUserIdsExist(oauthRoleUserIds);
      finalUserIds = finalUserIds.concat(validUserIds);
    }


      finalUserIds = Array.from(new Set(finalUserIds));
      await oAuthRolesDB.updateOne(
        { oauthRoleId, oauthClientAppId },
        { $set: { oauthUserIds: finalUserIds } }
      );

    res.status(200).json({ success: true, message: 'OAuth role has been successfully updated' });
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;
