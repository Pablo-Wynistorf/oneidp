const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = process.env;
const { notifyError, notifyLogin } = require('../../../../notify/notifications');

const { userDB } = require('../../../../database/database.js');

const router = express.Router();

router.post('/', async (req, res) => {
  const { username_or_email, password, redirectUri } = req.body;
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;

  try {
    let user;

    if (emailRegex.test(username_or_email)) {
      user = await userDB.findOne({ email: username_or_email });
    } else {
      user = await userDB.findOne({ username: username_or_email });
    }

    if (!user) {
      return res.status(462).json({ success: false, error: 'Invalid username or password' });
    }

    const storedPasswordHash = user.password;
    const userId = user.userId;
    const email_verification_code = user.verifyCode;
    const username = user.username;
    const email = user.email;
    const mfaEnabled = user.mfaEnabled;
    const sid = user.sid;

    const passwordMatch = await bcrypt.compare(password, storedPasswordHash);

    if (!passwordMatch) {
      return res.status(462).json({ success: false, error: 'Invalid username or password' });
    }

    if (email_verification_code) {
      const email_verification_token = jwt.sign({ userId: userId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });

      const new_email_verification_code = Math.floor(100000 + Math.random() * 900000).toString();
      await userDB.updateOne({ userId }, { $set: { verifyCode: new_email_verification_code } });

      res.cookie('email_verification_token', email_verification_token, { maxAge: 5 * 60 * 1000, httpOnly: true, path: '/' });
      res.status(461).json({ success: true, Message: 'Email not verified' });
      sendVerificationEmail(username, email, email_verification_token, new_email_verification_code, res);
    } else {
      loginSuccess(userId, username, sid, res, mfaEnabled, redirectUri);
    }
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

// Handle successful login and generate access tokens
async function loginSuccess(userId, username, sid, res, mfaEnabled, redirectUri) {
  if (!sid) {
    const newsid = [...Array(15)].map(() => Math.random().toString(36)[2]).join('');
    const newoAuthSid = [...Array(15)].map(() => Math.random().toString(36)[2]).join('');
    await userDB.updateOne({ userId }, { $set: { sid: newsid, oauthSid: newoAuthSid } });

    if (mfaEnabled === true) {
      const newMfaLoginSecret = [...Array(30)].map(() => Math.random().toString(36)[2]).join('');
      await userDB.updateOne({ userId }, { $set: { mfaLoginSecret: newMfaLoginSecret } });
      const mfa_token = jwt.sign({ userId: userId, mfaLoginSecret: newMfaLoginSecret }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
      res.cookie('mfa_token', mfa_token, { maxAge: 5 * 60 * 1000, httpOnly: true, path: '/' });
      return res.status(463).json({ success: true, message: 'Redirecting to mfa site', redirectUri });
    }

    notifyLogin(username);
    const token = jwt.sign({ userId: userId, sid: newsid }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '48h' });
    res.cookie('access_token', token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });
    return res.status(200).json({ success: true, redirectUri  });
  }

  if (mfaEnabled === true) {
    const newMfaLoginSecret = [...Array(30)].map(() => Math.random().toString(36)[2]).join('');
    await userDB.updateOne({ userId }, { $set: { mfaLoginSecret: newMfaLoginSecret } });
    const mfa_token = jwt.sign({ userId: userId, mfaLoginSecret: newMfaLoginSecret }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
    res.cookie('mfa_token', mfa_token, { maxAge: 5 * 60 * 1000, httpOnly: true, path: '/' });
    return res.status(463).json({ success: true, message: 'Redirecting to mfa site', redirectUri })
  }

  const token = jwt.sign({ userId: userId, sid: sid }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '48h' });
  notifyLogin(username);
  res.cookie('access_token', token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });

  return res.status(200).json({ success: true, redirectUri });
}

module.exports = router;