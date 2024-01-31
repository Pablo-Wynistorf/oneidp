const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const mailjet = require('node-mailjet');
const path = require('path');
require('dotenv').config();

const URL = process.env.URL;
const DATABASE_URI = process.env.DATABASE_URI;
const API_PORT = process.env.API_PORT;
const JWT_SECRET = process.env.JWT_SECRET;
const MJ_APIKEY_PUBLIC = process.env.MJ_APIKEY_PUBLIC;
const MJ_APIKEY_PRIVATE = process.env.MJ_APIKEY_PRIVATE;
const MJ_SENDER_EMAIL = process.env.MJ_SENDER_EMAIL;
const DC_MONITORING_WEBHOOK_URL = process.env.DC_MONITORING_WEBHOOK_URL;

const app = express();


function connectToDatabase() {
  mongoose.connect(DATABASE_URI);
}
const db = mongoose.connection;

connectToDatabase();

db.on('error', () => {
  console.log('MongoDB connection error. Reconnecting...');
  setTimeout(connectToDatabase, 5000);
});

db.on('disconnected', () => {
  console.log('MongoDB disconnected. Reconnecting...');
  setTimeout(connectToDatabase, 5000);
  return;
});

db.on('connected', () => {
  console.log('Connected to MongoDB');
});

const { Schema } = mongoose;

const userSchema = new Schema({
  userId: String,
  username: String,
  password: String,
  email: String,
  loginHash: String,
  verifyCode: String,
  resetCode: String,
  twoFaCode: String,
  twoFaEnbled: Boolean,
  accountRole: String,
}, {
  timestamps: true
});

const userDB = mongoose.model('users', userSchema);

app.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    connectToDatabase();
  }
  next();
});

const authLoginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: 'Too many requests. Please try again later.',
});

const authRegisterLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  message: 'Too many requests. Please try again later.',
});


app.use(cors({ origin: '*' }));

app.use(bodyParser.json());


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

    jwt.verify(access_token, JWT_SECRET, async (err, decoded) => {
      if (err) {
        res.clearCookie('access_token');
        if (requestedPath !== '/login') {
          return res.redirect('/login');
        }
        return next();
      }

      const userId = decoded.userId;
      const loginHash = decoded.loginHash;

      try {
        const userData = await userDB.findOne({ userId: userId, loginHash: loginHash });
        if (!userData) {
          res.clearCookie('access_token');
          return res.redirect('/login');
        }

        if (requestedPath !== '/home') {
          return res.redirect('/home');
        }
        next();
      } catch (error) {
        console.error('Error:', error);
        res.clearCookie('access_token');
        return res.redirect('/login');
      }
    });
  } else {
    return res.redirect('/login');
  }
};


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

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.use('/login', existingToken, express.static(path.join(__dirname, 'public/login')));
app.use('/home', verifyToken, express.static(path.join(__dirname, 'public/home')));
app.use('/register', existingToken, express.static(path.join(__dirname, 'public/register')));
app.use('/setpassword', express.static(path.join(__dirname, 'public/setpassword')));
app.use('/verify', express.static(path.join(__dirname, 'public/verify')));
app.use('/recover', existingToken, express.static(path.join(__dirname, 'public/recover')));




app.post('/api/sso/auth/login', authLoginLimiter, async (req, res) => {
  const { username_or_email, password } = req.body;
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;

  try {
    let user;

    if (emailRegex.test(username_or_email)) {
      user = await userDB.findOne({ email: username_or_email });
    } else {
      user = await userDB.findOne({ username: username_or_email });
    }

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    const storedPasswordHash = user.password;
    const userId = user.userId;
    const email_verification_code = user.verifyCode;
    const username = user.username;
    const email = user.email;
    const loginHash = user.loginHash;

    const passwordMatch = await bcrypt.compare(password, storedPasswordHash);

    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    if (email_verification_code) {
      const email_verification_token = jwt.sign({ userId: userId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1d' });

      const new_email_verification_code = Math.floor(100000 + Math.random() * 900000).toString();
      await userDB.updateOne({ userId }, { $set: { verifyCode: new_email_verification_code } });

      res.cookie('email_verification_token', email_verification_token, { maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
      res.status(461).json({ success: true, Message: 'Email not verified' });
      sendVerificationEmail(username, email, email_verification_token, new_email_verification_code, res);
    } else {
      loginSuccess(userId, username, email, loginHash, res);
    }
  } catch (error) {
    console.error('Database error:', error);
    notifyError();
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});


function sendVerificationEmail(username, email, email_verification_token, new_email_verification_code, res) {
  const mailjetConnect = mailjet.apiConnect(MJ_APIKEY_PUBLIC, MJ_APIKEY_PRIVATE);
  const request = mailjetConnect
    .post('send', { version: 'v3.1' })
    .request({
      Messages: [
        {
          From: {
            Email: MJ_SENDER_EMAIL
          },
          To: [
            {
              Email: email
            }
          ],
          Subject: "Your Email Verification Code",
          HtmlPart: `
          <!doctype html>
          <html>
          <head>
            <title></title>
            <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
            <style type="text/css">
              body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
              p { display: block; margin: 13px 0; }
            </style>
          </head>
          <body style="background: #F9F9F9;">
            <div style="background-color: #F9F9F9;">
              <div style="margin: 0px auto; max-width: 640px; background: transparent;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="font-size: 0px; width: 100%; background: transparent;" align="center" border="0">
                  <tbody>
                    <tr>
                      <td style="text-align: center; vertical-align: top; direction: ltr; font-size: 0px; padding: 40px 0px;">
                        <div aria-labelledby="mj-column-per-100" class="mj-column-per-100" style="vertical-align: top; display: inline-block; direction: ltr; font-size: 13px; text-align: left; width: 100%;">
                          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">
                            <tbody>
                              <tr>
                                <td style="word-break: break-word; font-size: 0px; padding: 0px;" align="center">
                                  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border-spacing: 0px;" align="center" border="0">
                                    <tbody>
                                      <tr>
                                        <td style="width: 138px;"></td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style="max-width: 640px; margin: 0 auto; box-shadow: 0px 1px 5px rgba(0, 0, 0, 0.1); border-radius: 8px; overflow: hidden;">
                <div style="margin: 0px auto; max-width: 640px; background: #ffffff;">
                  <table role="presentation" cellpadding="0" cellspacing="0" style="font-size: 0px; width: 100%; background: #ffffff;" align="center" border="0">
                    <tbody>
                      <tr>
                        <td style="text-align: center; vertical-align: top; direction: ltr; font-size: 0px; padding: 40px 50px;">
                          <div aria-labelledby="mj-column-per-100" class="mj-column-per-100" style="vertical-align: top; display: inline-block; direction: ltr; font-size: 13px; text-align: left; width: 100%;">
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">
                              <tbody>
                                <tr>
                                  <td style="word-break: break-word; font-size: 0px; padding: 0px;" align="left">
                                    <div style="cursor: auto; color: #737F8D; font-family: Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif; font-size: 16px; line-height: 24px; text-align: left;">
                                      <h2 style="font-family: Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif; font-weight: 500; font-size: 20px; color: #4F545C; letter-spacing: 0.27px;">Hey ${username},</h2>
                                      <p>Your account email needs to get verified before you can use your account. Don't share this code with anyone! Please enter the following code or click on this <a href=${URL}/api/sso/confirmationlink/${email_verification_token}/${new_email_verification_code}>Link</a> to verify your email:</p>
                                    </div>
                                  </td>
                                </tr>
                                <tr>
                                  <td style="word-break: break-word; font-size: 0px; padding: 10px 25px; padding-top: 20px;" align="center">
                                    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: separate;" align="center" border="0">
                                      <tbody>
                                        <tr>
                                          <td style="border: none; border-radius: 8px; cursor: auto; padding: 15px 105px;" align="center" valign="middle" bgcolor="#5865f2">
                                            <p style="font-size: 30px; font-family: Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif;">${new_email_verification_code}</p>
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div style="margin: 0px auto; max-width: 640px; background: transparent;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="font-size: 0px; width: 100%; background: transparent;" align="center" border="0">
                  <tbody>
                    <tr>
                      <td style="text-align: center; vertical-align: top; direction: ltr; font-size: 0px; padding: 20px 0px;">
                        <div aria-labelledby="mj-column-per-100" class="mj-column-per-100" style="vertical-align: top; display: inline-block; direction: ltr; font-size: 13px; text-align: left; width: 100%;">
                          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">
                            <tbody>
                              <tr>
                                <td style="word-break: break-word; font-size: 0px; padding: 0px;" align="center">
                                  <div style="cursor: auto; color: #99AAB5; font-family: Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif; font-size: 12px; line-height: 24px; text-align: center;">
                                    Sent by Onedns
                                  </div>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </body>
          </html>
          `
        }
      ]
    });
  request.then(() => {
  }).catch((err) => {
    console.error('Error sending verification email:', err);
    notifyError();
  });
}

async function loginSuccess(userId, username, email, loginHash, res) {
  if (!loginHash) {
    const newLoginHash = [...Array(15)].map(() => Math.random().toString(36)[2]).join('');

    const token = jwt.sign({userId: userId, loginHash: newLoginHash}, JWT_SECRET, { algorithm: 'HS256', expiresIn: '12h' });
    await userDB.updateOne({ userId }, { $set: { loginHash: newLoginHash } });

    notifyLogin(username, email);
    res.cookie('access_token', token, { maxAge: 12 * 60 * 60 * 1000, path: '/' });
    return res.status(200).json({ success: true });
  }

  const token = jwt.sign({userId: userId, loginHash: loginHash}, JWT_SECRET, { algorithm: 'HS256', expiresIn: '12h' });
  notifyLogin(username, email);
  res.cookie('access_token', token, { maxAge: 12 * 60 * 60 * 1000, path: '/' });
  return res.status(200).json({ success: true });
}



function notifyError() {
  const params = {
    content: "ALERT: DATABASE ERROR!!"
  };
  fetch(DC_MONITORING_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  }).catch((err) => {
    console.error('Error notifying about database error:', err);
  });
}

function notifyLogin(username, email) {
  const params = {
    content: `User with Username or Email: ${username} has just logged in!`
  };
  fetch(DC_MONITORING_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  }).catch((err) => {
    console.error('Error notifying about successful login:', err);
  });
}

app.post('/api/sso/auth/register', authRegisterLimiter, async (req, res) => {
  const { username, password, email } = req.body;
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
  const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&.()/^])([A-Za-z\d@$!%*?&.]{8,})$/;

  if (!emailRegex.test(email)) {
    return res.status(466).json({ success: false, error: 'Invalid email address' });
  }

  if (!passwordPattern.test(password)) {
    return res.status(467).json({ success: false, error: 'Password doesn\'t meet our requirements' });
  }

  if (typeof password !== 'string' || password.length < 8) {
    return res.status(465).json({ success: false, error: 'Password must have at least 8 characters' });
  }

  if (typeof password !== 'string' || password.length > 23) {
    return res.status(464).json({ success: false, error: 'Password must not have more than 23 characters' });
  }

  if (typeof username !== 'string' || username.length > 20) {
    return res.status(463).json({ success: false, error: 'Username cannot have more than 20 characters' });
  }

  try {
    let userId;
    let existingUser;

    do {
      userId = Math.floor(Math.random() * 900000) + 100000;
      existingUser = await userDB.findOne({ userId });
    } while (existingUser);

    const hashedPassword = await bcrypt.hash(password, 10);

    const loginHash = [...Array(15)].map(() => Math.random().toString(36)[2]).join('');

    const email_verification_token = jwt.sign({ userId: userId, loginHash: loginHash }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1d' });
    const email_verification_code = Math.floor(100000 + Math.random() * 900000).toString();

    const newUser = new userDB({
      userId: userId,
      username: username,
      password: hashedPassword,
      email: email,
      verifyCode: email_verification_code,
      loginHash: loginHash,
    });

    await newUser.save();

    sendVerificationEmail(username, email, email_verification_token, email_verification_code);

    const params = {
      content: `User with Username: ${username} and Email: ${email} has just registered!`
    };
    await fetch(DC_MONITORING_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    res.cookie('email_verification_token', email_verification_token, { maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Database error:', error);
    const params = {
      content: "ALERT: DATABASE ERROR!!"
    };
    await fetch(DC_MONITORING_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});





app.post('/api/sso/verify', async (req, res) => {
  const { email_verification_token, email_verification_code } = req.body;

  try {
    jwt.verify(email_verification_token, JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(400).json({ success: false, error: 'Verification token invalid, try a login to get a new verification token.'});
      }

      const userId = decoded.userId;
      const verifyCode = email_verification_code;

      try {
        const existingUserId = await userDB.findOne({ userId, verifyCode });

        if (existingUserId) {
          const access_token = jwt.sign({ userId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '12h' });
          await userDB.updateOne({ userId }, { $unset: { verifyCode: 1 } });
          res.clearCookie('email_verification_token');
          res.clearCookie('email_verification_code');
          res.cookie('access_token', access_token, { maxAge: 12 * 60 * 60 * 1000, path: '/' });
          res.status(200).json({ success: true})
        } else {
          return res.status(460).json({ success: false, error: 'Wrong verification code entered' });
        }
      } catch (error) {
        return res.status(500).json({ success: false, error: 'Database error' });
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});





app.all('/api/sso/confirmationlink/:email_verification_token/:email_verification_code', async (req, res) => {
  const { email_verification_token, email_verification_code } = req.params;

  try {
    jwt.verify(email_verification_token, JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(400).json({ success: false, error: 'Verification token invalid, try a login to get a new verification token.'});
      }

      const userId = decoded.userId;
      const verifyCode = email_verification_code;

      try {
        const existingUserId = await userDB.findOne({ userId, verifyCode });

        if (existingUserId) {
          const access_token = jwt.sign({ userId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '12h' });
          await userDB.updateOne({ userId }, { $unset: { verifyCode: 1 } });

          res.cookie('access_token', access_token, { maxAge: 12 * 60 * 60 * 1000, path: '/' });
          return res.status(200).json({ success: true})
        } else {
          return res.status(460).json({ success: false, error: 'Wrong verification code entered' });
        }
      } catch (error) {
        return res.status(500).json({ success: false, error: 'Database error' });
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

app.all('/api/sso/setresettokens/:password_reset_token/:password_reset_code', (req, res) => {
  const { password_reset_token, password_reset_code } = req.params;
    res.cookie('password_reset_token', password_reset_token, { maxAge: 1 * 60 * 60 * 1000, path: '/'});
    res.cookie('password_reset_code', password_reset_code, { maxAge: 1 * 60 * 60 * 1000, path: '/'});
    return res.redirect('/setpassword')
});


app.post('/api/sso/data/changepassword', async (req, res) => {
  try {
    const authorizationHeader = req.headers['authorization'];
    const { password } = req.body;
    const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&.()/^])([A-Za-z\d@$!%*?&.]{8,})$/;

    if (!authorizationHeader) {
      return res.status(400).json({ error: 'Authorization header missing' });
    }

    const tokenParts = authorizationHeader.split(' ');
    if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
      return res.status(400).json({ error: 'Invalid authorization header' });
    }

    if (!passwordPattern.test(password)) {
      return res.status(462).json({ success: false, error: 'Password doesn\'t meet our requirements' });
    }

    if (typeof password !== 'string' || password.length < 5) {
      return res.status(460).json({ success: false, error: 'Password must have at least 5 characters' });
    }

    if (typeof password !== 'string' || password.length > 23) {
      return res.status(461).json({ success: false, error: 'Password must not have more than 23 characters' });
    }

    const access_token = tokenParts[1];
    const decoded = jwt.verify(access_token, JWT_SECRET);
    const userId = decoded.userId;
    const loginHash = decoded.loginHash;

    const userData = await userDB.findOne({ userId: userId, loginHash: loginHash });
    if (!userData) {
      return res.status(404).json({ error: 'User data not found' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await userDB.updateOne({ userId }, { $set: { password: hashedPassword } });

    const newAccessToken = jwt.sign({ userId: userId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '12h' });

    res.cookie('access_token', newAccessToken, { maxAge: 12 * 60 * 60 * 1000, path: '/' });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error in changing password:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});




app.post('/api/sso/data/username', async (req, res) => {
  const authorizationHeader = req.headers['authorization'];

  if (!authorizationHeader) {
    return res.status(400).json({ error: 'Authorization header is missing' });
  }

  const tokenParts = authorizationHeader.split(' ');
  if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
    return res.status(400).json({ error: 'Invalid authorization header format' });
  }

  const access_token = tokenParts[1];

  try {
    const decoded = jwt.verify(access_token, JWT_SECRET);
    const userId = decoded.userId;
    const loginHash = decoded.loginHash;
    
    const userData = await userDB.findOne({ userId: userId, loginHash: loginHash });
    if (!userData) {
      return res.status(404).json({ error: 'User data not found' });
    }

    const username = userData.username;

    res.status(200).json({ success: true, username: username });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid access token' });
  }
});


app.post('/api/sso/auth/logout', async (req, res) => {
  const authorizationHeader = req.headers['authorization'];

  if (!authorizationHeader) {
    return res.status(400).json({ error: 'Authorization header is missing' });
  }

  const tokenParts = authorizationHeader.split(' ');
  if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
    return res.status(400).json({ error: 'Invalid authorization header format' });
  }

  const access_token = tokenParts[1];

  try {
    const decoded = jwt.verify(access_token, JWT_SECRET);
    const userId = decoded.userId;
    const loginHash = decoded.loginHash;
    
    const userData = await userDB.findOne({ userId: userId, loginHash: loginHash });
    if (!userData) {
      return res.status(404).json({ error: 'User data not found' });
    }

    await userDB.updateOne({ userId }, { $unset: { loginHash: 1 } });

    res.status(200).json({ success: true});
  } catch (err) {
    return res.status(401).json({ error: 'Invalid access token' });
  }
});



app.post('/api/sso/data/resetpassword', async (req, res) => {
  const { email } = req.body;

  try {
    const userData = await userDB.findOne({ email });
    if (!userData) {
      return res.status(404).json({ success: false, error: 'No account with this email' });
    }

    const userId = userData.userId;
    const username = userData.username;
    const password_reset_token = jwt.sign({ userId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
    const password_reset_code = Math.floor(100000 + Math.random() * 900000).toString();

    await userDB.updateOne({ userId }, { $set: { resetCode: password_reset_code } });

    try {
      const mailContent = `
      <!doctype html>
      <html>
      <head>
        <title></title>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <style type="text/css">
          body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
          p { display: block; margin: 13px 0; }
        </style>
      </head>
      <body style="background: #F9F9F9;">
        <div style="background-color: #F9F9F9;">
          <div style="margin: 0px auto; max-width: 640px; background: transparent;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="font-size: 0px; width: 100%; background: transparent;" align="center" border="0">
              <tbody>
                <tr>
                  <td style="text-align: center; vertical-align: top; direction: ltr; font-size: 0px; padding: 40px 0px;">
                    <div aria-labelledby="mj-column-per-100" class="mj-column-per-100" style="vertical-align: top; display: inline-block; direction: ltr; font-size: 13px; text-align: left; width: 100%;">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">
                        <tbody>
                          <tr>
                            <td style="word-break: break-word; font-size: 0px; padding: 0px;" align="center">
                              <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border-spacing: 0px;" align="center" border="0">
                                <tbody>
                                  <tr>
                                    <td style="width: 138px;"></td>
                                  </tr>
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style="max-width: 640px; margin: 0 auto; box-shadow: 0px 1px 5px rgba(0, 0, 0, 0.1); border-radius: 8px; overflow: hidden;">
            <div style="margin: 0px auto; max-width: 640px; background: #ffffff;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="font-size: 0px; width: 100%; background: #ffffff;" align="center" border="0">
                <tbody>
                  <tr>
                    <td style="text-align: center; vertical-align: top; direction: ltr; font-size: 0px; padding: 40px 50px;">
                      <div aria-labelledby="mj-column-per-100" class="mj-column-per-100" style="vertical-align: top; display: inline-block; direction: ltr; font-size: 13px; text-align: left; width: 100%;">
                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">
                          <tbody>
                            <tr>
                              <td style="word-break: break-word; font-size: 0px; padding: 0px;" align="left">
                                <div style="cursor: auto; color: #737F8D; font-family: Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif; font-size: 16px; line-height: 24px; text-align: left;">
                                  <h2 style="font-family: Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif; font-weight: 500; font-size: 20px; color: #4F545C; letter-spacing: 0.27px;">Hey ${username},</h2>
                                  <p>You requested to reset your password. Please enter the following code or click on this <a href=${URL}/api/sso/setresettokens/${password_reset_token}/${password_reset_code}>Link</a> to reset your password:</p>
                                </div>
                              </td>
                            </tr>
                            <tr>
                              <td style="word-break: break-word; font-size: 0px; padding: 10px 25px; padding-top: 20px;" align="center">
                                <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: separate;" align="center" border="0">
                                  <tbody>
                                    <tr>
                                      <td style="border: none; border-radius: 8px; cursor: auto; padding: 15px 105px;" align="center" valign="middle" bgcolor="#5865f2">
                                        <p style="font-size: 30px; font-family: Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif;">${password_reset_code}</p>
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div style="margin: 0px auto; max-width: 640px; background: transparent;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="font-size: 0px; width: 100%; background: transparent;" align="center" border="0">
              <tbody>
                <tr>
                  <td style="text-align: center; vertical-align: top; direction: ltr; font-size: 0px; padding: 20px 0px;">
                    <div aria-labelledby="mj-column-per-100" class="mj-column-per-100" style="vertical-align: top; display: inline-block; direction: ltr; font-size: 13px; text-align: left; width: 100%;">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">
                        <tbody>
                          <tr>
                            <td style="word-break: break-word; font-size: 0px; padding: 0px;" align="center">
                              <div style="cursor: auto; color: #99AAB5; font-family: Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif; font-size: 12px; line-height: 24px; text-align: center;">
                                Sent by Onedns
                              </div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </body>
      </html>
      `;

      const mailjet_connect = mailjet.apiConnect(MJ_APIKEY_PUBLIC, MJ_APIKEY_PRIVATE);
      await mailjet_connect.post('send', { version: 'v3.1' }).request({
        Messages: [
          {
            From: { Email: MJ_SENDER_EMAIL },
            To: [{ Email: email }],
            Subject: 'Your Password Recovery Code',
            HtmlPart: mailContent
          }
        ]
      });

      res.cookie('password_reset_token', password_reset_token, { maxAge: 1 * 60 * 60 * 1000, path: '/' });
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Mailjet error:', error);
      res.status(500).json({ error: 'Failed to send password reset email' });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});








app.post('/api/sso/data/setpassword', async (req, res) => {
  const { password, password_reset_token, password_reset_code } = req.body;
  const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&.()/^])([A-Za-z\d@$!%*?&.]{8,})$/;

  try {
    if (!passwordPattern.test(password)) {
      return res.status(462).json({ success: false, error: 'Password doesn\'t meet our requirements' });
    }

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(463).json({ success: false, error: 'Password must have at least 8 characters' });
    }

    if (typeof password !== 'string' || password.length > 23) {
      return res.status(464).json({ success: false, error: 'Password must not have more than 23 characters' });
    }

    try {
      const decoded = jwt.verify(password_reset_token, JWT_SECRET);

      const userId = decoded.userId;

      const userReset = await userDB.findOne({ userId: userId, resetCode: password_reset_code });
      if (!userReset) {
        return res.status(404).json({ error: 'User data not found' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newLoginHash = [...Array(15)].map(() => Math.random().toString(36)[2]).join('');

      await userDB.updateOne({ userId }, { $set: { password: hashedPassword, loginHash: newLoginHash } });
      await userDB.updateOne({ userId }, { $unset: { resetCode: 1 } });


      const access_token = jwt.sign({userId: userId, loginHash: newLoginHash}, JWT_SECRET, { algorithm: 'HS256', expiresIn: '12h' });
      res.clearCookie('password_reset_token');
      res.cookie('access_token', access_token, { maxAge: 12 * 60 * 60 * 1000, path: '/' });
      res.status(200).json({ success: true });

  
    } catch (err) {
      return res.status(401).json({ error: 'Invalid password reset token' });
    }
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});


app.get('/api/health', async (req, res) => {
  try {
    const collection = db.collection('users'); 
    const result = await collection.findOne({});

    if (!result) {
      return res.status(500).json({ error: 'Database error' });
    }

    const response = await fetch('https://google.com', { method: 'GET' });
    if (!response.ok) {
      return res.status(500).json({ error: 'Application has no connection to the internet' });
    }
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    res.status(500).json({ error: 'Application has encountered an error' });
  } finally {
  }
});





app.listen(API_PORT, () => {
  console.log('Login API started on port', API_PORT);
});