const express = require('express');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const jwt = require('jsonwebtoken');
const { userDB } = require('../../../database/database.js');

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
      const newSid = await generateRandomString(15);

      if (!existingUser) {
        if (existingUserName) {
          username = `${username}_${generateRandomString(3)}`;
        }
        
        const newUser = new userDB({
          userId: profile.id,
          username: username,
          sid: newSid,
          email: profile.emails[0].value,
          emailVerified: true,
          mfaEnabled: false,
          providerRoles: ['standardUser', 'oauthUser'],
          identityProvider: 'github',
        });

        await newUser.save();
      }

      const access_token = await jwt.sign({ userId: profile.id, sid: existingUser ? existingUser.sid : newSid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });

      return done(null, { access_token });
    } catch (error) {
      return done(error, null);
    }
  }
));

router.use(passport.initialize());

router.get('/', passport.authenticate('github', { scope: ['user:email'] }));

router.get('/callback', passport.authenticate('github', { session: false }), (req, res) => {
  const { access_token } = req.user;
  res.cookie('access_token', access_token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });
  res.redirect('/dashboard');
});

const generateRandomString = length => [...Array(length)].map(() => Math.random().toString(36)[2]).join('');

module.exports = router;