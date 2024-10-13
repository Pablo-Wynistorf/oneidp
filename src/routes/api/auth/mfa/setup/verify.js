const express = require('express');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { notifyError } = require('../../../../../notify/notifications.js');

const { userDB } = require('../../../../../database/mongodb.js');
const redisCache = require('../../../../../database/redis.js');

const router = express.Router();

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
  jwt.verify(access_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] }, async (error, decoded) => {
    if (error) {
      return res.redirect('/login');
    }
      
    const userId = decoded.userId;
    const sid = decoded.sid;

    const redisKey = `psid:${userId}:${sid}`;
    const session = await redisCache.keys(redisKey);

    if (session.length === 0) {
      res.clearCookie('access_token');
      return res.status(401).json({ success: false, error: 'Access Token is invalid' });
    }

    const userData = await userDB.findOne({ userId });

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
      return res.status(200).json({ success: true, message: 'MFA enabled' });
    } else {
      return res.status(461).json({ success: false, error: 'Invalid verification code' });
    }
  });
});


module.exports = router;