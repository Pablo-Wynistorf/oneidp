const express = require('express');
const jwt = require('jsonwebtoken');
const { sendRecoveryEmail } = require('../../../../utils/send-emails.js');
const { notifyError } = require('../../../../notify/notifications.js');


const { userDB } = require('../../../../database/postgres.js');
const redisCache = require('../../../../database/redis.js');

const router = express.Router();

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

router.post('/', async (req, res) => {
  const { email } = req.body;

  try {
    const userData = await userDB.findOne({ email, identityProvider: 'local' });
    if (!userData) {
      return res.status(404).json({ success: false, error: 'No account with this email' });
    }
    
    if (!userData.emailVerified) {
      return res.status(400).json({ success: false, error: 'Email not verified' });
    }

    const userId = userData.userId;
    const username = userData.username;

    await endUserSessions(userId);

    const resetSid = await generateRandomString(15);
    const timestamp = Math.floor(Date.now() / 1000);
    const redisKey = `ppr:${userId}:${resetSid}`;

    await redisCache.hSet(redisKey, {
      createdAt: timestamp,
    })
    await redisCache.expire(redisKey, 30 * 60);

    const password_reset_token = jwt.sign({ userId, pprSid: resetSid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '30m' });

    try {
      sendRecoveryEmail(username, email, password_reset_token, res);
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to send password reset email' });
    }
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;


async function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

async function endUserSessions(userId) {
  const redisKeyPattern = `*:${userId}:*`;
  
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