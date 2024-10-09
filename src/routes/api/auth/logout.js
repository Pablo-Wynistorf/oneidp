const express = require('express');
const jwt = require('jsonwebtoken');
const redisCache = require('../../../database/redis.js');

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

router.post('/', (req, res) => {
  const access_token = req.cookies.access_token;

  if (!access_token) {
    res.clearCookie('access_token');
    return res.status(200).json({ success: true });
  }

  jwt.verify(access_token, JWT_PUBLIC_KEY, async (error, decoded) => {
    if (error) {
      res.clearCookie('access_token');
      return res.status(200).json({ success: true });
    }

    const { userId, sid } = decoded;

    await endUserSession(userId, sid);
  });

  res.clearCookie('access_token');
  return res.status(200).json({ success: true });
});

async function endUserSession(userId, sid) {
  const redisKeyPattern = `psid:${userId}:${sid}`;
  
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


module.exports = router;