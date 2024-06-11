const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = process.env;

const { userDB, oAuthRolesDB, oAuthClientAppDB} = require('../../../../../../database/database.js');

const router = express.Router();

router.post('/', async (req, res) => {
  const basicAuth = req.headers.authorization;
  const access_token = req.cookies.access_token;
  const { oauthClientAppId, oauthRoleId } = req.body;
  let { oauthRoleUserIds } = req.body;

  if (!oauthRoleUserIds) {
    return res.status(400).json({ success: false, error: 'oauthRoleUserIds not provided' });
  }

  if (!oauthClientAppId) {
    return res.status(400).json({ success: false, error: 'oauthClientAppId not provided' });
  }

  if (!oauthRoleId) {
    return res.status(400).json({ success: false, error: 'oauthRoleId not provided' });
  }
  

  if (!access_token && !basicAuth) {
    return res.status(400).json({ success: false, error: 'No authentication provided' });
  }

  try {
    if (basicAuth) {
      const [clientId, clientSecret] = Buffer.from(basicAuth.split(' ')[1], 'base64').toString().split(':');
      const client = await oAuthClientAppDB.findOne({ clientId, clientSecret });

      if (!client) {
        return res.status(401).json({ success: false, error: 'Invalid client credentials' });
      }

      const basicAuth_oauthClientAppId = client.oauthClientAppId;
  
      const existingRole = await oAuthRolesDB.findOne({ oauthRoleId, oauthClientAppId: basicAuth_oauthClientAppId });

      if (!existingRole) {
        return res.status(404).json({ success: false, error: 'Oauth role not assigned to app' });
      }
  
      if (oauthRoleUserIds === '*') {
        oauthRoleUserIds = '*';
      } else {
        let userIdsArray = oauthRoleUserIds.split(',').map(id => id.trim());
  
        const validUserIds = await userDB.find({ userId: { $in: userIdsArray } }).distinct('userId');
  
        const nonExistingUsers = userIdsArray.filter(id => !validUserIds.includes(id));
        if (nonExistingUsers.length > 0) {
          return res.status(464).json({ error: `The following users do not exist: ${nonExistingUsers.join(', ')}` });
        }
  
        if (existingRole && existingRole.oauthUserIds === '*') {
          await oAuthRolesDB.updateOne(
            { oauthRoleId, oauthClientAppId },
            { $unset: { oauthUserIds: '' } }
          );
        }
  
        if (existingRole && Array.isArray(existingRole.oauthUserIds)) {
          userIdsArray = [...new Set([...existingRole.oauthUserIds, ...userIdsArray])];
        }
  
        oauthRoleUserIds = userIdsArray.sort();
      }
  
      await oAuthRolesDB.findOneAndUpdate(
        { oauthRoleId, oauthClientAppId },
        { oauthRoleId, oauthClientAppId, oauthUserIds: oauthRoleUserIds },
        { upsert: true }
      );
  
      return res.status(200).json({ success: true, message: 'OAuth role has been successfully updated' });
    }

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

    const existingRole = await oAuthRolesDB.findOne({ oauthRoleId, oauthClientAppId });
    
    if (!existingRole) {
      return res.status(404).json({ error: 'OAuth role not found' });
    }

    if (oauthRoleUserIds === '*') {
      oauthRoleUserIds = '*';
    } else {
      let userIdsArray = oauthRoleUserIds.split(',').map(id => id.trim());

      const validUserIds = await userDB.find({ userId: { $in: userIdsArray } }).distinct('userId');

      const nonExistingUsers = userIdsArray.filter(id => !validUserIds.includes(id));
      if (nonExistingUsers.length > 0) {
        return res.status(464).json({ error: `The following users do not exist: ${nonExistingUsers.join(', ')}` });
      }

      if (existingRole && existingRole.oauthUserIds === '*') {
        await oAuthRolesDB.updateOne(
          { oauthRoleId, oauthClientAppId },
          { $unset: { oauthUserIds: '' } }
        );
      }

      if (existingRole && Array.isArray(existingRole.oauthUserIds)) {
        userIdsArray = [...new Set([...existingRole.oauthUserIds, ...userIdsArray])];
      }

      oauthRoleUserIds = userIdsArray.sort();
    }

    await oAuthRolesDB.findOneAndUpdate(
      { oauthRoleId, oauthClientAppId },
      { oauthRoleId, oauthClientAppId, oauthUserIds: oauthRoleUserIds },
      { upsert: true }
    );

    res.status(200).json({ success: true, message: 'OAuth role has been successfully updated' });
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;
