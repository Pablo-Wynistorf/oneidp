const express = require('express');
const jwt = require('jsonwebtoken');
const { notifyError } = require('../../../../notify/notifications.js');

const { userDB } = require('../../../../database/mongodb.js');
const redisCache = require('../../../../database/redis.js');

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

    const userData = await userDB.findOne({ userId });

    const passkeyEnabled = userData.passkeyId ? true : false;

    if (passkeyEnabled === false) {
      return res.status(462).json({ success: false, error: 'No passkey found' });
    }

    await userDB.updateOne({ userId }, { $unset: { passkeyId: 1, passkeyPublicKey: 1, signCount: 1 } });

    return res.status(200).json({ success: true, message: 'Passkey has been deleted successfully' });
  });
});

module.exports = router;