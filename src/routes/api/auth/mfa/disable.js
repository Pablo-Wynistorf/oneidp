const express = require('express');
const jwt = require('jsonwebtoken');
const { notifyError } = require('../../../../notify/notifications.js');

const { userDB } = require('../../../../database/database.js');

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

router.post('/', async (req, res) => {
  const access_token = req.cookies.access_token;

  if (!access_token) {
    return res.status(400).json({ success: false, error: 'Access Token not found' });
  }
    jwt.verify(access_token, JWT_PUBLIC_KEY, async (error, decoded) => {
      if (error) {
        return res.redirect('/login');
      }
      
    const userId = decoded.userId;
    const sid = decoded.sid;

    const userData = await userDB.findOne({ userId: userId, sid: sid });
    if (!userData) {
      res.clearCookie('access_token');
      return res.redirect('/login');
    }
    const mfaEnabled = userData.mfaEnabled;

    if (mfaEnabled === false) {
      return res.status(462).json({ success: false, error: 'MFA is not enabled' });
    }

    await userDB.updateOne({ userId }, { $unset: { mfaSecret: 1, mfaLoginSecret: 1 } });
    await userDB.updateOne({ userId }, { $set: { mfaEnabled: false } });

    return res.status(200).json({ success: true, message: 'MFA has been successfully disabled' });
  });
});

module.exports = router;