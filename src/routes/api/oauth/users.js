const express = require('express');
const jwt = require('jsonwebtoken');
const { userDB } = require('../../../database/mongodb.js');
const redisCache = require('../../../database/redis.js');
const { notifyError } = require('../../../notify/notifications.js');
require('dotenv').config();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

const router = express.Router();

router.get('/search', async (req, res) => {
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

  jwt.verify(access_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] }, async (error, tokenData) => {
    if (error) {
      return res.status(401).json({ success: false, error: 'Access Token is invalid' });
    }

    const { userId, clientId, sid, osid } = tokenData;

    try {
      let redisKey;
      if (sid) {
        redisKey = `psid:${userId}:${sid}`;
      } else if (osid) {
        redisKey = `osid:${userId}:${osid}`;
      }

      const session = await redisCache.keys(redisKey);
      if (session.length === 0) {
        res.clearCookie('access_token');
        return res.status(401).json({ success: false, error: 'Access Token is invalid' });
      }

      const { query } = req.query;
      if (!query || query.trim() === "") {
        return res.status(400).json({ success: false, error: 'Search query not provided' });
      }

      const users = await userDB.find({ 
        $or: [
          { username: { $regex: query, $options: 'i' } },
          { userId: { $regex: query, $options: 'i' } }
        ]
      }).lean();

      const userName = users.map(user => user.username);

      res.status(200).json({
        success: true,
        userName
      });

    } catch (error) {
      notifyError(error);
      return res.status(500).json({ success: false, error: 'Something went wrong, try again later' });
    }
  });
});

module.exports = router;
