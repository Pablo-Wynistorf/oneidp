const express = require('express');
const jwt = require('jsonwebtoken');
const { notifyError } = require('../../../../notify/notifications.js');

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

router.get('/:email_verification_token', async (req, res) => {
  const { email_verification_token } = req.params;
  
  jwt.verify(email_verification_token, JWT_PUBLIC_KEY, async (error, decoded) => {
      if (error) {
        return res.redirect('/login');
      }

    const userId = decoded.userId;
    const pevSid  = decoded.pevSid;

    const providerEmailVerificationRedisKey = `pev:${userId}:${pevSid}`;
    const session = await redisCache.keys(providerEmailVerificationRedisKey);

    if (session.length === 0) {
      return res.redirect('/login');
    }

    await userDB.updateOne({ userId }, { $set: { emailVerified: true }});
    await redisCache.del(providerEmailVerificationRedisKey);

    const sid = await generateRandomString(15);
    const device = req.headers['user-agent'];
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const platform = device.match(/(Windows|Linux|Macintosh|iPhone|iPad|Android)/i);
    
    const timestamp = Math.floor(Date.now() / 1000);
    const redisKey = `psid:${userId}:${sid}`;
  
    await redisCache.hSet(redisKey, {
      deviceType: platform ? platform[0] : 'Unknown',
      ipAddr: ip || 'Unknown',
      createdAt: timestamp,
    })
    await redisCache.expire(redisKey, 48 * 60 * 60);

    const access_token = jwt.sign({ userId: userId, sid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });
    res.cookie('access_token', access_token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });
    return res.redirect('/dashboard');
  });
});

async function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

module.exports = router;