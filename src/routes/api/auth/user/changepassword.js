const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { notifyError } = require('../../../../notify/notifications.js');

const { userDB } = require('../../../../database/database.js');

const router = express.Router();

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

router.post('/', async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const access_token = req.cookies.access_token;

  if (!access_token) {
    return res.status(400).json({ success: false, error: 'Access Token not found' });
  }

  const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\[\]{}|;:,.<>?])([A-Za-z\d!@#$%^&*()_+\[\]{}|;:,.<>?]{8,})$/;
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 10000 || !passwordPattern.test(newPassword)) {
    return res.status(460).json({ success: false, error: 'Password must have at least 8 characters, contain at least one uppercase letter, one lowercase letter, one digit, and one special character' });
  }

  jwt.verify(access_token, JWT_PUBLIC_KEY, async (error, decoded) => {
    if (error) {
      return res.redirect('/login');
    }
      
    const userId = decoded.userId;
    const sid = decoded.sid;

    const userData = await userDB.findOne({ userId: userId, sid: sid });
    if (!userData) {
      res.clearCookie('access_token');
      return res.redirect('/login');
    }

    if (userData.identityProvider !== 'local') {
      return res.status(460).json({ success: false, error: 'Password can only be changed for users with local authentication' });
    }

    const passwordMatch = await bcrypt.compare(currentPassword, userData.password);
    if (!passwordMatch) {
      return res.status(461).json({ success: false, error: 'Incorrect current Password' });
    }


    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const newsid = [...Array(15)].map(() => Math.random().toString(36)[2]).join('');
    const newOauthSid = [...Array(15)].map(() => Math.random().toString(36)[2]).join('');

    await userDB.updateOne({ userId }, { $set: { password: hashedPassword, sid: newsid, oauthSid: newOauthSid } });

    const newAccessToken = jwt.sign({ userId: userId, sid: newsid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });

    res.cookie('access_token', newAccessToken, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });
    res.status(200).json({ success: true });
  });
});

module.exports = router;