import express from 'express';
import passport from 'passport';
import GoogleStrategyModule from 'passport-google-oauth20';
const GoogleStrategy = GoogleStrategyModule.Strategy;
import jwt from 'jsonwebtoken';
import { userDB } from '../../../database/mongodb.mjs';
import redisCache from '../../../database/redis.mjs';
import { isBanned } from '../../../utils/account-status.mjs';
import { getSettings, isEmailDomainAllowed } from '../../../utils/app-settings.mjs';
import { isAdminEmail } from '../../../utils/admin-auth.mjs';

const router = express.Router();

const URL = process.env.URL;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

// Only register the strategy when credentials are provided. Otherwise the app
// would crash on startup (passport throws if clientID is missing).
const googleConfigured = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

if (googleConfigured) {
passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: URL + '/api/auth/google/callback',
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let userId;
      let existingUserId;
      const settings = await getSettings();
      let existingUser = await userDB.findOne({ identityProviderUserId: profile.id });
      let username = profile.emails[0].value.split('@')[0];
      let existingUserName = await userDB.findOne({ username: username });

      // `done(null, false, info)` is a clean authentication failure rather than
      // a server error, so the callback can turn it into a message on /login.
      if (existingUser && isBanned(existingUser)) {
        return done(null, false, { reason: 'banned' });
      }

      if (existingUser && settings.maintenanceMode && !isAdminEmail(existingUser.email)) {
        return done(null, false, { reason: 'maintenance' });
      }

      if (!existingUser) {
        // Signing in with a provider for the first time creates an account, so
        // it is subject to the same registration gates as the signup form.
        if (!settings.registrationEnabled) {
          return done(null, false, { reason: 'registration_closed' });
        }

        if (!isEmailDomainAllowed(profile.emails[0].value, settings.allowedEmailDomains)) {
          return done(null, false, { reason: 'domain_not_allowed' });
        }

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
          banned: false,
          providerRoles: [],
          canManageApps: false,
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
      await redisCache.expire(redisKey, 14 * 24 * 60 * 60);

      const access_token = jwt.sign({ userId, sid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '14d' });
      return done(null, { access_token, userId, sid });
    } catch (error) {
      return done(error, null);
    }
  }
));
}

router.use(passport.initialize());

router.get('/', async (req, res, next) => {
  if (!googleConfigured) {
    return res.status(503).json({ error: 'Google login is not configured on this server.' });
  }

  // Refuse before starting the handshake, so a disabled provider never sends
  // the visitor to Google only to reject them on the way back.
  const settings = await getSettings();
  if (!settings.socialLoginEnabled) {
    return res.redirect('/login?error=social_disabled');
  }

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


/**
 * A custom passport callback is used so a refusal from the strategy (banned
 * account, closed registration, disallowed domain) becomes a readable message
 * on the login page instead of a generic 500 from the Express error handler.
 */
router.get('/callback', (req, res, next) => {
  if (!googleConfigured) {
    return res.status(503).json({ error: 'Google login is not configured on this server.' });
  }

  passport.authenticate('google', { session: false }, (error, user, info) => {
    if (error) return next(error);
    if (!user) {
      const reason = info?.reason || 'social_failed';
      return res.redirect(`/login?error=${encodeURIComponent(reason)}`);
    }
    req.user = user;
    return next();
  })(req, res, next);
}, async (req, res) => {
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

  res.cookie('access_token', access_token, { maxAge: 14 * 24 * 60 * 60 * 1000, httpOnly: true, path: '/' });
  res.redirect(redirectUri);
});

async function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

export default router;
