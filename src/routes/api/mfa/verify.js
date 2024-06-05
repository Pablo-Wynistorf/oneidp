const express = require('express');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { JWT_SECRET } = process.env;
const { notifyLogin, notifyError } = require('../../../notify/notifications');

const { userDB } = require('../../../database/database.js');

const router = express.Router();

router.post('/', async (req, res) => {
  const { mfaVerifyCode, redirectUri } = req.body;

  const req_cookies = req.headers.cookie;

  if (!req_cookies) {
    return res.status(462).json({ success: false, error: 'Access Token not found' });
  }

  const cookies = req_cookies.split(';').reduce((cookiesObj, cookie) => {
    const [name, value] = cookie.trim().split('=');
    cookiesObj[name] = value;
    return cookiesObj;
  }, {});

  const mfa_token = cookies['mfa_token'];

  try {
    const decoded = jwt.verify(mfa_token, JWT_SECRET);
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
      const token = jwt.sign({ userId: userId, sid: sid }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '48h' });
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