const express = require('express');
const jwt = require('jsonwebtoken');
const { URL } = process.env;

const { userDB } = require('../../../../database/database.js');

const router = express.Router();

const JWT_PRIVATE_KEY = `
-----BEGIN PRIVATE KEY-----
${process.env.JWT_PRIVATE_KEY}
-----END PRIVATE KEY-----
`.trim();

router.post('/', async (req, res) => {
  const { access_token } = req.body;
  jwt.verify(access_token, JWT_PRIVATE_KEY, async (error, decoded) => {
    if (error) {
      res.clearCookie('access_token');
      return res.redirect(`${URL}/login`);
    }

    const userId = decoded.userId;
    const sid = decoded.sid;

    try {
      const userData = await userDB.findOne({ userId: userId, sid: sid });
      if (!userData) {
        res.clearCookie('access_token');
        return res.redirect(`${URL}/login`);
      }
      res.clearCookie('email_verification_token');
      res.clearCookie('password_reset_token');
      res.clearCookie('password_reset_code');
      res.status(200).json({ success: true });
    } catch (error) {
      res.clearCookie('access_token');
      return res.redirect('/login');
    }
  });
});

module.exports = router;
