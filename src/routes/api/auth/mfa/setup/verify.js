const express = require('express');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { notifyError } = require('../../../../../notify/notifications.js');

const { userDB } = require('../../../../../database/database.js');

const router = express.Router();

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

router.post('/', async (req, res) => {
  const mfaVerifyCode = req.body.mfaVerifyCode;

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

      const access_token = jwt.sign({ userId: userId, sid: newsid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });
      res.cookie('access_token', access_token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });

      return res.status(200).json({ success: true, message: 'MFA enabled' });
    } else {
      return res.status(461).json({ success: false, error: 'Invalid verification code' });
    }
  });
});

module.exports = router;