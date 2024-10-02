const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

require('dotenv').config();

const { 
  connectToDatabase, 
  userDB, 
} = require('./database/database.js');

const API_PORT = process.env.API_PORT;

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
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

connectToDatabase();

// Verify access token
const verifyToken = (req, res, next) => {
  const access_token = req.cookies.access_token;
  const requestedPath = req.baseUrl;

  if (access_token) {
    jwt.verify(access_token, JWT_PUBLIC_KEY, async (error, decoded) => {
      if (error) {
        res.clearCookie('access_token');
        if (requestedPath !== '/login') {
          return res.redirect('/login');
        }
        return next();
      }

      const userId = decoded.userId;
      const sid = decoded.sid;

      try {
        const userData = await userDB.findOne({ userId: userId, sid: sid });
        if (!userData) {
          res.clearCookie('access_token');
          return res.redirect('/login');
        }

        const now = Math.floor(Date.now() / 1000);
        const tokenExpirationThreshold = now + (24 * 60 * 60);
        if (decoded.exp < tokenExpirationThreshold) {
          const newAccessToken = jwt.sign({ userId: userId, sid: sid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });
          res.cookie('access_token', newAccessToken, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/'});
        }

        res.clearCookie('email_verification_token');
        res.clearCookie('password_reset_token');
        res.clearCookie('password_reset_code');

        if (requestedPath === '/login' || requestedPath === '/signup' || requestedPath === '/recovery' || requestedPath === '/setpassword' || requestedPath === '/verify' || requestedPath === '/') {
          return res.redirect('/dashboard');
        }

        next();
      } catch (error) {
        res.clearCookie('access_token');
        return res.redirect('/login');
      }
    });
  } else {
    return res.redirect('/login');
  }
};


// Handle existing access token
const existingToken = (req, res, next) => {
  const access_token = req.cookies.access_token;
    if (access_token) {
      return verifyToken(req, res, next);
    }
  next();
};


// All express routes
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/', existingToken, express.static(path.join(__dirname, 'public/homepage')));
app.use('/impressum', express.static(path.join(__dirname, 'public/impressum')));
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

// Login to the account, if account not verified, resend verification email.
app.use('/api/auth/token/check', require('./routes/api/auth/token/check.js'));

// Login to the account, if account not verified, resend verification email.
app.use('/api/auth/login', require('./routes/api/auth/login.js'));

// Register as new user, store userdata in the database and send verification email
app.use('/api/auth/signup', require('./routes/api/auth/signup.js'));

// Continue with google
app.use('/api/auth/google', require('./routes/api/auth/google.js'));

// Continue with github
app.use('/api/auth/github', require('./routes/api/auth/github.js'));

// Handle logout
app.use('/api/auth/logout', require('./routes/api/auth/logout.js'));

// Handle logout and change session id. (Invalidate access token)
app.use('/api/auth/logoutall', require('./routes/api/auth/logoutall.js'));

// Verify the mfa code
app.use('/api/auth/mfa/verify', require('./routes/api/auth/mfa/verify.js'));

// Get the mfa qr code
app.use('/api/auth/mfa/setup', require('./routes/api/auth/mfa/setup.js'));

// Mfa setup verify
app.use('/api/auth/mfa/setup/verify', require('./routes/api/auth/mfa/setup/verify.js'));

// Disable MFA
app.use('/api/auth/mfa/disable', require('./routes/api/auth/mfa/disable.js'));



// Verify user with verification code and token, and later generate access tokens
app.use('/api/auth/user/verify', require('./routes/api/auth/user/verify.js'));

// Verify user with verification code and token with the verificationlink, and later generate access tokens
app.use('/api/auth/user/confirmationlink', require('./routes/api/auth/user/confirmationlink.js'));

// Convert link into usable password_reset_code and password_reset_token cookies
app.use('/api/auth/user/setresettokens', require('./routes/api/auth/user/setresettokens.js'));

// Handle password change, define new session id, store passwordhash in database and issue new access token. 
app.use('/api/auth/user/changepassword', require('./routes/api/auth/user/changepassword.js'));

// Make a password reset request and send recovery code. 
app.use('/api/auth/user/resetpassword', require('./routes/api/auth/user/resetpassword.js'));

// Set new password with recoverycode and recoverytoken. 
app.use('/api/auth/user/setpassword', require('./routes/api/auth/user/setpassword.js'));



// Get oauth apps
app.use('/api/oauth/settings/apps/get', require('./routes/api/oauth/settings/apps/get.js'));

// Add oauth app
app.use('/api/oauth/settings/apps/add', require('./routes/api/oauth/settings/apps/add.js'));

// Add oauth delete app
app.use('/api/oauth/settings/apps/delete', require('./routes/api/oauth/settings/apps/delete.js'));

// Get oauth app roles
app.use('/api/oauth/settings/roles/get', require('./routes/api/oauth/settings/roles/get.js'));

// Get oauth app role users
app.use('/api/oauth/settings/roles/get-users', require('./routes/api/oauth/settings/roles/get-users.js'));

// Add oauth app role
app.use('/api/oauth/settings/roles/add', require('./routes/api/oauth/settings/roles/add.js'));

// Delete userids from oauth app role
app.use('/api/oauth/settings/roles/update/remove-user', require('./routes/api/oauth/settings/roles/update/remove-user.js'));

// Add userid to oauth app role
app.use('/api/oauth/settings/roles/update/add-user', require('./routes/api/oauth/settings/roles/update/add-user.js'));

// Add userid to oauth app role
app.use('/api/oauth/settings/roles/update/bulk-update', require('./routes/api/oauth/settings/roles/update/bulk-update.js'));

// Delete oauth app role
app.use('/api/oauth/settings/roles/delete', require('./routes/api/oauth/settings/roles/delete.js'));

// Oauth2 authorize endpoint
app.use('/api/oauth/authorize', require('./routes/api/oauth/authorize.js'));

// Oauth Token endpoint
app.use('/api/oauth/token', require('./routes/api/oauth/token.js'));

// Added userinfo endpoint
app.use('/api/oauth/userinfo', require('./routes/api/oauth/userinfo.js'));

// Added check_token endpoint
app.use('/api/oauth/check_token', require('./routes/api/oauth/check_token.js'));

// OIDC Discovery endpoint
app.use('/.well-known/openid-configuration', require('./routes/api/oauth/openid-info.js'));

// jwks Discovery endpoint
app.use('/.well-known/jwks.json', require('./routes/api/oauth/jwks-info.js'));

// Check the health of the application
app.use('/api/health', require('./routes/api/health/health.js'));

// Check details of the application
app.use('/api/health/details', require('./routes/api/health/details.js'));

// Start the api
app.listen(API_PORT, () => {
  console.log('Login API started on port', API_PORT);
});