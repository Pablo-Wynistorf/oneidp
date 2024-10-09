const express = require('express');
const jwt = require('jsonwebtoken');
const { notifyError } = require('../../../notify/notifications');

const redisCache = require('../../../database/redis.js');

const router = express.Router();

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
    jwt.verify(access_token, JWT_PUBLIC_KEY, async (error, decoded) => {
      if (error) {
        return res.redirect('/login');
      }
      
    const userId = decoded.userId;
    const sid = decoded.sid;

    const redisKey = `psid:${userId}:${sid}`;
    const session = await redisCache.hGetAll(redisKey);

    if (!session) {
      res.clearCookie('access_token');
      return res.status(401).json({ success: false, error: 'Access Token is invalid' });
    }

    await clearUserSessions(userId);

    res.clearCookie('access_token');
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
        return;
      }
  } catch (error) {
      console.error('Error removing sessions:', error);
  }
};

module.exports = router;