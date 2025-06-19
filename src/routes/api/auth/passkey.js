const express = require('express');
const { generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');
const jwt = require('jsonwebtoken');
const { userDB } = require('../../../database/mongodb');
const redisCache = require('../../../database/redis');
const base64url = require('base64url');

const router = express.Router();

const { DOMAIN, URL } = process.env;

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

router.post('/', async (req, res) => {
  const options = await generateAuthenticationOptions({
    rpID: DOMAIN,
    userVerification: 'preferred',
    residentKey: 'preferred',
  });

  const challengeString = Buffer.from(options.challenge).toString('base64url');
  const redisKey = `webauthn:challenge:${challengeString}`;

  await redisCache.set(redisKey, challengeString);
  await redisCache.expire(redisKey, 60);

  res.json({
    ...options,
    challenge: challengeString,
  });
});



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

    const rawId = response.rawId;
    const rawIdBase64 = base64url.encode(rawId);

    const rawIdBuffer = Buffer.from(rawIdBase64, 'base64');
    const credentialIDBase64 = rawIdBuffer.toString('base64');

    const user = await userDB.findOne({ passkeyId: credentialIDBase64 });
    if (!user) return res.status(462).json({ success: false, error: 'User not found' });

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: URL,
      expectedRPID: DOMAIN,
      requireUserVerification: true,
      credential: {
        id: user.passkeyId,
        publicKey: Buffer.from(user.passkeyPublicKey, 'base64'),
        counter: user.signCount,
      },
    });


    if (!verification.verified) {
      return res.status(462).json({ success: false, error: 'Invalid passkey login' });
    }

    user.signCount = verification.authenticationInfo.newCounter;
    await user.save();

    const sid = await generateRandomString(15);
    const device = req.headers['user-agent'];
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const platform = device.match(/(Windows|Linux|Macintosh|iPhone|iPad|Android)/i);

    const timestamp = Math.floor(Date.now() / 1000);
    const redisSessionKey = `psid:${user.userId}:${sid}`;

    await redisCache.hSet(redisSessionKey, {
      deviceType: platform ? platform[0] : 'Unknown',
      ipAddr: ip || 'Unknown',
      createdAt: timestamp,
    })
    await redisCache.expire(redisSessionKey, 48 * 60 * 60);

    await redisCache.del(redisKey);
    const access_token = jwt.sign({ userId: user.userId, sid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });
    res.cookie('access_token', access_token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to verify passkey' });
  }
});



module.exports = router;
