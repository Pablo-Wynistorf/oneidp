const express = require('express');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { notifyLogin, notifyError } = require('../../../../notify/notifications');

const { userDB } = require('../../../../database/database.js');

const router = express.Router();

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

router.post('/', async (req, res) => {
  const { mfaVerifyCode, redirectUri } = req.body;

  const mfa_token = req.cookies.mfa_token;

  if (!mfa_token) {
    return res.status(462).json({ success: false, error: 'Access Token not found' });
  }

  try {
    const decoded = jwt.verify(mfa_token, JWT_PRIVATE_KEY);
    const userId = decoded.userId;
    const mfaLoginSecret = decoded.mfaLoginSecret;
    const userData = await userDB.findOne({ userId: userId, mfaLoginSecret: mfaLoginSecret });

    if (!userData) {
      res.clearCookie('mfa_token');
      return res.redirect('/login');
    }

    const mfaEnabled = userData.mfaEnabled;
    const mfaSecret = userData.mfaSecret;
    const sid = userData.sid;
    const username = userData.username;

    if (mfaEnabled !== true) {
      return res.status(460).json({ error: 'User has MFA not enabled' });
    }

    const verified = speakeasy.totp.verify({
      secret: mfaSecret,
      encoding: 'base64',
      token: mfaVerifyCode,
      window: 2
    });

    if (verified) {
      const token = jwt.sign({ userId: userId, sid: sid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });
      notifyLogin(username);
      res.cookie('access_token', token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });
      res.clearCookie('mfa_token');
      return res.status(200).json({ success: true, redirectUri });
    } else {
      return res.status(461).json({ success: false, error: 'Invalid verification code' });
    }
  } catch (error) {
    notifyError(error);
    return res.status(460).json({ error: 'User has MFA not enabled' });
  }
});

module.exports = router;