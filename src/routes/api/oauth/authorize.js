const express = require('express');
const jwt = require('jsonwebtoken');
const { oAuthClientAppDB } = require('../../../database/mongodb.js');
const redisCache = require('../../../database/redis.js');
const { notifyError } = require('../../../notify/notifications.js');

const router = express.Router();

const URL = process.env.URL;

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

router.get('/', async (req, res) => {
  const { client_id, redirect_uri, state, nonce, code_challenge_method, code_challenge } = req.query;
  const access_token = req.cookies.access_token;
  let scope = req.query.scope;

  try {

    if (!access_token || access_token === 'undefined') {
      return res.redirect(`/login?redirectUri=${URL + req.originalUrl}`);
    }

    if (!client_id || client_id === 'undefined') {
      return res.status(400).json({ error: 'Invalid Request', error_description: 'No client_id provided' });
    }

    if (!redirect_uri || redirect_uri === 'undefined') {
      return res.status(400).json({ error: 'Invalid Request', error_description: 'No redirect_uri provided' });
    }    

    if (!scope || scope === 'undefined') {
      scope = 'openid';
    }

    const requestedScopes = scope.split(' ');
    const allowedScopes = ['openid', 'profile', 'email', 'offline_access'];

    const invalidScopes = requestedScopes.filter(s => !allowedScopes.includes(s));
    if (invalidScopes.length > 0) {
      return res.status(400).json({
        error: 'Invalid Request',
        error_description: `Invalid scope(s) provided: ${invalidScopes.join(', ')}`
      });
    }

    jwt.verify(access_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] }, async (error, decoded) => {

      if (error) {
        return res.redirect(`/login?redirectUri=${URL + req.originalUrl}`);
      }

      const { userId, sid } = decoded;

      const redisKey = `psid:${userId}:${sid}`;
      const session = await redisCache.keys(redisKey);
  
      if (session.length === 0) {
        return res.redirect(`/login?redirectUri=${URL + req.originalUrl}`);
      }

      const oauth_client = await oAuthClientAppDB.findOne({ clientId: client_id });

      if (!oauth_client) {
        return res.status(401).json({ error: 'Invalid Request', error_description: 'Invalid client_id provided' });
      }

      const allowed_redirect_uri = oauth_client.redirectUri;

      if (redirect_uri !== allowed_redirect_uri) {
        return res.status(405).json({ error: 'Invalid Request', error_description: 'Provided redirect_uri not allowed' });
      }
      
      const authorizationCode = await generateRandomString(32);

      const authorizationRedisKey = `ac:${authorizationCode}`;
      
      await redisCache.hSet(authorizationRedisKey, Object.fromEntries(
        Object.entries({
          userId: userId,
          nonce: nonce,
          codeChallenge: code_challenge,
          codeChallengeMethod: code_challenge_method,
          redirectUri: redirect_uri,
          scope: scope
        }).filter(([_, value]) => value !== undefined)
      ));

      await redisCache.expire(authorizationRedisKey, 20);

      if (!state || state === 'undefined') {
        const redirectUri = `${redirect_uri}?code=${authorizationCode}`;
        return res.redirect(redirectUri);
      }
    
      const redirectUri = `${redirect_uri}?code=${authorizationCode}&state=${state}`;
      return res.redirect(redirectUri);
    });
  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Server Error', error_description: 'Something went wrong on our site. Please try again later' });
  }
});

async function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

module.exports = router;
