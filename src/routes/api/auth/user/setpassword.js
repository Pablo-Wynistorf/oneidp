const express = require('express');
const bcrypt = require('bcryptjs');
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

router.post('/', async (req, res) => {
  const { password } = req.body;

  const password_reset_token = req.cookies.password_reset_token;

  if (!password_reset_token) {
    return res.status(461).json({ success: false, error: 'Reset Token not found' });
  }

  try {

    const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\[\]{}|;:,.<>?])([A-Za-z\d!@#$%^&*()_+\[\]{}|;:,.<>?]{8,})$/;
    if (typeof password !== 'string' || password.length < 8 || password.length > 10000 || !passwordPattern.test(password)) {
      return res.status(460).json({ success: false, error: 'Password must have at least 8 characters, contain at least one uppercase letter, one lowercase letter, one digit, and one special character' });
    }

    jwt.verify(password_reset_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] }, async (error, decoded) => {
      if (error) {
        res.clearCookie('password_reset_token');
        return res.status(461).json({ success: false, error: 'Reset token invalid' });
      }

      const userId = decoded.userId;
      const pprSid = decoded.pprSid;

      const providerPasswordResetRedisKey = `ppr:${userId}:${pprSid}`;
      const session = await redisCache.keys(providerPasswordResetRedisKey);
  
      if (session.length === 0) {
        res.clearCookie('password_reset_token');
        return res.status(461).json({ success: false, error: 'Reset token invalid' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      await redisCache.del(providerPasswordResetRedisKey);

      const sid = await generateRandomString(15);
      const device = req.headers['user-agent'];
      const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      const platform = device.match(/(Windows|Linux|Macintosh|iPhone|iPad|Android)/i);
      
      const timestamp = Math.floor(Date.now() / 1000);
      const redisKey = `psid:${userId}:${sid}`;
    
      await redisCache.hSet(redisKey, {
        deviceType: platform[0],
        ipAddr: ip,
        createdAt: timestamp,
      })
      await redisCache.expire(redisKey, 48 * 60 * 60);


      await userDB.updateOne({ userId }, { $set: { password: hashedPassword } });
      const access_token = jwt.sign({ userId: userId, sid: sid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });
      res.clearCookie('password_reset_token');
      res.cookie('access_token', access_token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });
      res.status(200).json({ success: true });
    });

  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

async function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

module.exports = router;