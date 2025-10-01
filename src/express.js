const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

require('dotenv').config();

const { connectToDatabase } = require('./database/mongodb.js');

const redisCache = require('./database/redis.js');

const rateLimiter = require('./utils/rate-limiter.js');

const API_PORT = process.env.API_PORT;
const URL = process.env.URL;

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

const JWT_PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
${process.env.JWT_PUBLIC_KEY}
-----END PUBLIC KEY-----
`.trim();

const app = express();

const corsOptions = {
  origin: [URL]
};

app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

connectToDatabase();

// Function to check if a route is public
const isPublicRoute = (path) => {
  const publicRoutes = ['/', '/login/', '/signup/', '/recovery/', '/setpassword/', '/verify/'];
  return publicRoutes.includes(path.split('?')[0]);
};

// Middleware to verify access token
const verifyToken = async (req, res, next) => {
  const access_token = req.cookies.access_token;
  const requestedPath = req.originalUrl;

  if (!access_token) {
    return handleUnauthenticated(req, res, next, requestedPath);
  }

  try {
    const decoded = jwt.verify(access_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] });

    const userId = decoded.userId;
    const sid = decoded.sid;
    const exp = decoded.exp;

    await handleTokenRenewalIfNeeded(userId, sid, exp, req, res);

    clearSensitiveCookies(res);

    if (isPublicRoute(requestedPath)) {
      return res.redirect('/dashboard');
    }

    next();
  } catch (error) {
    return handleUnauthenticated(req, res, next, requestedPath);
  }
};

// Function to handle token renewal
const handleTokenRenewalIfNeeded = async (userId, sid, exp, req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const tokenExpirationThreshold = now + (3 * 24 * 60 * 60);

  if (exp < tokenExpirationThreshold) {

    const oldRedisKey = `psid:${userId}:${sid}`;
    await redisCache.del(oldRedisKey);

    const timestamp = Math.floor(Date.now() / 1000);
    const device = req.headers['user-agent'];
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const platform = device.match(/(Windows|Linux|Macintosh|iPhone|iPad|Android)/i);

    const newSid = await generateRandomString(15);
    const newRedisKey = `psid:${userId}:${newSid}`;

    await redisCache.hSet(newRedisKey, {
      deviceType: platform[0],
      ipAddr: ip,
      createdAt: timestamp,
    })

    await redisCache.expire(newRedisKey, 14 * 24 * 60 * 60);
    const newAccessToken = jwt.sign({ userId, sid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '14d' });
    res.cookie('access_token', newAccessToken, { maxAge: 14 * 24 * 60 * 60 * 1000, httpOnly: true, path: '/' });
  }
};

// Function to clear sensitive cookies
const clearSensitiveCookies = (res) => {
  res.clearCookie('email_verification_token');
  res.clearCookie('password_reset_token');
  res.clearCookie('password_reset_code');
};

// Handle unauthenticated users
const handleUnauthenticated = (req, res, next, requestedPath) => {
  res.clearCookie('access_token');
  if (isPublicRoute(requestedPath)) {
    return next();
  }
  return res.redirect('/login');
};

// Middleware to check if an access token exists
const existingToken = (req, res, next) => {
  const access_token = req.cookies.access_token;
  if (access_token) {
    return verifyToken(req, res, next);
  }
  next();
};

// Express routes
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/imprint', express.static(path.join(__dirname, 'public/imprint')));
app.use('/privacy-policy', express.static(path.join(__dirname, 'public/privacy-policy')));
app.use('/login', existingToken, express.static(path.join(__dirname, 'public/login')));
app.use('/dashboard', verifyToken, express.static(path.join(__dirname, 'public/dashboard')));
app.use('/settings', verifyToken, express.static(path.join(__dirname, 'public/settings')));
app.use('/signup', existingToken, express.static(path.join(__dirname, 'public/signup')));
app.use('/setpassword', express.static(path.join(__dirname, 'public/setpassword')));
app.use('/verify', existingToken, express.static(path.join(__dirname, 'public/verify')));
app.use('/recovery', existingToken, express.static(path.join(__dirname, 'public/recovery')));
app.use('/mfa', express.static(path.join(__dirname, 'public/mfa')));
app.use('/oidc/apps', verifyToken, express.static(path.join(__dirname, 'public/oidc/apps')));
app.use('/oidc/roles', verifyToken, express.static(path.join(__dirname, 'public/oidc/roles')));


// Authentication Endpoints
app.use('/api/auth/token/check', require('./routes/api/auth/token/check.js')); // 60 requests per minute
app.use('/api/auth/login', require('./routes/api/auth/login.js')); // 60 requests per minute
app.use('/api/auth/signup', require('./routes/api/auth/signup.js')); // 10 requests per minute
app.use('/api/auth/google', require('./routes/api/auth/google.js')); // 10 requests per minute
app.use('/api/auth/github', require('./routes/api/auth/github.js')); // 10 requests per minute
app.use('/api/auth/logout', require('./routes/api/auth/logout.js')); // 10 requests per minute
app.use('/api/auth/logoutall', require('./routes/api/auth/logoutall.js')); // 10 requests per minute
app.use('/api/auth/passkey', require('./routes/api/auth/passkey.js')); // 10 requests per minute
app.use('/api/auth/passkey/setup', require('./routes/api/auth/passkey/setup.js')); // 10 requests per minute
app.use('/api/auth/passkey/delete', require('./routes/api/auth/passkey/delete.js')); // 10 requests per minute
app.use('/api/auth/mfa/verify', require('./routes/api/auth/mfa/verify.js')); // 10 requests per minute
app.use('/api/auth/mfa/setup', require('./routes/api/auth/mfa/setup.js')); // 5 requests per minute
app.use('/api/auth/mfa/setup/verify', require('./routes/api/auth/mfa/setup/verify.js')); // 5 requests per minute
app.use('/api/auth/mfa/disable', require('./routes/api/auth/mfa/disable.js')); // 5 requests per minute
app.use('/api/auth/user/confirmationlink', require('./routes/api/auth/user/confirmationlink.js')); // 5 requests per minute
app.use('/api/auth/user/exchange-signup-token', require('./routes/api/auth/user/exchangeSignupToken.js')); // 5 requests per minute
app.use('/api/auth/user/setresettoken', require('./routes/api/auth/user/setresettoken.js')); // 5 requests per minute
app.use('/api/auth/user/changepassword', require('./routes/api/auth/user/changepassword.js')); // 5 requests per minute
app.use('/api/auth/user/resetpassword', require('./routes/api/auth/user/resetpassword.js')); // 1 request per 60 seconds
app.use('/api/auth/user/setpassword', require('./routes/api/auth/user/setpassword.js')); // 5 requests per minute
app.use('/api/auth/user/session', require('./routes/api/auth/user/session.js')); // 20 requests per minute

// OAuth Settings Endpoints
app.use('/api/oauth/settings/apps/get', require('./routes/api/oauth/settings/apps/get.js')); // 60 requests per minute
app.use('/api/oauth/settings/apps/add', require('./routes/api/oauth/settings/apps/add.js')); // 10 requests per minute
app.use('/api/oauth/settings/apps/delete', require('./routes/api/oauth/settings/apps/delete.js')); // 10 requests per minute
app.use('/api/oauth/settings/apps/edit', require('./routes/api/oauth/settings/apps/edit.js')); // 10 requests per minute
app.use('/api/oauth/settings/roles/get', require('./routes/api/oauth/settings/roles/get.js')); // 20 requests per minute
app.use('/api/oauth/settings/roles/get-users', require('./routes/api/oauth/settings/roles/get-users.js')); // 10 requests per minute
app.use('/api/oauth/settings/roles/add', require('./routes/api/oauth/settings/roles/add.js')); // 10 requests per minute
app.use('/api/oauth/settings/roles/update/remove-user', require('./routes/api/oauth/settings/roles/update/remove-user.js')); // 30 requests per minute
app.use('/api/oauth/settings/roles/update/add-user', require('./routes/api/oauth/settings/roles/update/add-user.js')); // 30 requests per minute
app.use('/api/oauth/settings/roles/update/bulk-update', require('./routes/api/oauth/settings/roles/update/bulk-update.js')); // 10 requests per minute
app.use('/api/oauth/settings/roles/delete', require('./routes/api/oauth/settings/roles/delete.js')); // 10 requests per minute

// OAuth Endpoints
app.use('/api/oauth/authorize', require('./routes/api/oauth/authorize.js')); // 5 requests per second
app.use('/api/oauth/token', require('./routes/api/oauth/token.js')); // 5 requests per second
app.use('/api/oauth/userinfo', require('./routes/api/oauth/userinfo.js')); // 50 requests per second
app.use('/api/oauth/users', require('./routes/api/oauth/users.js')); // 30 requests per minute
app.use('/api/oauth/check_token', require('./routes/api/oauth/check_token.js')); // 60 requests per 10 seconds
app.use('/api/oauth/logout', require('./routes/api/oauth/logout.js')); // 60 requests per minute
app.use('/api/oauth/revoke', require('./routes/api/oauth/revoke.js')); // 60 requests per minute

// OIDC Discovery Endpoints
app.use('/.well-known/openid-configuration', require('./routes/api/oauth/openid-configuration.js')); // No limit (public endpoint)
app.use('/.well-known/jwks.json', require('./routes/api/oauth/jwks-info.js')); // No limit (public endpoint)

// Health Check Endpoints
app.use('/api/health', require('./routes/api/health/health.js')); // No limit (public endpoint)
app.use('/api/health/details', require('./routes/api/health/details.js')); // 10 requests per minute

// Google Analytics Endpoint
app.use('/gtag.js', require('./utils/gtag.js'));

// Serve the homepage
app.use('/', existingToken, express.static(path.join(__dirname, 'public/homepage')));

// Generate a random String
async function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

// Start the api
app.listen(API_PORT, () => {
  console.log('ONEIDP started on port', API_PORT);
});
