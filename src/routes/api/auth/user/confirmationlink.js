const express = require('express');
const jwt = require('jsonwebtoken');
const { notifyError } = require('../../../../notify/notifications.js');

const { userDB } = require('../../../../database/database.js');

const router = express.Router();

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

router.all('/:email_verification_token/:email_verification_code', async (req, res) => {
  try {
    const { email_verification_token, email_verification_code } = req.params;

    const decoded = await jwt.verify(email_verification_token, JWT_PRIVATE_KEY);

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

    const access_token = jwt.sign({ userId: userId, sid: sid }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '48h' });
    res.cookie('access_token', access_token, { maxAge: 48 * 60 * 60 * 1000, httpOnly: true, path: '/' });
    return res.redirect('/home');
  } catch (error) {
    notifyError(error);
    return res.status(500).json({ error: 'Something went wrong, try again later' });
  }
});

module.exports = router;