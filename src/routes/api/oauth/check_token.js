const express = require('express');
const jwt = require('jsonwebtoken');
const redisCache = require('../../../database/redis.js');
const { notifyError } = require('../../../notify/notifications.js');
require('dotenv').config();

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

router.post('/', async (req, res) => {
  let access_token;

  const authorizationHeader = req.headers['authorization'];
  if (authorizationHeader && authorizationHeader.startsWith('Bearer ')) {
    access_token = authorizationHeader.split(' ')[1];
  }

  if (!access_token) {
    access_token = req.cookies.access_token;

    if (!access_token) {
      return res.status(400).json({ success: false, error: 'Access Token not provided' });
    }
  }

  try {
    jwt.verify(access_token, JWT_PUBLIC_KEY, async (error, decoded) => {
      if (error) {
        return res.status(401).json({ success: false, description: 'Access Token invalid' });
      }

      const { userId, osid } = decoded;

      try {
        const redisKey = `osid:${userId}:${osid}`;
        const session = await redisCache.keys(redisKey);
    
        if (session.length === 0) {
          res.clearCookie('access_token');
          return res.status(401).json({ success: false, error: 'Access Token is invalid' });
        }

        res.status(200).json({ success: true, description: 'Access Token is valid' });
      } catch (error) {
        notifyError(error);
        return res.status(500).json({ error: 'Something went wrong, try again later' });
      }
    });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;
