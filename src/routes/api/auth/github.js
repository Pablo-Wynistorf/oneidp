const express = require('express');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const jwt = require('jsonwebtoken');
const { userDB } = require('../../../database/mongodb.js');
const redisCache = require('../../../database/redis.js');

const router = express.Router();

const URL = process.env.URL;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

passport.use(new GitHubStrategy({
    clientID: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackURL: URL + '/api/auth/github/callback',
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let existingUser = await userDB.findOne({ userId: profile.id });
      let username = profile.username;
      let existingUserName = await userDB.findOne({ username: username });

      const sid = await generateRandomString(15);
      const timestamp = Math.floor(Date.now() / 1000);
      const redisKey = `psid:${profile.id}:${sid}`;
      await redisCache.hSet(redisKey, {
        identityProvider: 'github',
        createdAt: timestamp,
      });
      await redisCache.expire(redisKey, 48 * 60 * 60);

      if (!existingUser) {
        if (existingUserName) {
          username = `${username}_${generateRandomString(3)}`;
        }

        if (!profile.emails[0].value) {
          return done(new Error('No email found in your GitHub account'), null);
        }

        const newUser = new userDB({
          userId: profile.id,
          username: username,
          email: profile.emails[0].value,
          emailVerified: true,
          mfaEnabled: false,
          providerRoles: ['standardUser', 'oauthUser'],
          identityProvider: 'github',
        });

        await newUser.save();
      }

      const access_token = jwt.sign({ userId: profile.id, sid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });
      return done(null, { access_token, userId: profile.id, sid });
    } catch (error) {
      return done(error, null);
    }
  }
));

router.use(passport.initialize());

router.get('/', (req, res, next) => {
  const { redirectUri, redirect_uri } = req.query;
  
  let fullRedirectUri = '';
  let state = '';

  if (redirectUri) {
    fullRedirectUri = redirectUri;
    if (redirect_uri) {
      fullRedirectUri += '&redirect_uri=' + redirect_uri;
    }
    state = Buffer.from(fullRedirectUri).toString('base64');
  }
  
  passport.authenticate('github', {
    scope: ['user:email'],
    state: state,
  })(req, res, next);
});

router.get('/callback', passport.authenticate('github', { session: false }), async (req, res) => {
  const { access_token, userId, sid } = req.user;
  let redirectUri = req.query.state ? Buffer.from(req.query.state, 'base64').toString('utf-8') : '/dashboard';

  const device = req.headers['user-agent'];
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const platform = device.match(/(Windows|Linux|Macintosh|iPhone|iPad|Android)/i);

  const redisKey = `psid:${userId}:${sid}`;

  await redisCache.hSet(redisKey, {
    deviceType: platform ? platform[0] : 'Unknown',
    ipAddr: ip || 'Unknown',
  });

  res.cookie('access_token', access_token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });
  res.redirect(redirectUri);
});

async function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

module.exports = router;
