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
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

connectToDatabase();

// Verify access token
const verifyToken = (req, res, next) => {
  const access_token_cookie = req.headers.cookie;
  const requestedPath = req.baseUrl;

  if (access_token_cookie) {
    const cookies = access_token_cookie.split(';').reduce((cookiesObj, cookie) => {
      const [name, value] = cookie.trim().split('=');
      cookiesObj[name] = value;
      return cookiesObj;
    }, {});

    const access_token = cookies['access_token'];

    jwt.verify(access_token, JWT_SECRET, async (error, decoded) => {
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
        if (requestedPath !== '/home' && requestedPath !== '/home/mfa/settings' && requestedPath !== '/home/oauth/settings' && requestedPath !== '/home/oauth/settings/roles') {
          return res.redirect('/home');
        }

        const now = Math.floor(Date.now() / 1000);
        const tokenExpirationThreshold = now + (24 * 60 * 60);
        if (decoded.exp < tokenExpirationThreshold) {
          const newAccessToken = jwt.sign({ userId: userId, sid: sid }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '48h' });
          res.cookie('access_token', newAccessToken, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/'});
        }

        res.clearCookie('email_verification_token');
        res.clearCookie('password_reset_token');
        res.clearCookie('password_reset_code');
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
  const access_token_cookie = req.headers.cookie;

  if (access_token_cookie) {
    const cookies = access_token_cookie.split(';').reduce((cookiesObj, cookie) => {
      const [name, value] = cookie.trim().split('=');
      cookiesObj[name] = value;
      return cookiesObj;
    }, {});

    const access_token = cookies['access_token'];

    if (access_token) {
      return verifyToken(req, res, next);
    }
  }
  next();
};



// Redirect to /login
app.get('/', (req, res) => {
  res.redirect('/login');
});



// All express routes
app.use('/login', existingToken, express.static(path.join(__dirname, 'public/login')));
app.use('/home', verifyToken, express.static(path.join(__dirname, 'public/home')));
app.use('/register', existingToken, express.static(path.join(__dirname, 'public/register')));
app.use('/setpassword', express.static(path.join(__dirname, 'public/setpassword')));
app.use('/verify', existingToken, express.static(path.join(__dirname, 'public/verify')));
app.use('/recover', existingToken, express.static(path.join(__dirname, 'public/recover')));
app.use('/home/mfa/settings', existingToken, express.static(path.join(__dirname, 'public/mfasettings')));
app.use('/mfa', express.static(path.join(__dirname, 'public/mfa')));
app.use('/home/oauth/settings', verifyToken, express.static(path.join(__dirname, 'public/oauthsettings')));
app.use('/home/oauth/settings/roles', verifyToken, express.static(path.join(__dirname, 'public/oauthrolesettings')));


// Login to the account, if account not verified, resend verification email.
app.use('/api/sso/token/check', require('./routes/api/sso/token/check'));

// Login to the account, if account not verified, resend verification email.
app.use('/api/sso/auth/login', require('./routes/api/sso/auth/login'));

// Register as new user, store userdata in the database and send verification email
app.use('/api/sso/auth/register', require('./routes/api/sso/auth/register'));

// Verify user with verification code and token, and later generate access tokens
app.use('/api/sso/verfy', require('./routes/api/sso/verify'));

// Verify user with verification code and token with the verificationlink, and later generate access tokens
app.use('/api/sso/confirmationlink', require('./routes/api/sso/confirmationlink'));

// Convert link into usable password_reset_code and password_reset_token cookies
app.use('/api/sso/setresettokens', require('./routes/api/sso/setresettokens.js'));

// Handle password change, define new session id, store passwordhash in database and issue new access token. 
app.use('/api/sso/data/changepassword', require('./routes/api/sso/data/changepassword.js'));

// Handle logout
app.use('/api/sso/auth/logout', require('./routes/api/sso/auth/logout.js'));

// Handle logout and change session id. (Invalidate access token)
app.use('/api/sso/auth/logoutall', require('./routes/api/sso/auth/logoutall.js'));

// Make a password reset request and send recovery code. 
app.use('/api/sso/data/resetpassword', require('./routes/api/sso/data/resetpassword.js'));

// Set new password with recoverycode and recoverytoken. 
app.use('/api/sso/data/setpassword', require('./routes/api/sso/data/setpassword.js'));

// Get the mfa qr code
app.use('/api/mfa/setup', require('./routes/api/mfa/setup.js'));

// Disable MFA
app.use('/api/mfa/disable', require('./routes/api/mfa/disable.js'));

// Mfa setup verify
app.use('/api/mfa/setup/verify', require('./routes/api/mfa/setup/verify.js'));

// Verify the mfa code
app.use('/api/mfa/verify', require('./routes/api/mfa/verify.js'));

// Get oauth apps
app.use('/api/oauth/settings/get', require('./routes/api/oauth/settings/get.js'));

// Add oauth app
app.use('/api/oauth/settings/add', require('./routes/api/oauth/settings/add.js'));

// Add oauth delete app
app.use('/api/oauth/settings/delete', require('./routes/api/oauth/settings/delete.js'));

// Get oauth app roles
app.use('/api/oauth/settings/roles/get', require('./routes/api/oauth/settings/roles/get.js'));

// Add oauth app role
app.use('/api/oauth/settings/roles/add', require('./routes/api/oauth/settings/roles/add.js'));

// Delete userid from oauth app role
app.use('/api/oauth/settings/roles/update/uid', require('./routes/api/oauth/settings/roles/update/uid.js'));

// Update oauth app role
app.use('/api/oauth/settings/roles/update', require('./routes/api/oauth/settings/roles/update.js'));

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

// Check the health of the application
app.use('/api/health', require('./routes/api/health/health.js'));

// Start the api
app.listen(API_PORT, () => {
  console.log('Login API started on port', API_PORT);
});
