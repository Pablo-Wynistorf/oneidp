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
  const { currentPassword, newPassword } = req.body;
  const access_token = req.cookies.access_token;

  if (!access_token) {
    return res.status(400).json({ success: false, error: 'Access Token not found' });
  }

  const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\[\]{}|;:,.<>?])([A-Za-z\d!@#$%^&*()_+\[\]{}|;:,.<>?]{8,})$/;
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 10000 || !passwordPattern.test(newPassword)) {
    return res.status(460).json({ success: false, error: 'Password must have at least 8 characters, contain at least one uppercase letter, one lowercase letter, one digit, and one special character' });
  }

  jwt.verify(access_token, JWT_PUBLIC_KEY, async (error, decoded) => {
    if (error) {
      return res.redirect('/login');
    }
      
    const userId = decoded.userId;
    const sid = decoded.sid;

    const redisKey = `psid:${userId}:${sid}`;
    const session = await redisCache.hGetAll(redisKey);

    if (Object.keys(session).length === 0) {
      res.clearCookie('access_token');
      return res.status(401).json({ success: false, error: 'Access Token is invalid' });
    }

    const userData = await userDB.findOne({ userId });

    if (userData.identityProvider !== 'local') {
      return res.status(460).json({ success: false, error: 'Password can only be changed for users with local authentication' });
    }

    const passwordMatch = await bcrypt.compare(currentPassword, userData.password);
    if (!passwordMatch) {
      return res.status(461).json({ success: false, error: 'Incorrect current Password' });
    }


    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await userDB.updateOne({ userId }, { $set: { password: hashedPassword } });

    await clearUserSessions(userId);

    const newSid = await generateRandomString(15);
    const device = req.headers['user-agent'];
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const platform = device.match(/(Windows|Linux|Macintosh|iPhone|iPad|Android)/i);
    
    const timestamp = Math.floor(Date.now() / 1000);
    const newredisKey = `psid:${userId}:${newSid}`;
  
    await redisCache.hSet(newredisKey, {
      deviceType: platform[0],
      ipAddr: ip,
      createdAt: timestamp,
    })
    await redisCache.expire(newredisKey, 48 * 60 * 60);
    

    const newAccessToken = jwt.sign({ userId: userId, sid: newSid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });

    res.cookie('access_token', newAccessToken, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });
    res.status(200).json({ success: true });
  });
});

async function clearUserSessions(userId) {
  const redisKeyPattern = `psid:${userId}:*`;
  
  try {
      const sessions = await redisCache.keys(redisKeyPattern);
      
      if (sessions.length > 0) {
          await redisCache.del(sessions);
      } else {
      }
  } catch (error) {
      console.error('Error removing sessions:', error);
  }
};

async function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

module.exports = router;