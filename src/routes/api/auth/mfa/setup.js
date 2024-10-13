const express = require('express');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const { userDB } = require('../../../../database/mongodb.js');
const redisCache = require('../../../../database/redis.js');

const router = express.Router();

const URL = process.env.URL;

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
    const email = userData.email;
    const identityProvider = userData.identityProvider;

    if (identityProvider !== 'local') {
      return res.status(460).json({ success: false, error: 'MFA is only available for users with local authentication' });
    }

    if (mfaEnabled === true) {
      return res.status(460).json({ success: false, error: 'User has MFA already enabled' });
    }

    const mfaSecret = speakeasy.generateSecret({ length: 20 });

    await userDB.updateOne({ userId }, { $set: { mfaSecret: mfaSecret.ascii } });

    const qrCodeUrl = speakeasy.otpauthURL({
      secret: mfaSecret.ascii,
      label: email,
      issuer: URL,
      encoding: 'base64'
    });

    const mfaActivationCode = qrCodeUrl.split('secret=')[1].split('&')[0];

    qrcode.toDataURL(qrCodeUrl, (err, imageUrl) => {
      if (err) {
        res.status(500).json({ error: 'Something went wrong, try again later' });
      } else {
        res.status(200).json({ success: true, imageUrl, mfaActivationCode });
      }
    });
  });
});

module.exports = router;