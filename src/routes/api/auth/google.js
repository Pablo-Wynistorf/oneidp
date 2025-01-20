const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const { userDB } = require('../../../database/mongodb.js');
const redisCache = require('../../../database/redis.js');

const router = express.Router();

const URL = process.env.URL;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: URL + '/api/auth/google/callback',
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let userId;
      let existingUserId;
      let existingUser = await userDB.findOne({ identityProviderUserId: profile.id });
      let username = profile.emails[0].value.split('@')[0];
      let existingUserName = await userDB.findOne({ username: username });

      if (!existingUser) {
        if (existingUserName) {
          username = `${username}_${generateRandomString(3)}`;
        }

        if (!profile.emails[0].value) {
          return done(new Error('No email found in your Google account'), null);
        }
    
        do {
          userId = Math.floor(Math.random() * 900000000000) + 100000000000;
          existingUserId = await userDB.findOne({ userId });
        } while (existingUserId);

        const firstName = profile.name?.givenName || 'N/A';
        const lastName = profile.name?.familyName || 'N/A';
        
        const newUser = new userDB({
          userId: userId,
          username: username,
          firstName: firstName || 'N/A',
          lastName: lastName || 'N/A',
          email: profile.emails[0].value,
          emailVerified: true,
          mfaEnabled: false,
          providerRoles: ['standardUser', 'oauthUser'],
          identityProvider: 'google',
          identityProviderUserId: profile.id,
        });
      
        await newUser.save();
      }

      userId = existingUser ? existingUser.userId : userId;

      const sid = await generateRandomString(15);
      const timestamp = Math.floor(Date.now() / 1000);
      const redisKey = `psid:${userId}:${sid}`;
      await redisCache.hSet(redisKey, {
        identityProvider: 'google',
        createdAt: timestamp,
      });
      await redisCache.expire(redisKey, 48 * 60 * 60);

      const access_token = jwt.sign({ userId, sid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });
      return done(null, { access_token, userId, sid });
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
  
  passport.authenticate('google', {
    scope: ['email', 'profile'],
    state: state,
  })(req, res, next);
});


router.get('/callback', passport.authenticate('google', { session: false }), async (req, res) => {
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
