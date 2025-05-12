const express = require('express');
const { generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');
const jwt = require('jsonwebtoken');
const { userDB } = require('../../../database/mongodb');
const redisCache = require('../../../database/redis');
const base64url = require('base64url');

const router = express.Router();

const { URL } = process.env;

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

// Step 1: Generate Passkey Login Options
router.post('/', async (req, res) => {
  const options = generateAuthenticationOptions({
    rpID: URL.split('/')[2].split('/')[0],
    userVerification: 'preferred',
  });

  const challengeBase64url = base64url.encode(options.challenge);
  const redisKey = `webauthn:challenge:${challengeBase64url}`;

  await redisCache.set(redisKey, challengeBase64url);
  await redisCache.expire(redisKey, 60);

  res.json({
    ...options,
    challenge: challengeBase64url,
  });
});

// Step 2: Verify Passkey Assertion
router.post('/verify', async (req, res) => {
  const { response } = req.body;

  try {
    const clientDataJSON = response.response.clientDataJSON;
    const clientData = JSON.parse(Buffer.from(clientDataJSON, 'base64').toString('utf8'));
    const receivedChallenge = clientData.challenge;

    const redisKey = `webauthn:challenge:${receivedChallenge}`;
    const expectedChallenge = await redisCache.get(redisKey);

    if (!expectedChallenge) {
      return res.status(400).json({ success: false, error: 'Challenge expired or missing' });
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: URL,
      expectedRPID: URL.split('/')[2].split(':')[0],
      requireUserVerification: true,
    });

    if (!verification.verified) {
      return res.status(462).json({ success: false, error: 'Invalid passkey login' });
    }

    const { authenticationInfo } = verification;
    const { credentialID } = authenticationInfo;

    const user = await userDB.findOne({ passkeyId: credentialID.toString('base64') });
    if (!user) return res.status(462).json({ success: false, error: 'User not found' });

    user.signCount = authenticationInfo.newCounter;
    await user.save();

    const sid = await generateRandomString(15);
    const token = jwt.sign({ userId: user.userId, sid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });

    const redisSessionKey = `psid:${user.userId}:${sid}`;
    await redisCache.hSet(redisSessionKey, {
      createdAt: Math.floor(Date.now() / 1000),
      method: 'passkey',
    });
    await redisCache.expire(redisSessionKey, 48 * 60 * 60);

    await redisCache.del(redisKey); // clean up challenge

    res.cookie('access_token', token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });
    res.status(200).json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to verify passkey' });
  }
});

module.exports = router;
