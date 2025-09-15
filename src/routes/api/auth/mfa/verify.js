const express = require('express');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { notifyLogin, notifyError } = require('../../../../notify/notifications');

const { userDB } = require('../../../../database/mongodb.js');
const redisCache = require('../../../../database/redis.js');

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
  const { mfaVerifyCode } = req.body;

  const mfa_token = req.cookies.mfa_token;

  if (!mfa_token) {
    return res.status(462).json({ success: false, error: 'MFA token not found' });
  }

    jwt.verify(mfa_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] }, async (error, decoded) => {
      if (error) {
        return res.status(463).json({ success: false, error: 'MFA token is invalid' });
      }

    const userId = decoded.userId;
    const mfaSid = decoded.mfaSid;

    const redisKey = `pmfa:${userId}:${mfaSid}`;
    const session = await redisCache.keys(redisKey);

    if (session.length === 0) {
      res.clearCookie('mfa_token');
      return res.status(463).json({ success: false, error: 'MFA Token is invalid' });
    }

    const userData = await userDB.findOne({ userId });

    const mfaSecret = userData.mfaSecret;
    const username = userData.username;

    const verified = speakeasy.totp.verify({
      secret: mfaSecret,
      encoding: 'base64',
      token: mfaVerifyCode,
      window: 2
    });

    if (verified) {

      const sid = await generateRandomString(15);
      const device = req.headers['user-agent'];
      const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      const platform = device.match(/(Windows|Linux|Macintosh|iPhone|iPad|Android)/i);
      
      const timestamp = Math.floor(Date.now() / 1000);
      const redisKey = `psid:${userId}:${sid}`;
      const redisMfaKey = `pmfa:${userId}:${mfaSid}`;

      await redisCache.del(redisMfaKey);
    
      await redisCache.hSet(redisKey, {
        deviceType: platform ? platform[0] : 'Unknown',
        ipAddr: ip || 'Unknown',
        createdAt: timestamp,
      })
      await redisCache.expire(redisKey, 14 * 24 * 60 * 60 * 1000);


      const token = jwt.sign({ userId: userId, sid: sid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '14d' });
      notifyLogin(username);
      res.cookie('access_token', token, { maxAge: 14 * 24 * 60 * 60 * 1000, httpOnly: true, path: '/' });
      res.clearCookie('mfa_token');
      return res.status(200).json({ success: true });
    } else {
      return res.status(461).json({ success: false, error: 'Invalid verification code' });
    }
  });
});

async function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

module.exports = router;
