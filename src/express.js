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

// Function to check if a route is a static asset
const isStaticAsset = (path) => {
  const staticExtensions = ['.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico'];
  return staticExtensions.some(ext => path.endsWith(ext));
};

// Middleware to verify access token
const verifyToken = async (req, res, next) => {
  const access_token = req.cookies.access_token;
  const requestedPath = req.originalUrl;

  if (isStaticAsset(requestedPath)) {
    return next();
  }

  if (!access_token) {
    return handleUnauthenticated(req, res, next, requestedPath);
  }

  try {
    const decoded = jwt.verify(access_token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] });

    const userId = decoded.userId;
    const sid = decoded.sid;
    const exp = decoded.exp;

    const redisKey = `psid:${userId}:${sid}`;
    const session = await redisCache.keys(redisKey);

    if (session.length === 0) {
      return handleUnauthenticated(req, res, next, requestedPath);
    }

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
  const tokenExpirationThreshold = now + (24 * 60 * 60);

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

    await redisCache.expire(newRedisKey, 48 * 60 * 60);
    const newAccessToken = jwt.sign({ userId, sid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });
    res.cookie('access_token', newAccessToken, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });
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
app.use('/', existingToken, express.static(path.join(__dirname, 'public/homepage')));
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
app.use('/api/auth/token/check', rateLimiter(20, 60 * 1000), require('./routes/api/auth/token/check.js')); // 20 requests per minute
app.use('/api/auth/login', rateLimiter(10, 60 * 1000), require('./routes/api/auth/login.js')); // 10 requests per minute
app.use('/api/auth/signup', rateLimiter(5, 60 * 1000), require('./routes/api/auth/signup.js')); // 5 requests per minute
app.use('/api/auth/google', rateLimiter(10, 60 * 1000), require('./routes/api/auth/google.js')); // 10 requests per minute
app.use('/api/auth/github', rateLimiter(10, 60 * 1000), require('./routes/api/auth/github.js')); // 10 requests per minute
app.use('/api/auth/logout', rateLimiter(10, 60 * 1000), require('./routes/api/auth/logout.js')); // 10 requests per minute
app.use('/api/auth/logoutall', rateLimiter(10, 60 * 1000), require('./routes/api/auth/logoutall.js')); // 10 requests per minute
app.use('/api/auth/mfa/verify', rateLimiter(10, 60 * 1000), require('./routes/api/auth/mfa/verify.js')); // 10 requests per minute
app.use('/api/auth/mfa/setup', rateLimiter(5, 60 * 1000), require('./routes/api/auth/mfa/setup.js')); // 5 requests per minute
app.use('/api/auth/mfa/setup/verify', rateLimiter(5, 60 * 1000), require('./routes/api/auth/mfa/setup/verify.js')); // 5 requests per minute
app.use('/api/auth/mfa/disable', rateLimiter(5, 60 * 1000), require('./routes/api/auth/mfa/disable.js')); // 5 requests per minute
app.use('/api/auth/user/confirmationlink', rateLimiter(5, 60 * 1000), require('./routes/api/auth/user/confirmationlink.js')); // 5 requests per minute
app.use('/api/auth/user/setresettoken', rateLimiter(5, 60 * 1000), require('./routes/api/auth/user/setresettoken.js')); // 5 requests per minute
app.use('/api/auth/user/changepassword', rateLimiter(5, 60 * 1000), require('./routes/api/auth/user/changepassword.js')); // 5 requests per minute
app.use('/api/auth/user/resetpassword', rateLimiter(1, 60 * 1000), require('./routes/api/auth/user/resetpassword.js')); // 1 request per 60 seconds
app.use('/api/auth/user/setpassword', rateLimiter(5, 60 * 1000), require('./routes/api/auth/user/setpassword.js')); // 5 requests per minute
app.use('/api/auth/user/session', rateLimiter(20, 60 * 1000), require('./routes/api/auth/user/session.js')); // 20 requests per minute

// OAuth Settings Endpoints
app.use('/api/oauth/settings/apps/get', rateLimiter(30, 60 * 1000), require('./routes/api/oauth/settings/apps/get.js')); // 20 requests per minute
app.use('/api/oauth/settings/apps/add', rateLimiter(10, 60 * 1000), require('./routes/api/oauth/settings/apps/add.js')); // 10 requests per minute
app.use('/api/oauth/settings/apps/delete', rateLimiter(10, 60 * 1000), require('./routes/api/oauth/settings/apps/delete.js')); // 10 requests per minute
app.use('/api/oauth/settings/apps/edit', rateLimiter(10, 60 * 1000), require('./routes/api/oauth/settings/apps/edit.js')); // 10 requests per minute
app.use('/api/oauth/settings/roles/get', rateLimiter(30, 60 * 1000), require('./routes/api/oauth/settings/roles/get.js')); // 20 requests per minute
app.use('/api/oauth/settings/roles/get-users', rateLimiter(10, 60 * 1000), require('./routes/api/oauth/settings/roles/get-users.js')); // 10 requests per minute
app.use('/api/oauth/settings/roles/add', rateLimiter(10, 60 * 1000), require('./routes/api/oauth/settings/roles/add.js')); // 10 requests per minute
app.use('/api/oauth/settings/roles/update/remove-user', rateLimiter(30, 60 * 1000), require('./routes/api/oauth/settings/roles/update/remove-user.js')); // 30 requests per minute
app.use('/api/oauth/settings/roles/update/add-user', rateLimiter(30, 60 * 1000), require('./routes/api/oauth/settings/roles/update/add-user.js')); // 30 requests per minute
app.use('/api/oauth/settings/roles/update/bulk-update', rateLimiter(10, 60 * 1000), require('./routes/api/oauth/settings/roles/update/bulk-update.js')); // 10 requests per minute
app.use('/api/oauth/settings/roles/delete', rateLimiter(10, 60 * 1000), require('./routes/api/oauth/settings/roles/delete.js')); // 10 requests per minute

// OAuth Endpoints
app.use('/api/oauth/authorize', rateLimiter(1, 1000), require('./routes/api/oauth/authorize.js')); // 1 request per second
app.use('/api/oauth/token', rateLimiter(1, 1000), require('./routes/api/oauth/token.js')); // 1 request per second
app.use('/api/oauth/userinfo', rateLimiter(30, 60 * 1000), require('./routes/api/oauth/userinfo.js')); // 30 requests per minute
app.use('/api/oauth/check_token', rateLimiter(20, 60 * 1000), require('./routes/api/oauth/check_token.js')); // 20 requests per minute
app.use('/api/oauth/logout', rateLimiter(10, 60 * 1000), require('./routes/api/oauth/logout.js')); // 10 requests per minute
app.use('/api/oauth/revoke', rateLimiter(10, 60 * 1000), require('./routes/api/oauth/revoke.js')); // 10 requests per minute

// OIDC Discovery Endpoints
app.use('/.well-known/openid-configuration', require('./routes/api/oauth/openid-configuration.js')); // No limit (public endpoint)
app.use('/.well-known/jwks.json', require('./routes/api/oauth/jwks-info.js')); // No limit (public endpoint)

// Health Check Endpoints
app.use('/api/health', require('./routes/api/health/health.js')); // No limit (public endpoint)
app.use('/api/health/details', rateLimiter(10, 60 * 1000), require('./routes/api/health/details.js')); // 10 requests per minute


// Generate a random String
async function generateRandomString(length) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

// Start the api
app.listen(API_PORT, () => {
  console.log('Login API started on port', API_PORT);
});