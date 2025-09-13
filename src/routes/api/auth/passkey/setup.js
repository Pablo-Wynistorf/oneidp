const express = require('express');
const jwt = require('jsonwebtoken');
const { generateRegistrationOptions, verifyRegistrationResponse } = require('@simplewebauthn/server');
const redisCache = require('../../../../database/redis');
const { userDB } = require('../../../../database/mongodb');

const router = express.Router();

const { DOMAIN, URL } = process.env;

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

router.post('/generate', async (req, res) => {
  const access_token = req.cookies.access_token;

  if (!access_token) {
    return res.status(400).json({ success: false, error: 'Access Token not found' });
  }

  try {
    const decoded = jwt.verify(access_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] });
    const userId = decoded.userId;
    const sid = decoded.sid;

    const redisKey = `psid:${userId}:${sid}`;
    const sessionExists = await redisCache.exists(redisKey);

    if (!sessionExists) {
      res.clearCookie('access_token');
      return res.status(401).json({ success: false, error: 'Access Token is invalid' });
    }

    const user = await userDB.findOne({ userId: userId, identityProvider: 'local' });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const options = await generateRegistrationOptions({
      rpName: 'Oneidp',
      rpID: DOMAIN,
      userID: user.userId,
      userName: user.username,
      userDisplayName: user.username,
      timeout: 60000,
      attestationType: 'none',
      authenticatorSelection: {
        userVerification: 'preferred',
        residentKey: 'preferred',
      },
    });

    await redisCache.set(`webauthn:register:challenge:${user.username}`, options.challenge);
    await redisCache.expire(`webauthn:register:challenge:${user.username}`, 300);

    res.json(options);
  } catch (error) {
    console.error('JWT Verification failed:', error);
    return res.redirect('/login');
  }
});

router.post('/verify', async (req, res) => {
  const { response } = req.body;
  const access_token = req.cookies.access_token;

  const decoded = jwt.verify(access_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] });
  const userId = decoded.userId;
  const sid = decoded.sid;

  const redisKey = `psid:${userId}:${sid}`;
  const sessionExists = await redisCache.exists(redisKey);

  if (!sessionExists) {
    res.clearCookie('access_token');
    return res.status(401).json({ success: false, error: 'Access Token is invalid' });
  }

  const user = await userDB.findOne({ userId: userId, identityProvider: 'local' });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const expectedChallenge = await redisCache.get(`webauthn:register:challenge:${user.username}`);
  if (!expectedChallenge) return res.status(400).json({ error: 'Challenge expired' });

  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: URL,
      expectedRPID: DOMAIN,
      requireUserVerification: false,
    })

    const { verified, registrationInfo } = verification;
    if (!verified) return res.status(462).json({ success: false, error: 'Invalid registration' });

    const { publicKey, id, counter } = registrationInfo.credential;

    user.passkeyPublicKey = Buffer.from(publicKey).toString('base64');
    user.passkeyId = Buffer.from(id).toString('base64');
    user.signCount = counter;

    await user.save();

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Verification failed:', err);
    return res.status(500).json({ error: 'Passkey registration failed' });
  }
});

module.exports = router;
