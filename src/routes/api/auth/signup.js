const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendVerificationEmail } = require('../../../utils/send-emails.js');
const { notifyError, notifyRegister } = require('../../../notify/notifications.js');


const { userDB } = require('../../../database/mongodb.js');

const redisCache = require('../../../database/redis.js');

const router = express.Router();

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

router.post('/', async (req, res) => {
  const { firstName, lastName, username, password, email } = req.body;
  const usernameRegex = /^[a-zA-Z0-9-]{3,20}$/;
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;

  if (!usernameRegex.test(username)) {
    return res.status(460).json({ success: false, error: 'Username must only contain letters, numbers, and dashes and be between 3 and 20 characters' });
  }

  if (!emailRegex.test(email)) {
    return res.status(461).json({ success: false, error: 'Invalid email address' });
  }

  const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\[\]{}|;:,.<>?])([A-Za-z\d!@#$%^&*()_+\[\]{}|;:,.<>?]{8,})$/;
  if (typeof password !== 'string' || password.length < 8 || password.length > 10000 || !passwordPattern.test(password)) {
    return res.status(462).json({ success: false, error: 'Password must have at least 8 characters, contain at least one uppercase letter, one lowercase letter, one digit, and one special character' });
  }

  try {
    let existingUsername = await userDB.findOne({ username });
    let existingEmail = await userDB.findOne({ email });

    if (existingEmail) {
      return res.status(463).json({ success: false, error: 'Email already used, try login' });
    }

    if (existingUsername) {
      return res.status(464).json({ success: false, error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let userId;
    let existingUserId;

    do {
      userId = Math.floor(Math.random() * 900000000000) + 100000000000;
      existingUserId = await userDB.findOne({ userId });
    } while (existingUserId);

    const verifySid = await generateRandomString(15);
    const timestamp = Math.floor(Date.now() / 1000);
    const redisKey = `pev:${userId}:${verifySid}`;
  
    await redisCache.hSet(redisKey, {
      createdAt: timestamp,
    })
    await redisCache.expire(redisKey, 30 * 60);

    const email_verification_token = jwt.sign({ userId, pevSid: verifySid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '30m' });

    const newUser = new userDB({
      userId: userId,
      firstName: firstName,
      lastName: lastName,
      username: username,
      password: hashedPassword,
      email: email,
      emailVerified: false,
      mfaEnabled: false,
      providerRoles: ['standardUser', 'oauthUser'],
      identityProvider: 'local',
    });

    await newUser.save();

    sendVerificationEmail(username, email, email_verification_token);

    notifyRegister(username);
    return res.redirect('/verify');
  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

async function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

module.exports = router;