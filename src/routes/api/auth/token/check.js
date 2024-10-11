const express = require('express');
const jwt = require('jsonwebtoken');

const redisCache = require('../../../../database/redis.js');

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

router.post('/', async (req, res) => {
  const { access_token } = req.body;
  jwt.verify(access_token, JWT_PUBLIC_KEY, async (error, decoded) => {
    if (error) {
      res.clearCookie('access_token');
      return res.status(401).json({ success: false, error: 'Access Token is invalid' });
    }

    const userId = decoded.userId;
    const sid = decoded.sid;

    try {
      const redisKey = `psid:${userId}:${sid}`;
      const session = await redisCache.keys(redisKey);
  
      if (session.length === 0) {
        res.clearCookie('access_token');
        return res.status(401).json({ success: false, error: 'Access Token is invalid' });
      }


      res.clearCookie('email_verification_token');
      res.clearCookie('password_reset_token');
      res.clearCookie('password_reset_code');
      res.status(200).json({ success: true, message: 'Access Token valid' });
    } catch (error) {
      res.clearCookie('access_token');
      return res.redirect('/login');
    }
  });
});

module.exports = router;
