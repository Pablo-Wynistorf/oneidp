const express = require('express');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { JWT_SECRET } = process.env;
const { notifyError } = require('../../../../../notify/notifications.js');

const { userDB } = require('../../../../../database/database.js');

const router = express.Router();

router.post('/', async (req, res) => {
  const mfaVerifyCode = req.body.mfaVerifyCode;

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
    const mfaEnabled = userData.mfaEnabled;
    const mfaSecret = userData.mfaSecret;

    if (mfaEnabled === true) {
      return res.status(460).json({ error: 'User has MFA already enabled' });
    }

    const verified = speakeasy.totp.verify({
      secret: mfaSecret,
      encoding: 'base64',
      token: mfaVerifyCode,
      window: 2
    });

    if (verified) {
      await userDB.updateOne({ userId }, { $set: { mfaEnabled: true } });

      const newsid = [...Array(15)].map(() => Math.random().toString(36)[2]).join('');
      await userDB.updateOne({ userId: userId, sid: sid }, { $set: { sid: newsid } });

      const token = jwt.sign({ userId: userId, sid: newsid }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '48h' });
      res.cookie('access_token', token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });

      return res.status(200).json({ success: true, message: 'MFA enabled' });
    } else {
      return res.status(461).json({ success: false, error: 'Invalid verification code' });
    }
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;