const express = require('express');
const jwt = require('jsonwebtoken');
const { notifyError } = require('../../../../notify/notifications.js');

const { userDB } = require('../../../../database/mongodb.js');

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
  const { email_verification_code } = req.body;
  const email_verification_token = req.cookies.email_verification_token;

  if (!email_verification_token) {
    return res.status(400).json({ success: false, error: 'Email verification token not found' });
  }

  jwt.verify(email_verification_token, JWT_PUBLIC_KEY, async (error, decoded) => {
    if (error) {
      return res.redirect('/login');
    }

    const userId = decoded.userId;
    const verifyCode = email_verification_code;

    const existingUserId = await userDB.findOne({ userId, verifyCode });

    if (!existingUserId) {
      return res.status(460).json({ success: false, error: 'Wrong verification code entered' });
    }

    const sid = [...Array(15)].map(() => Math.random().toString(36)[2]).join('');
    const oauthSid = [...Array(15)].map(() => Math.random().toString(36)[2]).join('');

    await userDB.updateOne({ userId }, {
      $set: { sid: sid, oauthSid: oauthSid, emailVerified: true },
      $unset: { verifyCode: 1 }
    });

    const access_token = jwt.sign({ userId: userId, sid: sid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });
    res.cookie('access_token', access_token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });
    return res.status(200).json({ success: true });
  });
});

module.exports = router;