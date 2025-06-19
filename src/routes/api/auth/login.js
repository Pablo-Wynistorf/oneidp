const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendVerificationEmail } = require('../../../utils/send-emails.js');
const { notifyError, notifyLogin } = require('../../../notify/notifications');

const { userDB } = require('../../../database/mongodb.js');
const redisCache = require('../../../database/redis.js');

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

const router = express.Router();

router.post('/', async (req, res) => {
  const { username_or_email, password } = req.body;
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;

  try {
    const user = await userDB.findOne(
      emailRegex.test(username_or_email) ? { email: username_or_email, identityProvider: 'local' } : { username: username_or_email, identityProvider: 'local' }
    );

    if (!user || !(bcrypt.compare(password, user.password))) {
      return res.status(462).json({ success: false, error: 'Invalid username or password' });
    }

    if (!user.emailVerified) {
      return handleUnverifiedEmail(user, res);
    }

    await handleLoginSuccess(user, req, res);
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

const handleUnverifiedEmail = async (user, res) => {
  const verifySid = await generateRandomString(15);
  const timestamp = Math.floor(Date.now() / 1000);
  const oldRedisKey = `pev:${user.userId}:*`;
  const redisKey = `pev:${user.userId}:${verifySid}`;

  const oldEmailVerifcationKeys = await redisCache.keys(oldRedisKey);

  if (oldEmailVerifcationKeys.length > 0) {
    await redisCache.del(oldEmailVerifcationKeys);
  }

  await redisCache.hSet(redisKey, {
    createdAt: timestamp,
  })

  await redisCache.expire(redisKey, 30 * 60);

  const email_verification_token = jwt.sign({ userId: user.userId, pevSid: verifySid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '30m' });

  sendVerificationEmail(user.username, user.email, email_verification_token);

  const signup_token = jwt.sign(
    { userId: user.userId },
    JWT_PRIVATE_KEY,
    { algorithm: 'RS256', expiresIn: '29m' }
  );

  res.cookie('signup_token', signup_token, {
    maxAge: 29 * 60 * 1000,
    httpOnly: true,
    path: '/',
  });

  return res.status(461).json({
    success: false, 
    error: 'Email not yet verified',
    email: user.email,
    message: 'A verification email has been sent. Please check your inbox.',
  });
};


const handleLoginSuccess = async (user, req, res) => {
  const { userId, username, mfaEnabled } = user;

  if (mfaEnabled) {
    return handleMfaEnabled(userId, res);
  }

  notifyLogin(username);

  const sid = await generateRandomString(15);
  const device = req.headers['user-agent'];
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const platform = device.match(/(Windows|Linux|Macintosh|iPhone|iPad|Android)/i);

  const timestamp = Math.floor(Date.now() / 1000);
  const redisKey = `psid:${userId}:${sid}`;

  await redisCache.hSet(redisKey, {
    deviceType: platform ? platform[0] : 'Unknown',
    ipAddr: ip || 'Unknown',
    createdAt: timestamp,
  })
  await redisCache.expire(redisKey, 48 * 60 * 60);

  const access_token = jwt.sign({ userId, sid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });
  res.cookie('access_token', access_token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });

  return res.status(200).json({ success: true });
};



const handleMfaEnabled = async (userId, res) => {
  const mfaSid = await generateRandomString(15);

  const timestamp = Math.floor(Date.now() / 1000);
  const oldRedisKey = `pmfa:${userId}:*`;
  const redisKey = `pmfa:${userId}:${mfaSid}`;

  const oldMfaKey = await redisCache.keys(oldRedisKey);

  if (oldMfaKey.length > 0) {
    await redisCache.del(oldMfaKey);
  }

  await redisCache.hSet(redisKey, {
    createdAt: timestamp,
  })

  await redisCache.expire(redisKey, 5 * 60);


  const mfaToken = jwt.sign({ userId, mfaSid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '5m' });
  res.cookie('mfa_token', mfaToken, { maxAge: 5 * 60 * 1000, httpOnly: true, path: '/' });

  const response = { success: true, message: 'Redirecting to MFA site' };
  return res.status(463).json(response);
};

async function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}


module.exports = router;