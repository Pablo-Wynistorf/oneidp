const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = process.env;

const { userDB, oAuthClientAppDB, oAuthRolesDB } = require('../../../../../database/database.js');

const router = express.Router();

router.post('/', async (req, res) => {
  const oauthClientAppId = req.body.oauthClientAppId;
  const access_token = req.cookies.access_token;

  if (!access_token) {
    return res.status(400).json({ success: false, error: 'Access Token not found' });
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

    const testOauthClientAppId = userData.oauthClientAppIds.includes(oauthClientAppId);

    if (!testOauthClientAppId) {
      return res.status(460).json({ error: 'User does not own this oauth app' });
    }

    await oAuthClientAppDB.deleteOne({ oauthClientAppId });
    await oAuthRolesDB.deleteMany({ oauthRoleId: { $regex: `${oauthClientAppId}-*` } });
    await userDB.updateOne(
      { userId },
      { $pull: { oauthClientAppIds: parseInt(oauthClientAppId) } }
    );

    res.status(200).json({ success: true, message: 'OAuth app has been successfully deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;
