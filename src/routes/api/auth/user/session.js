const express = require('express');
const redisCache = require('../../../../database/redis.js');
const { notifyError } = require('../../../../notify/notifications.js');
const jwt = require('jsonwebtoken');

const router = express.Router();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();


router.get('/', async (req, res) => {
  try {
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

      const sessionRedisPattern = `psid:${userId}:*`;
      const sessionKeys = await redisCache.keys(sessionRedisPattern);

      const sessions = await Promise.all(
        sessionKeys.map(async (key) => {
          const sessionData = await redisCache.hGetAll(key);
          const sessionId = key.split(':')[2];
          return { 
            sessionId, 
            currentSession: sessionId === sid ? "true" : "false",
            sessionData 
          };
        })
      );

      return res.status(200).json({ success: true, sessions });
    });
  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Application has encountered an error:', details: error.toString() });
  }
});



router.delete('/', async (req, res) => {
  try {
    const access_token = req.cookies.access_token;
    const sessionId = req.body.sessionId;

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

      const endSessionRedisPattern = `psid:${userId}:${sessionId}`;
      const endSessionSuccess =  await redisCache.del(endSessionRedisPattern);

      if (!endSessionSuccess) {
        return res.status(400).json({ success: false, error: 'Session not found' });
      }

      const getSessionRedisPattern = `psid:${userId}:*`;
      const sessionKeys = await redisCache.keys(getSessionRedisPattern);

      const sessions = await Promise.all(
        sessionKeys.map(async (key) => {
          const sessionData = await redisCache.hGetAll(key);
          key = key.split(':')[2];
          return { sessionId: key, sessionData: sessionData };
        })
      );

      return res.status(200).json({ success: true, sessions });
    });
  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Application has encountered an error:', details: error.toString() });
  }
});

module.exports = router;
