const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const { userDB } = require('../../../database/database.js');

const router = express.Router();

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
    callbackURL: '/api/auth/google/callback',
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let existingUser = await userDB.findOne({ userId: profile.id });
      let username = profile.emails[0].value.split('@')[0];
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
            identityProvider: 'google',
          });
      
        await newUser.save();
      }

      if (existingUser) {
        const access_token = await jwt.sign({ userId: profile.id, sid: existingUser.sid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });
        return done(null, { access_token });
      }

      const access_token = await jwt.sign({ userId: profile.id, sid: newSid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });


      return done(null, { access_token });
    } catch (error) {
      return done(error, null);
    }
  }
));

router.use(passport.initialize());

router.get('/', passport.authenticate('google', { scope: ['email', 'profile'] }));

router.get('/callback', passport.authenticate('google', { session: false }), (req, res) => {
  const { access_token } = req.user;
    res.cookie('access_token', access_token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });
    res.redirect('/dashboard');
});


const generateRandomString = length => [...Array(length)].map(() => Math.random().toString(36)[2]).join('');

module.exports = router;
