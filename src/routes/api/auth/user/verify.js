const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = process.env;
const { notifyError } = require('../../../../notify/notifications.js');

const { userDB } = require('../../../../database/database.js');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { email_verification_code } = req.body;
    const req_cookies = req.headers.cookie;

    if (!req_cookies) {
      return res.status(400).json({ success: false, error: 'Email verification token not found' });
    }

    const cookies = req_cookies.split(';').reduce((cookiesObj, cookie) => {
      const [name, value] = cookie.trim().split('=');
      cookiesObj[name] = value;
      return cookiesObj;
    }, {});

    const email_verification_token = cookies['email_verification_token'];

    const decoded = await jwt.verify(email_verification_token, JWT_SECRET);

    const userId = decoded.userId;
    const verifyCode = email_verification_code;

    const existingUserId = await userDB.findOne({ userId, verifyCode });

    if (!existingUserId) {
      return res.status(460).json({ success: false, error: 'Wrong verification code entered' });
    }

    const sid = [...Array(15)].map(() => Math.random().toString(36)[2]).join('');
    const oauthSid = [...Array(15)].map(() => Math.random().toString(36)[2]).join('');

    await userDB.updateOne({ userId }, {
      $set: { sid: sid, oauthSid: oauthSid },
      $unset: { verifyCode: 1 }
    });

    const access_token = jwt.sign({ userId: userId, sid: sid }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '48h' });
    res.cookie('access_token', access_token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });
    return res.status(200).json({ success: true });
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ success: false, error: 'Something went wrong, try again later' });
  }
});

module.exports = router;